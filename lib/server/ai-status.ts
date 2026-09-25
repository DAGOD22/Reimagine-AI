import "server-only";

import { getDb, newId, nowIso } from "@/lib/server/db";
import type { ApiError } from "@/lib/server/errors";

export function recordAiStatus(input: {
  userId: string;
  projectId?: string;
  task: string;
  status: "running" | "success" | "error";
  provider: string;
  model?: string;
  httpStatus?: number;
  error?: ApiError;
  latencyMs?: number;
  imageCount?: number;
  requestId?: string;
}) {
  const id = newId("air");
  getDb()
    .prepare(
      `INSERT INTO ai_requests
       (id, user_id, project_id, task, status, provider, model, http_status, error_code, error_message, latency_ms, image_count, request_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.userId,
      input.projectId || null,
      input.task,
      input.status,
      input.provider,
      input.model || null,
      input.httpStatus || input.error?.status || null,
      input.error?.code || null,
      input.error?.message || null,
      input.latencyMs || null,
      input.imageCount || 0,
      input.requestId || null,
      nowIso(),
    );
  return id;
}
