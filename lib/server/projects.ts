import "server-only";

import { ApiError } from "@/lib/server/errors";
import { getDb } from "@/lib/server/db";
import { safeJsonParse } from "@/lib/utils";
import type {
  AiStatus,
  BudgetPlan,
  ProductCategory,
  ProjectDetail,
  RenovationPlan,
  SpaceAnalysis,
} from "@/lib/types";

type ProjectRow = {
  id: string;
  user_id: string;
  name: string;
  room_type: ProjectDetail["roomType"];
  status: string;
  instructions: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

type ImageRow = {
  id: string;
  kind: "original" | "reference" | "generated";
  filename: string;
  width: number;
  height: number;
  size_bytes: number;
  version_id: string | null;
  created_at: string;
};

export function requireProject(projectId: string, userId: string): ProjectRow {
  const row = getDb().prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?").get(projectId, userId) as
    | ProjectRow
    | undefined;
  if (!row) throw new ApiError(404, "PROJECT_NOT_FOUND", "This project could not be found.", "not_found");
  return row;
}

export function serializeProject(projectId: string, userId: string): ProjectDetail {
  const db = getDb();
  const project = requireProject(projectId, userId);
  const images = db
    .prepare("SELECT id, kind, filename, width, height, size_bytes, version_id, created_at FROM project_images WHERE project_id = ? AND user_id = ? ORDER BY created_at ASC")
    .all(projectId, userId) as ImageRow[];
  const files = db
    .prepare("SELECT id, filename, mime_type, size_bytes, extracted_text, created_at FROM project_files WHERE project_id = ? AND user_id = ? ORDER BY created_at ASC")
    .all(projectId, userId) as Array<{ id: string; filename: string; mime_type: string; size_bytes: number; extracted_text: string; created_at: string }>;
  const analysis = db
    .prepare("SELECT payload_json FROM analyses WHERE project_id = ? AND user_id = ? AND kind = 'space' ORDER BY created_at DESC LIMIT 1")
    .get(projectId, userId) as { payload_json: string } | undefined;
  const plan = db
    .prepare("SELECT payload_json FROM renovation_plans WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(projectId, userId) as { payload_json: string } | undefined;
  const budget = db
    .prepare("SELECT payload_json FROM budgets WHERE project_id = ? AND user_id = ? ORDER BY updated_at DESC LIMIT 1")
    .get(projectId, userId) as { payload_json: string } | undefined;
  const products = db
    .prepare("SELECT payload_json FROM product_recommendations WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(projectId, userId) as { payload_json: string } | undefined;
  const versions = db
    .prepare(
      `SELECT v.*, i.id AS resolved_image_id
       FROM versions v LEFT JOIN project_images i ON i.id = v.image_id
       WHERE v.project_id = ? AND v.user_id = ? ORDER BY v.number ASC`,
    )
    .all(projectId, userId) as Array<{
    id: string;
    number: number;
    image_id: string | null;
    resolved_image_id: string | null;
    parent_id: string | null;
    prompt: string;
    provider: string;
    created_at: string;
  }>;
  const statuses = db
    .prepare("SELECT * FROM ai_requests WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 12")
    .all(projectId, userId) as Array<Record<string, unknown>>;

  return {
    id: project.id,
    name: project.name,
    roomType: project.room_type,
    status: project.status,
    instructions: project.instructions,
    notes: project.notes,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
    images: images.map((image) => ({
      id: image.id,
      kind: image.kind,
      url: `/api/media/${image.id}`,
      thumbnailUrl: `/api/media/${image.id}?thumbnail=1`,
      filename: image.filename,
      width: image.width,
      height: image.height,
      sizeBytes: image.size_bytes,
      versionId: image.version_id,
      createdAt: image.created_at,
    })),
    files: files.map((file) => ({
      id: file.id,
      filename: file.filename,
      mimeType: file.mime_type,
      sizeBytes: file.size_bytes,
      hasExtractedText: Boolean(file.extracted_text),
      downloadUrl: `/api/files/${file.id}`,
      createdAt: file.created_at,
    })),
    analysis: analysis ? safeJsonParse<SpaceAnalysis | null>(analysis.payload_json, null) : null,
    plan: plan ? safeJsonParse<RenovationPlan | null>(plan.payload_json, null) : null,
    budget: budget ? safeJsonParse<BudgetPlan | null>(budget.payload_json, null) : null,
    products: products ? safeJsonParse<ProductCategory[] | null>(products.payload_json, null) : null,
    versions: versions
      .filter((version) => version.resolved_image_id)
      .map((version) => ({
        id: version.id,
        number: version.number,
        imageId: version.resolved_image_id!,
        imageUrl: `/api/media/${version.resolved_image_id}`,
        thumbnailUrl: `/api/media/${version.resolved_image_id}?thumbnail=1`,
        parentId: version.parent_id,
        prompt: version.prompt,
        provider: version.provider,
        createdAt: version.created_at,
      })),
    aiStatuses: statuses.map(
      (status): AiStatus => ({
        id: String(status.id),
        task: String(status.task),
        status: status.status as AiStatus["status"],
        provider: String(status.provider),
        model: status.model ? String(status.model) : undefined,
        code: status.error_code ? String(status.error_code) : undefined,
        message: status.error_message ? String(status.error_message) : undefined,
        httpStatus: status.http_status ? Number(status.http_status) : undefined,
        latencyMs: status.latency_ms ? Number(status.latency_ms) : undefined,
        imageCount: Number(status.image_count || 0),
        requestId: status.request_id ? String(status.request_id) : undefined,
        timestamp: String(status.created_at),
      }),
    ),
  };
}
