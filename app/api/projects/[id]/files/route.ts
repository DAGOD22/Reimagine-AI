import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { ApiError, withApiErrors } from "@/lib/server/errors";
import { deleteProjectFile, saveProjectFile } from "@/lib/server/files";
import { requireProject } from "@/lib/server/projects";
import { assertSameOrigin } from "@/lib/server/security";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  return withApiErrors(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    requireProject(id, user.id);
    const form = await request.formData();
    const files = form.getAll("files").filter((item): item is File => item instanceof File);
    if (!files.length) throw new ApiError(400, "FILE_REQUIRED", "Choose at least one project file.", "validation", true);
    if (files.length > 5) throw new ApiError(400, "TOO_MANY_FILES", "Upload no more than 5 documents at once.", "validation", true);
    const totalFiles = getDb().prepare("SELECT COUNT(*) AS count FROM project_files WHERE project_id = ? AND user_id = ?").get(id, user.id) as { count: number };
    if (totalFiles.count + files.length > 12) throw new ApiError(400, "PROJECT_FILE_LIMIT", "A project can include up to 12 documents.", "validation", true);
    if (user.isGuest) {
      const references = getDb().prepare("SELECT COUNT(*) AS count FROM project_images WHERE project_id = ? AND user_id = ? AND kind = 'reference'").get(id, user.id) as { count: number };
      if (totalFiles.count + references.count + files.length > 1) {
        throw new ApiError(403, "DEMO_FILE_LIMIT", "The demo accepts one reference image or document. Create an account to add more.", "authorization", true);
      }
    }
    const saved = [];
    for (const file of files) saved.push(await saveProjectFile({ userId: user.id, projectId: id, file }));
    return NextResponse.json({ files: saved }, { status: 201 });
  });
}

export async function DELETE(request: NextRequest) {
  return withApiErrors(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const fileId = request.nextUrl.searchParams.get("fileId");
    if (!fileId) throw new ApiError(400, "FILE_ID_REQUIRED", "Choose a file to remove.", "validation");
    await deleteProjectFile(fileId, user.id);
    return NextResponse.json({ ok: true });
  });
}
