import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { getDb, nowIso } from "@/lib/server/db";
import { withApiErrors } from "@/lib/server/errors";
import { requireProject, serializeProject } from "@/lib/server/projects";
import { assertSameOrigin } from "@/lib/server/security";
import { ROOM_TYPES } from "@/lib/constants";

const roomValues = ROOM_TYPES.map((type) => type.value) as [string, ...string[]];
const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  roomType: z.enum(roomValues).optional(),
  instructions: z.string().max(8000).optional(),
  notes: z.string().max(20000).optional(),
});

type Context = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, context: Context) {
  return withApiErrors(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    return NextResponse.json({ project: serializeProject(id, user.id) });
  });
}

export async function PATCH(request: NextRequest, context: Context) {
  return withApiErrors(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    const project = requireProject(id, user.id);
    const input = updateSchema.parse(await request.json());
    getDb().prepare("UPDATE projects SET name = ?, room_type = ?, instructions = ?, notes = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .run(input.name ?? project.name, input.roomType ?? project.room_type, input.instructions ?? project.instructions, input.notes ?? project.notes, nowIso(), id, user.id);
    return NextResponse.json({ project: serializeProject(id, user.id) });
  });
}

export async function DELETE(request: NextRequest, context: Context) {
  return withApiErrors(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    requireProject(id, user.id);
    getDb().prepare("DELETE FROM projects WHERE id = ? AND user_id = ?").run(id, user.id);
    await fs.rm(path.join(process.cwd(), "data", "uploads", user.id, id), { recursive: true, force: true });
    return NextResponse.json({ ok: true });
  });
}
