import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { getImageRow } from "@/lib/server/images";
import { verifyMediaToken } from "@/lib/server/security";
import { ApiError, withApiErrors } from "@/lib/server/errors";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  return withApiErrors(async () => {
    const { id } = await context.params;
    const tokenValid = verifyMediaToken(id, request.nextUrl.searchParams.get("token"));
    const user = tokenValid ? null : await getCurrentUser();
    const row = getImageRow(id, user?.id);
    if (!row || (!tokenValid && !user)) {
      throw new ApiError(404, "IMAGE_NOT_FOUND", "This image could not be found.", "not_found");
    }
    const thumbnail = request.nextUrl.searchParams.get("thumbnail") === "1";
    const filePath = thumbnail ? row.thumbnail_path : row.file_path;
    let bytes: Buffer;
    try {
      bytes = await fs.readFile(filePath);
    } catch {
      throw new ApiError(404, "IMAGE_FILE_MISSING", "The stored image file is unavailable.", "not_found", true);
    }
    const download = request.nextUrl.searchParams.get("download") === "1";
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": thumbnail ? "image/webp" : row.mime_type,
        "Content-Length": String(bytes.length),
        "Cache-Control": tokenValid ? "private, max-age=300" : "private, max-age=3600, immutable",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${download ? path.basename(row.filename).replace(/[^a-zA-Z0-9._-]/g, "-") : id + (thumbnail ? ".webp" : ".jpg")}"`,
      },
    });
  });
}
