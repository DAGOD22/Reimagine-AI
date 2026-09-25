import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { ApiError } from "@/lib/server/errors";
import { getDb, newId, nowIso } from "@/lib/server/db";
import { requireProject } from "@/lib/server/projects";

const ALLOWED = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);

export type ProjectFileRow = {
  id: string;
  project_id: string;
  user_id: string;
  kind: string;
  file_path: string;
  mime_type: string;
  filename: string;
  size_bytes: number;
  extracted_text: string;
  created_at: string;
};

function safeFilename(value: string) {
  return path.basename(value).replace(/[^a-zA-Z0-9._ -]/g, "-").slice(0, 180) || "project-file";
}

function detectedMime(file: File, buffer: Buffer) {
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  const extension = path.extname(file.name).toLowerCase();
  const declaredText = file.type.startsWith("text/") || file.type === "application/json";
  const supportedTextExtension = [".txt", ".md", ".markdown", ".csv", ".json"].includes(extension);
  if (!declaredText && !supportedTextExtension) return null;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return null;
  }
  if (buffer.includes(0)) return null;
  let controls = 0;
  for (const byte of buffer) if (byte < 9 || (byte > 13 && byte < 32)) controls += 1;
  if (buffer.length && controls / buffer.length > 0.01) return null;
  if (extension === ".json" || file.type === "application/json") return "application/json";
  if (extension === ".csv" || file.type === "text/csv") return "text/csv";
  if ([".md", ".markdown"].includes(extension) || file.type === "text/markdown") return "text/markdown";
  return "text/plain";
}

export async function saveProjectFile(input: { userId: string; projectId: string; file: File }) {
  requireProject(input.projectId, input.userId);
  const maxBytes = Number(process.env.MAX_UPLOAD_MB || 10) * 1024 * 1024;
  if (!input.file.size || input.file.size > maxBytes) {
    throw new ApiError(413, "FILE_TOO_LARGE", `Files must be smaller than ${Math.round(maxBytes / 1024 / 1024)} MB.`, "validation", true);
  }
  const buffer = Buffer.from(await input.file.arrayBuffer());
  const mimeType = detectedMime(input.file, buffer);
  if (!mimeType || !ALLOWED.has(mimeType)) {
    throw new ApiError(
      415,
      "UNSUPPORTED_FILE_TYPE",
      "Use a valid PDF, UTF-8 TXT, Markdown, CSV, or JSON project file.",
      "validation",
      true,
    );
  }
  const id = newId("fil");
  const extension = mimeType === "application/pdf" ? ".pdf" : path.extname(input.file.name).slice(0, 10) || ".txt";
  const directory = path.join(process.cwd(), "data", "files", input.userId, input.projectId);
  const filePath = path.join(directory, `${id}${extension}`);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(filePath, buffer, { mode: 0o600 });
  const extractedText = mimeType === "application/pdf"
    ? ""
    : buffer.toString("utf8").replace(/\u0000/g, "").slice(0, 80_000);
  const createdAt = nowIso();
  getDb().prepare(
    `INSERT INTO project_files
     (id, project_id, user_id, kind, file_path, mime_type, filename, size_bytes, extracted_text, created_at)
     VALUES (?, ?, ?, 'document', ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.projectId, input.userId, filePath, mimeType, safeFilename(input.file.name), buffer.length, extractedText, createdAt);
  getDb().prepare("UPDATE projects SET updated_at = ? WHERE id = ? AND user_id = ?").run(createdAt, input.projectId, input.userId);
  return {
    id,
    filename: safeFilename(input.file.name),
    mimeType,
    sizeBytes: buffer.length,
    hasExtractedText: Boolean(extractedText),
    downloadUrl: `/api/files/${id}`,
    createdAt,
  };
}

export function getProjectFileRows(projectId: string, userId: string) {
  return getDb().prepare("SELECT * FROM project_files WHERE project_id = ? AND user_id = ? ORDER BY created_at ASC").all(projectId, userId) as ProjectFileRow[];
}

export function getProjectFileRow(id: string, userId: string) {
  return getDb().prepare("SELECT * FROM project_files WHERE id = ? AND user_id = ?").get(id, userId) as ProjectFileRow | undefined;
}

export async function deleteProjectFile(id: string, userId: string) {
  const row = getProjectFileRow(id, userId);
  if (!row) throw new ApiError(404, "FILE_NOT_FOUND", "The project file could not be found.", "not_found");
  getDb().prepare("DELETE FROM project_files WHERE id = ? AND user_id = ?").run(id, userId);
  await fs.unlink(row.file_path).catch(() => undefined);
}
