import "server-only";

import fs from "node:fs/promises";
import { fal } from "@fal-ai/client";
import type { NextRequest } from "next/server";
import { getDb, newId, nowIso } from "@/lib/server/db";
import { ApiError, asApiError } from "@/lib/server/errors";
import { generationPromptSchema } from "@/lib/server/ai-schemas";
import { generationPrompt as buildGenerationPrompt } from "@/lib/server/ai-prompts";
import { callOpenRouter } from "@/lib/server/openrouter";
import { createMediaToken, getPublicOrigin } from "@/lib/server/security";
import { getImageRow, getLatestOriginal, getReferenceImages, saveImageBuffer } from "@/lib/server/images";
import { recordAiStatus } from "@/lib/server/ai-status";
import { requireProject } from "@/lib/server/projects";
import { safeJsonParse } from "@/lib/utils";
import type { RenovationPlan, SpaceAnalysis } from "@/lib/types";

type GenerationPrompt = {
  prompt: string;
  preserve: string[];
  change: string[];
  negativeInstructions: string[];
};

type ImageRow = NonNullable<ReturnType<typeof getImageRow>>;

type ProviderResult = { buffer: Buffer; provider: string; requestId?: string };

function mapImageProviderError(error: unknown, provider: string): ApiError {
  if (error instanceof ApiError) return error;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("401") || message.includes("403") || message.includes("unauthorized") || message.includes("forbidden")) {
    return new ApiError(502, "IMAGE_PROVIDER_AUTH_FAILED", `${provider} rejected the server credential.`, "provider_authentication", false);
  }
  if (message.includes("429") || message.includes("rate")) {
    return new ApiError(429, "IMAGE_PROVIDER_RATE_LIMIT", `${provider} is rate-limiting image edits. Please wait and try again.`, "rate_limit", true);
  }
  if (message.includes("timeout") || message.includes("aborted")) {
    return new ApiError(504, "IMAGE_GENERATION_TIMEOUT", `${provider} took too long to generate the redesign.`, "network", true);
  }
  return new ApiError(502, "IMAGE_GENERATION_FAILED", `${provider} could not generate the redesigned image.`, "image_generation", true);
}

async function downloadImage(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!response.ok) throw new Error(`Output download failed with ${response.status}`);
  const type = response.headers.get("content-type") || "";
  if (!type.startsWith("image/")) throw new Error("Provider output was not an image");
  const length = Number(response.headers.get("content-length") || 0);
  if (length > 25 * 1024 * 1024) throw new Error("Provider output exceeds 25MB");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 25 * 1024 * 1024) throw new Error("Provider output exceeds 25MB");
  return buffer;
}

async function runFal(prompt: string, rows: ImageRow[]): Promise<ProviderResult> {
  const key = process.env.FAL_KEY;
  if (!key) {
    throw new ApiError(503, "FAL_KEY_MISSING", "FAL_KEY is required when IMAGE_PROVIDER is set to fal.", "missing_api_key", false);
  }
  fal.config({ credentials: key });
  const imageUrls: string[] = [];
  for (const row of rows.slice(0, 5)) {
    const buffer = await fs.readFile(row.file_path);
    const blob = new Blob([new Uint8Array(buffer)], { type: row.mime_type });
    imageUrls.push(await fal.storage.upload(blob));
  }
  const result = await fal.subscribe("fal-ai/flux-2-pro/edit", {
    input: {
      prompt,
      image_urls: imageUrls,
      image_size: "auto",
      output_format: "jpeg",
      safety_tolerance: "2",
      enable_safety_checker: true,
    },
  });
  const data = result.data as { images?: Array<{ url?: string }> };
  const outputUrl = data.images?.[0]?.url;
  if (!outputUrl) throw new Error("FAL response did not contain an image URL");
  return { buffer: await downloadImage(outputUrl), provider: "fal / FLUX.2 Pro", requestId: result.requestId };
}

function signedMediaUrl(request: NextRequest, row: ImageRow) {
  const token = createMediaToken(row.id, Date.now() + 15 * 60 * 1000);
  return `${getPublicOrigin(request)}/api/media/${row.id}?token=${encodeURIComponent(token)}`;
}

async function runPollinations(request: NextRequest, prompt: string, rows: ImageRow[]): Promise<ProviderResult> {
  const origin = getPublicOrigin(request);
  if (/localhost|127\.0\.0\.1/.test(origin)) {
    throw new ApiError(
      503,
      "PUBLIC_APP_URL_REQUIRED",
      "The community image editor needs a public APP_URL so it can securely fetch the source image. Use the live preview URL or configure FAL_KEY.",
      "image_generation",
      true,
    );
  }
  const urls = rows.slice(0, 4).map((row) => signedMediaUrl(request, row));
  const key = process.env.POLLINATIONS_API_KEY;
  const started = Date.now();

  if (key) {
    const response = await fetch("https://gen.pollinations.ai/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "black-forest-labs/flux-2-dev",
        prompt: prompt.slice(0, 12_000),
        image: urls,
        n: 1,
        quality: "high",
        response_format: "url",
        safe: true,
      }),
      signal: AbortSignal.timeout(300_000),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      data?: Array<{ url?: string; b64_json?: string }>;
      error?: { message?: string };
    };
    if (!response.ok) throw new Error(`Pollinations ${response.status}: ${payload.error?.message || "request failed"}`);
    const item = payload.data?.[0];
    if (item?.b64_json) return { buffer: Buffer.from(item.b64_json, "base64"), provider: "Pollinations / FLUX edit" };
    if (item?.url) return { buffer: await downloadImage(item.url), provider: "Pollinations / FLUX edit" };
    throw new Error("Pollinations response did not contain image data");
  }

  const endpoint = new URL(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 2800))}`);
  endpoint.searchParams.set("model", "kontext");
  endpoint.searchParams.set("width", String(Math.min(rows[0]?.width || 1280, 1600)));
  endpoint.searchParams.set("height", String(Math.min(rows[0]?.height || 1024, 1600)));
  endpoint.searchParams.set("safe", "true");
  endpoint.searchParams.set("seed", String(Math.floor(Math.random() * 2_147_483_647)));
  for (const url of urls) endpoint.searchParams.append("image", url);
  const response = await fetch(endpoint, {
    headers: { Accept: "image/*", "User-Agent": "Hearthform/1.0" },
    signal: AbortSignal.timeout(300_000),
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`Pollinations ${response.status}`);
  const type = response.headers.get("content-type") || "";
  if (!type.startsWith("image/")) throw new Error("Pollinations returned a non-image response");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > 25 * 1024 * 1024) throw new Error("Pollinations returned invalid image data");
  return {
    buffer,
    provider: "Pollinations community / Kontext",
    requestId: response.headers.get("x-request-id") || `community-${started}`,
  };
}

function loadContext(projectId: string, userId: string) {
  const db = getDb();
  const analysisRow = db
    .prepare("SELECT payload_json FROM analyses WHERE project_id = ? AND user_id = ? AND kind = 'space' ORDER BY created_at DESC LIMIT 1")
    .get(projectId, userId) as { payload_json: string } | undefined;
  const planRow = db
    .prepare("SELECT id, payload_json FROM renovation_plans WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(projectId, userId) as { id: string; payload_json: string } | undefined;
  if (!analysisRow || !planRow) {
    throw new ApiError(400, "ANALYSIS_AND_PLAN_REQUIRED", "Create the AI space analysis and renovation plan before generating a redesign.", "validation", true);
  }
  return {
    analysis: safeJsonParse<SpaceAnalysis>(analysisRow.payload_json, {} as SpaceAnalysis),
    plan: safeJsonParse<RenovationPlan>(planRow.payload_json, {} as RenovationPlan),
    planId: planRow.id,
  };
}

export async function generateRedesign(input: {
  request: NextRequest;
  userId: string;
  projectId: string;
  instructions: string;
  baseImageId?: string;
  point?: { x: number; y: number; label?: string };
}) {
  const project = requireProject(input.projectId, input.userId);
  const context = loadContext(input.projectId, input.userId);
  const base = input.baseImageId ? getImageRow(input.baseImageId, input.userId) : getLatestOriginal(input.projectId, input.userId);
  if (!base || base.project_id !== input.projectId) {
    throw new ApiError(400, "BASE_IMAGE_REQUIRED", "The source image for this redesign could not be found.", "invalid_image", true);
  }
  const references = getReferenceImages(input.projectId, input.userId);
  const iteration = base.kind === "generated";
  const brain = await callOpenRouter<GenerationPrompt>({
    userId: input.userId,
    projectId: input.projectId,
    task: iteration ? "iteration_prompt" : "image_prompt",
    prompt: buildGenerationPrompt({
      instructions: input.instructions || project.instructions,
      analysis: context.analysis,
      plan: context.plan,
      iteration,
      point: input.point,
    }),
    images: [
      { path: base.file_path, mimeType: base.mime_type, label: iteration ? "CURRENT GENERATED VERSION TO EDIT" : "ORIGINAL SPACE PHOTOGRAPH TO EDIT" },
      ...references.map((row, index) => ({ path: row.file_path, mimeType: row.mime_type, label: `REFERENCE INSPIRATION ${index + 1}` })),
    ],
    schema: generationPromptSchema,
  });
  const finalPrompt = `${brain.data.prompt}\nPreserve: ${brain.data.preserve.join("; ")}.\nChange: ${brain.data.change.join("; ")}.\nAvoid: ${brain.data.negativeInstructions.join("; ")}.`;
  const providerSetting = (process.env.IMAGE_PROVIDER || "pollinations").toLowerCase();
  const providerLabel = providerSetting === "fal" ? "FAL" : "Pollinations";
  const started = Date.now();
  recordAiStatus({ userId: input.userId, projectId: input.projectId, task: iteration ? "image_edit" : "image_generation", status: "running", provider: providerLabel, model: providerSetting === "fal" ? "fal-ai/flux-2-pro/edit" : "kontext", imageCount: 1 + references.length });

  let versionId = "";
  try {
    const db = getDb();
    const version = db.transaction(() => {
      const next = (db.prepare("SELECT COALESCE(MAX(number), 0) + 1 AS next FROM versions WHERE project_id = ?").get(input.projectId) as { next: number }).next;
      const id = newId("ver");
      db.prepare("INSERT INTO versions (id, project_id, user_id, number, image_id, parent_id, prompt, provider, plan_id, created_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)")
        .run(id, input.projectId, input.userId, next, iteration ? base.version_id : null, input.instructions, providerLabel, context.planId, nowIso());
      return { id, number: next };
    })();
    versionId = version.id;

    const providerResult = providerSetting === "fal"
      ? await runFal(finalPrompt, [base, ...references])
      : await runPollinations(input.request, finalPrompt, [base, ...references]);
    const saved = await saveImageBuffer({
      userId: input.userId,
      projectId: input.projectId,
      kind: "generated",
      buffer: providerResult.buffer,
      originalFilename: `hearthform-version-${version.number}.jpg`,
      versionId,
    });
    db.prepare("UPDATE versions SET image_id = ?, provider = ? WHERE id = ? AND user_id = ?").run(saved.id, providerResult.provider, versionId, input.userId);
    const latencyMs = Date.now() - started;
    recordAiStatus({ userId: input.userId, projectId: input.projectId, task: iteration ? "image_edit" : "image_generation", status: "success", provider: providerResult.provider, model: providerSetting === "fal" ? "fal-ai/flux-2-pro/edit" : "kontext", latencyMs, imageCount: 1 + references.length, requestId: providerResult.requestId });
    return {
      version: {
        id: versionId,
        number: version.number,
        imageId: saved.id,
        imageUrl: saved.url,
        thumbnailUrl: saved.thumbnailUrl,
        parentId: iteration ? base.version_id : null,
        prompt: input.instructions,
        provider: providerResult.provider,
        createdAt: saved.createdAt,
      },
      generationPrompt: brain.data,
    };
  } catch (cause) {
    if (versionId) getDb().prepare("DELETE FROM versions WHERE id = ? AND image_id IS NULL").run(versionId);
    const error = mapImageProviderError(cause, providerLabel);
    recordAiStatus({ userId: input.userId, projectId: input.projectId, task: iteration ? "image_edit" : "image_generation", status: "error", provider: providerLabel, model: providerSetting === "fal" ? "fal-ai/flux-2-pro/edit" : "kontext", error, latencyMs: Date.now() - started, imageCount: 1 + references.length });
    throw asApiError(error);
  }
}
