import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { getDb, newId, nowIso } from "@/lib/server/db";
import { withApiErrors } from "@/lib/server/errors";
import { assertSameOrigin } from "@/lib/server/security";
import { ROOM_TYPES } from "@/lib/constants";

const roomValues = ROOM_TYPES.map((type) => type.value) as [string, ...string[]];
const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  roomType: z.enum(roomValues),
});

export async function GET() {
  return withApiErrors(async () => {
    const user = await requireUser();
    const rows = getDb()
      .prepare(
        `SELECT p.*,
          (SELECT id FROM project_images WHERE project_id = p.id AND kind = 'generated' ORDER BY created_at DESC LIMIT 1) AS latest_generated_id,
          (SELECT id FROM project_images WHERE project_id = p.id AND kind = 'original' ORDER BY created_at DESC LIMIT 1) AS latest_original_id,
          (SELECT COUNT(*) FROM versions WHERE project_id = p.id AND image_id IS NOT NULL) AS version_count
         FROM projects p WHERE p.user_id = ? ORDER BY p.updated_at DESC`,
      )
      .all(user.id) as Array<Record<string, unknown>>;
    return NextResponse.json({
      projects: rows.map((row) => {
        const imageId = row.latest_generated_id || row.latest_original_id;
        return {
          id: row.id,
          name: row.name,
          roomType: row.room_type,
          status: row.status,
          updatedAt: row.updated_at,
          createdAt: row.created_at,
          versionCount: Number(row.version_count || 0),
          thumbnailUrl: imageId ? `/api/media/${imageId}?thumbnail=1` : null,
        };
      }),
    });
  });
}

export async function POST(request: NextRequest) {
  return withApiErrors(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = createSchema.parse(await request.json());
    const id = newId("prj");
    const now = nowIso();
    getDb().prepare("INSERT INTO projects (id, user_id, name, room_type, status, instructions, notes, created_at, updated_at) VALUES (?, ?, ?, ?, 'draft', '', '', ?, ?)")
      .run(id, user.id, input.name, input.roomType, now, now);
    return NextResponse.json({ project: { id, ...input, status: "draft", createdAt: now, updatedAt: now } }, { status: 201 });
  });
}
