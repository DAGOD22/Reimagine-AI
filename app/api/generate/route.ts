import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { generateRedesign } from "@/lib/server/image-generation";
import { getDb, nowIso } from "@/lib/server/db";
import { ApiError, withApiErrors } from "@/lib/server/errors";
import { assertSameOrigin } from "@/lib/server/security";

const schema = z.object({ projectId: z.string().min(1), instructions: z.string().trim().min(3).max(8000) });

export async function POST(request: NextRequest) {
  return withApiErrors(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = schema.parse(await request.json());
    let guestClaimed = false;
    if (user.isGuest) {
      const db = getDb();
      const ownedProject = db.prepare("SELECT id FROM projects WHERE id = ? AND user_id = ?").get(input.projectId, user.id);
      if (!ownedProject) throw new ApiError(404, "PROJECT_NOT_FOUND", "The project could not be found.", "not_found");
      const claimedAt = nowIso();
      const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const claim = db.prepare(
        `UPDATE projects SET guest_generation_claimed_at = ?
         WHERE id = ? AND user_id = ?
           AND NOT EXISTS (SELECT 1 FROM versions WHERE project_id = ? AND user_id = ? AND image_id IS NOT NULL)
           AND (guest_generation_claimed_at IS NULL OR guest_generation_claimed_at < ?)`,
      ).run(claimedAt, input.projectId, user.id, input.projectId, user.id, staleBefore);
      if (claim.changes !== 1) {
        const versions = db.prepare("SELECT COUNT(*) AS count FROM versions WHERE project_id = ? AND user_id = ? AND image_id IS NOT NULL").get(input.projectId, user.id) as { count: number };
        throw new ApiError(
          versions.count >= 1 ? 403 : 409,
          versions.count >= 1 ? "DEMO_GENERATION_LIMIT" : "DEMO_GENERATION_IN_PROGRESS",
          versions.count >= 1 ? "Your demo redesign is complete. Create an account to keep iterating." : "Your demo redesign is already being generated. Wait for it to finish before retrying.",
          versions.count >= 1 ? "authorization" : "validation",
          true,
        );
      }
      guestClaimed = true;
    }
    try {
      const result = await generateRedesign({ request, userId: user.id, ...input });
      return NextResponse.json(result, { status: 201 });
    } catch (error) {
      if (guestClaimed) getDb().prepare("UPDATE projects SET guest_generation_claimed_at = NULL WHERE id = ? AND user_id = ?").run(input.projectId, user.id);
      throw error;
    }
  });
}
