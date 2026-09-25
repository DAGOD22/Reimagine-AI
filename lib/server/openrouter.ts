import "server-only";

import fs from "node:fs/promises";
import { OPENROUTER_MODEL } from "@/lib/constants";
import { parseStructuredJson, StructuredResponseError } from "@/lib/ai/parse";
import { getDb } from "@/lib/server/db";
import { recordAiStatus } from "@/lib/server/ai-status";
import { type AiSchema } from "@/lib/server/ai-schemas";
import { ApiError, asApiError } from "@/lib/server/errors";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

type VisionImage = { path: string; mimeType: string; label: string };
type ProjectDocument = {
  path: string;
  mimeType: string;
  label: string;
  filename: string;
  extractedText?: string;
};

type OpenRouterResponse = {
  id?: string;
  choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  error?: { message?: string; code?: string | number };
};

function providerError(status: number, message: string): ApiError {
  const lower = message.toLowerCase();
  if (status === 401 || status === 403) {
    return new ApiError(502, "OPENROUTER_AUTH_FAILED", "OpenRouter rejected the server API key.", "provider_authentication", false, {
      providerStatus: status,
    });
  }
  if (status === 429) {
    return new ApiError(429, "OPENROUTER_RATE_LIMIT", "OpenRouter's free-model rate limit was reached. Please wait and try again.", "rate_limit", true, {
      providerStatus: status,
    });
  }
  if (status === 404 || lower.includes("model") && (lower.includes("not found") || lower.includes("no endpoints"))) {
    return new ApiError(502, "OPENROUTER_INVALID_MODEL", `The configured OpenRouter model (${OPENROUTER_MODEL}) is unavailable.`, "invalid_model", true, {
      providerStatus: status,
    });
  }
  if (status === 400 || status === 413 || status === 415 || status === 422) {
    const imageRelated = lower.includes("image") || lower.includes("media") || lower.includes("base64") || status === 413 || status === 415;
    return new ApiError(
      422,
      imageRelated ? "OPENROUTER_INVALID_IMAGE" : "OPENROUTER_INVALID_REQUEST",
      imageRelated
        ? "OpenRouter could not process one of the uploaded images. Try a smaller JPEG or PNG."
        : "OpenRouter rejected the analysis request.",
      imageRelated ? "invalid_image" : "validation",
      true,
      { providerStatus: status },
    );
  }
  return new ApiError(502, "OPENROUTER_API_FAILURE", "OpenRouter could not complete the request.", "network", true, {
    providerStatus: status,
  });
}

function extractContent(response: OpenRouterResponse) {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => part.text || "").join("");
  return "";
}

export function parseModelJson(raw: string): unknown {
  try {
    return parseStructuredJson(raw);
  } catch (error) {
    if (error instanceof StructuredResponseError) {
      throw new ApiError(
        502,
        "OPENROUTER_MALFORMED_RESPONSE",
        "OpenRouter returned a response that was not valid structured JSON.",
        "malformed_response",
        true,
      );
    }
    throw error;
  }
}

async function repairStructuredOutput(input: {
  key: string;
  raw: string;
  taskPrompt: string;
  issues: string[];
}) {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL || "https://hearthform.local",
      "X-Title": "Hearthform",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [{
        role: "user",
        content: `Repair the invalid structured response below. Return only one valid JSON object, with no markdown or commentary. Preserve grounded facts and do not invent missing observations. Follow the original required shape.\n\nORIGINAL TASK AND SHAPE:\n${input.taskPrompt.slice(0, 12_000)}\n\nVALIDATION ISSUES:\n${input.issues.slice(0, 20).join("\n")}\n\nINVALID RESPONSE:\n${input.raw.slice(0, 35_000)}`,
      }],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 7000,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw providerError(response.status, "Structured response repair failed");
  const payload = (await response.json().catch(() => ({}))) as OpenRouterResponse;
  const repaired = extractContent(payload);
  if (!repaired) throw new ApiError(502, "OPENROUTER_EMPTY_REPAIR", "OpenRouter could not repair its structured response.", "malformed_response", true);
  return repaired;
}

export async function callOpenRouter<T>(input: {
  userId: string;
  projectId?: string;
  task: string;
  prompt: string;
  images?: VisionImage[];
  files?: ProjectDocument[];
  schema: AiSchema;
}): Promise<{ data: T; raw: string; requestId?: string; latencyMs: number }> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    const error = new ApiError(
      503,
      "OPENROUTER_API_KEY_MISSING",
      "OPENROUTER_API_KEY is not configured on the server.",
      "missing_api_key",
      false,
    );
    recordAiStatus({ userId: input.userId, projectId: input.projectId, task: input.task, status: "error", provider: "OpenRouter", model: OPENROUTER_MODEL, error });
    throw error;
  }

  const started = Date.now();
  const attachmentCount = (input.images?.length || 0) + (input.files?.length || 0);
  recordAiStatus({
    userId: input.userId,
    projectId: input.projectId,
    task: input.task,
    status: "running",
    provider: "OpenRouter",
    model: OPENROUTER_MODEL,
    imageCount: attachmentCount,
  });

  const preferences = getDb()
    .prepare("SELECT units, ai_detail FROM preferences WHERE user_id = ?")
    .get(input.userId) as { units: string; ai_detail: string } | undefined;
  const preferenceContext = preferences
    ? `\n\nUSER PREFERENCES: Use ${preferences.units} terminology where units are relevant, without inventing measurements. Response detail is ${preferences.ai_detail}; keep the required JSON shape unchanged.`
    : "";
  const content: Array<Record<string, unknown>> = [{ type: "text", text: `${input.prompt}${preferenceContext}` }];
  for (const image of input.images || []) {
    const bytes = await fs.readFile(image.path);
    content.push({ type: "text", text: image.label });
    content.push({
      type: "image_url",
      image_url: { url: `data:${image.mimeType};base64,${bytes.toString("base64")}`, detail: "high" },
    });
  }
  for (const file of input.files || []) {
    if (file.extractedText) {
      content.push({
        type: "text",
        text: `${file.label} (${file.filename}):\n${file.extractedText.slice(0, 80_000)}`,
      });
    } else {
      const bytes = await fs.readFile(file.path);
      content.push({ type: "text", text: file.label });
      content.push({
        type: "file",
        file: {
          filename: file.filename,
          file_data: `data:${file.mimeType};base64,${bytes.toString("base64")}`,
        },
      });
    }
  }

  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.APP_URL || "https://hearthform.local",
        "X-Title": "Hearthform",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [{ role: "user", content }],
        response_format: { type: "json_object" },
        reasoning: { effort: process.env.OPENROUTER_REASONING_EFFORT || "high", exclude: true },
        provider: { allow_fallbacks: true, require_parameters: true },
        plugins: [
          { id: "response-healing" },
          ...(input.files?.some((file) => file.mimeType === "application/pdf")
            ? [{ id: "file-parser", pdf: { engine: "cloudflare-ai" } }]
            : []),
        ],
        temperature: 0.15,
        max_tokens: 16_000,
      }),
      signal: AbortSignal.timeout(150_000),
    });
  } catch (cause) {
    const timeout = cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError");
    const error = new ApiError(
      504,
      timeout ? "OPENROUTER_TIMEOUT" : "OPENROUTER_NETWORK_FAILURE",
      timeout ? "OpenRouter took too long to respond." : "The server could not reach OpenRouter.",
      "network",
      true,
    );
    recordAiStatus({ userId: input.userId, projectId: input.projectId, task: input.task, status: "error", provider: "OpenRouter", model: OPENROUTER_MODEL, error, latencyMs: Date.now() - started, imageCount: attachmentCount });
    throw error;
  }

  const requestId = response.headers.get("x-request-id") || response.headers.get("x-openrouter-request-id") || undefined;
  const body = (await response.json().catch(() => ({}))) as OpenRouterResponse;
  if (!response.ok) {
    const error = providerError(response.status, body.error?.message || "Provider request failed");
    recordAiStatus({ userId: input.userId, projectId: input.projectId, task: input.task, status: "error", provider: "OpenRouter", model: OPENROUTER_MODEL, error, httpStatus: response.status, latencyMs: Date.now() - started, imageCount: attachmentCount, requestId });
    throw error;
  }

  const raw = extractContent(body);
  try {
    if (!raw) {
      throw new ApiError(502, "OPENROUTER_EMPTY_RESPONSE", "OpenRouter returned an empty response.", "malformed_response", true);
    }
    let effectiveRaw = raw;
    let parsed: unknown;
    let issueMessages: string[] = [];
    try {
      parsed = parseModelJson(effectiveRaw);
    } catch {
      parsed = null;
      issueMessages = ["Response is not valid JSON."];
    }
    let validated = input.schema.safeParse(parsed);
    if (!validated.success) {
      issueMessages = [
        ...issueMessages,
        ...validated.error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`),
      ];
      recordAiStatus({ userId: input.userId, projectId: input.projectId, task: `${input.task}_repair`, status: "running", provider: "OpenRouter", model: OPENROUTER_MODEL, imageCount: 0 });
      effectiveRaw = await repairStructuredOutput({
        key,
        raw,
        taskPrompt: input.prompt,
        issues: issueMessages,
      });
      validated = input.schema.safeParse(parseModelJson(effectiveRaw));
      if (!validated.success) {
        throw new ApiError(
          502,
          "OPENROUTER_SCHEMA_MISMATCH",
          "OpenRouter returned structured data in an unexpected format after one repair attempt.",
          "malformed_response",
          true,
          { issueCount: validated.error.issues.length },
        );
      }
      recordAiStatus({ userId: input.userId, projectId: input.projectId, task: `${input.task}_repair`, status: "success", provider: "OpenRouter", model: OPENROUTER_MODEL, latencyMs: Date.now() - started, imageCount: 0 });
    }
    const latencyMs = Date.now() - started;
    recordAiStatus({ userId: input.userId, projectId: input.projectId, task: input.task, status: "success", provider: "OpenRouter", model: OPENROUTER_MODEL, latencyMs, imageCount: attachmentCount, requestId });
    return { data: validated.data as T, raw: effectiveRaw, requestId, latencyMs };
  } catch (cause) {
    const error = asApiError(cause);
    recordAiStatus({ userId: input.userId, projectId: input.projectId, task: input.task, status: "error", provider: "OpenRouter", model: OPENROUTER_MODEL, error, latencyMs: Date.now() - started, imageCount: attachmentCount, requestId });
    throw error;
  }
}
