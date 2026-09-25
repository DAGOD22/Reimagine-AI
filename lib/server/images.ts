import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import sharp, { type Metadata } from "sharp";
import { ApiError } from "@/lib/server/errors";
import { getDb, newId, nowIso } from "@/lib/server/db";
import { requireProject } from "@/lib/server/projects";

const MAX_PIXELS = 30_000_000;
const ALLOWED_INPUT_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);

type ImageRow = {
  id: string;
  project_id: string;
  user_id: string;
  kind: "original" | "reference" | "generated";
  file_path: string;
  thumbnail_path: string;
  mime_type: string;
  width: number;
  height: number;
  filename: string;
  size_bytes: number;
  version_id: string | null;
  created_at: string;
};

function uploadsRoot() {
  return path.resolve(process.cwd(), "data", "uploads");
}

function validateMagic(buffer: Buffer) {
  const isJpeg = buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isWebp = buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  const isGif = buffer.subarray(0, 6).toString("ascii").startsWith("GIF8");
  const isAvif = buffer.subarray(4, 12).toString("ascii").includes("ftyp");
  if (!isJpeg && !isPng && !isWebp && !isGif && !isAvif) {
    throw new ApiError(400, "INVALID_IMAGE", "The uploaded file is not a valid supported image.", "invalid_image", true);
  }
}

export async function saveUploadedImage(input: {
  userId: string;
  projectId: string;
  kind: "original" | "reference";
  file: File;
}) {
  requireProject(input.projectId, input.userId);
  const maxBytes = Number(process.env.MAX_UPLOAD_MB || 10) * 1024 * 1024;
  if (!ALLOWED_INPUT_MIMES.has(input.file.type)) {
    throw new ApiError(
      415,
      "UNSUPPORTED_IMAGE_TYPE",
      "Use a JPEG, PNG, WebP, AVIF, or GIF image.",
      "invalid_image",
      true,
    );
  }
  if (!input.file.size || input.file.size > maxBytes) {
    throw new ApiError(
      413,
      "IMAGE_TOO_LARGE",
      `Images must be smaller than ${Math.round(maxBytes / 1024 / 1024)} MB.`,
      "invalid_image",
      true,
    );
  }
  const buffer = Buffer.from(await input.file.arrayBuffer());
  validateMagic(buffer);
  return saveImageBuffer({
    ...input,
    buffer,
    originalFilename: input.file.name || "space.jpg",
  });
}

export async function saveImageBuffer(input: {
  userId: string;
  projectId: string;
  kind: "original" | "reference" | "generated";
  buffer: Buffer;
  originalFilename: string;
  versionId?: string;
}) {
  requireProject(input.projectId, input.userId);
  validateMagic(input.buffer);
  let metadata: Metadata;
  try {
    metadata = await sharp(input.buffer, { animated: false, limitInputPixels: MAX_PIXELS }).metadata();
  } catch {
    throw new ApiError(400, "INVALID_IMAGE", "The image could not be decoded safely.", "invalid_image", true);
  }
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PIXELS) {
    throw new ApiError(
      413,
      "IMAGE_DIMENSIONS_TOO_LARGE",
      "The image dimensions are too large. Use an image under 30 megapixels.",
      "invalid_image",
      true,
    );
  }

  const id = newId("img");
  const directory = path.join(uploadsRoot(), input.userId, input.projectId);
  await fs.mkdir(directory, { recursive: true });
  const filePath = path.join(directory, `${id}.jpg`);
  const thumbnailPath = path.join(directory, `${id}.thumb.webp`);

  const pipeline = sharp(input.buffer, { animated: false, limitInputPixels: MAX_PIXELS })
    .rotate()
    .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#f4f0e8" });
  const full = await pipeline.jpeg({ quality: 91, chromaSubsampling: "4:4:4", mozjpeg: true }).toBuffer();
  const fullMetadata = await sharp(full).metadata();
  const thumbnail = await sharp(full)
    .resize({ width: 640, height: 480, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();

  await Promise.all([fs.writeFile(filePath, full, { mode: 0o600 }), fs.writeFile(thumbnailPath, thumbnail, { mode: 0o600 })]);
  const createdAt = nowIso();
  getDb()
    .prepare(
      `INSERT INTO project_images
       (id, project_id, user_id, kind, file_path, thumbnail_path, mime_type, width, height, filename, size_bytes, version_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'image/jpeg', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.projectId,
      input.userId,
      input.kind,
      filePath,
      thumbnailPath,
      fullMetadata.width || metadata.width,
      fullMetadata.height || metadata.height,
      path.basename(input.originalFilename).slice(0, 180),
      full.length,
      input.versionId || null,
      createdAt,
    );
  getDb().prepare("UPDATE projects SET updated_at = ?, status = ? WHERE id = ? AND user_id = ?").run(
    createdAt,
    input.kind === "generated" ? "designed" : "uploaded",
    input.projectId,
    input.userId,
  );
  return {
    id,
    kind: input.kind,
    url: `/api/media/${id}`,
    thumbnailUrl: `/api/media/${id}?thumbnail=1`,
    filename: path.basename(input.originalFilename).slice(0, 180),
    width: fullMetadata.width || metadata.width,
    height: fullMetadata.height || metadata.height,
    sizeBytes: full.length,
    versionId: input.versionId || null,
    createdAt,
  };
}

export function getImageRow(imageId: string, userId?: string): ImageRow | undefined {
  const db = getDb();
  return (userId
    ? db.prepare("SELECT * FROM project_images WHERE id = ? AND user_id = ?").get(imageId, userId)
    : db.prepare("SELECT * FROM project_images WHERE id = ?").get(imageId)) as ImageRow | undefined;
}

export function getLatestOriginal(projectId: string, userId: string) {
  return getDb()
    .prepare("SELECT * FROM project_images WHERE project_id = ? AND user_id = ? AND kind = 'original' ORDER BY created_at DESC LIMIT 1")
    .get(projectId, userId) as ImageRow | undefined;
}

export function getReferenceImages(projectId: string, userId: string) {
  return getDb()
    .prepare("SELECT * FROM project_images WHERE project_id = ? AND user_id = ? AND kind = 'reference' ORDER BY created_at ASC LIMIT 8")
    .all(projectId, userId) as ImageRow[];
}

export async function imageToDataUrl(row: ImageRow) {
  const buffer = await fs.readFile(row.file_path);
  return `data:${row.mime_type};base64,${buffer.toString("base64")}`;
}

export async function deleteImage(imageId: string, userId: string) {
  const row = getImageRow(imageId, userId);
  if (!row) throw new ApiError(404, "IMAGE_NOT_FOUND", "The image could not be found.", "not_found");
  if (row.kind === "generated") {
    throw new ApiError(400, "VERSION_IMAGE_IMMUTABLE", "Generated version images cannot be removed directly.", "validation");
  }
  getDb().prepare("DELETE FROM project_images WHERE id = ? AND user_id = ?").run(imageId, userId);
  await Promise.allSettled([fs.unlink(row.file_path), fs.unlink(row.thumbnail_path)]);
}
