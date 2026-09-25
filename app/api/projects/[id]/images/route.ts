import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { ApiError, withApiErrors } from "@/lib/server/errors";
import { deleteImage, saveUploadedImage } from "@/lib/server/images";
import { getDb } from "@/lib/server/db";
import { requireProject } from "@/lib/server/projects";
import { assertSameOrigin } from "@/lib/server/security";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  return withApiErrors(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    const form = await request.formData();
    const kind = form.get("kind") === "reference" ? "reference" : "original";
    const files = form.getAll("images").filter((item): item is File => item instanceof File);
    if (!files.length) throw new ApiError(400, "IMAGE_REQUIRED", "Choose at least one image to upload.", "invalid_image", true);
    if (kind === "original" && files.length > 1) throw new ApiError(400, "ONE_PRIMARY_IMAGE", "Upload one primary space image at a time.", "validation", true);
    if (files.length > 8) throw new ApiError(400, "TOO_MANY_IMAGES", "Upload no more than 8 reference images at once.", "validation", true);
    requireProject(id, user.id);
    if (kind === "reference") {
      const totalReferences = getDb().prepare("SELECT COUNT(*) AS count FROM project_images WHERE project_id = ? AND user_id = ? AND kind = 'reference'").get(id, user.id) as { count: number };
      if (totalReferences.count + files.length > 8) {
        throw new ApiError(400, "REFERENCE_LIMIT", "A project can include up to 8 reference images.", "validation", true);
      }
    }
    if (user.isGuest) {
      const existing = getDb()
        .prepare("SELECT COUNT(*) AS count FROM project_images WHERE project_id = ? AND user_id = ? AND kind = ?")
        .get(id, user.id, kind) as { count: number };
      const documentCount = kind === "reference"
        ? (getDb().prepare("SELECT COUNT(*) AS count FROM project_files WHERE project_id = ? AND user_id = ?").get(id, user.id) as { count: number }).count
        : 0;
      const limit = 1;
      if (existing.count + documentCount + files.length > limit) {
        throw new ApiError(
          403,
          kind === "original" ? "DEMO_PRIMARY_IMAGE_LIMIT" : "DEMO_REFERENCE_LIMIT",
          kind === "original"
            ? "The demo accepts one primary space image. Create an account to replace it or start another project."
            : "The demo accepts one inspiration image. Create an account to add more references.",
          "authorization",
          true,
        );
      }
    }
    const images = [];
    for (const file of files) images.push(await saveUploadedImage({ userId: user.id, projectId: id, kind, file }));
    return NextResponse.json({ images }, { status: 201 });
  });
}

export async function DELETE(request: NextRequest) {
  return withApiErrors(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const imageId = request.nextUrl.searchParams.get("imageId");
    if (!imageId) throw new ApiError(400, "IMAGE_ID_REQUIRED", "Choose an image to remove.", "validation");
    await deleteImage(imageId, user.id);
    return NextResponse.json({ ok: true });
  });
}
