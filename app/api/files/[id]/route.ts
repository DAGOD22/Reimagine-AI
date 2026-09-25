import fs from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { ApiError, withApiErrors } from "@/lib/server/errors";
import { getProjectFileRow } from "@/lib/server/files";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, context: Context) {
  return withApiErrors(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    const row = getProjectFileRow(id, user.id);
    if (!row) throw new ApiError(404, "FILE_NOT_FOUND", "The project file could not be found.", "not_found");
    const bytes = await fs.readFile(row.file_path).catch(() => null);
    if (!bytes) throw new ApiError(404, "FILE_DATA_MISSING", "The stored file is unavailable.", "not_found", true);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": row.mime_type,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `attachment; filename="${row.filename.replace(/["\\]/g, "-")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  });
}
