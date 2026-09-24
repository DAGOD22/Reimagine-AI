import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { callOpenRouter } from "@/lib/server/openrouter";
import { requireProject } from "@/lib/server/projects";
import { getDb } from "@/lib/server/db";
import { getLatestOriginal } from "@/lib/server/images";
import { safeJsonParse } from "@/lib/utils";
import { withApiErrors } from "@/lib/server/errors";
import { assertSameOrigin } from "@/lib/server/security";

const inputSchema = z.object({ projectId: z.string().min(1), question: z.string().trim().min(2).max(4000) });
const outputSchema = z.object({ answer: z.string().min(1), considerations: z.array(z.string()), nextSteps: z.array(z.string()) });

export async function POST(request: NextRequest) {
  return withApiErrors(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = inputSchema.parse(await request.json());
    const project = requireProject(input.projectId, user.id);
    const db = getDb();
    const analysis = db.prepare("SELECT payload_json FROM analyses WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1").get(input.projectId, user.id) as { payload_json: string } | undefined;
    const plan = db.prepare("SELECT payload_json FROM renovation_plans WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1").get(input.projectId, user.id) as { payload_json: string } | undefined;
    const latestGenerated = db.prepare("SELECT * FROM project_images WHERE project_id = ? AND user_id = ? AND kind = 'generated' ORDER BY created_at DESC LIMIT 1").get(input.projectId, user.id) as ReturnType<typeof getLatestOriginal>;
    const image = latestGenerated || getLatestOriginal(input.projectId, user.id);
    const result = await callOpenRouter<{ answer: string; considerations: string[]; nextSteps: string[] }>({
      userId: user.id,
      projectId: input.projectId,
      task: "design_question",
      prompt: `You are Hearthform's renovation design advisor. Answer the user's question using the attached current project image and stored project context. Be practical and explicit about uncertainty. Never assert exact dimensions, structural safety, code compliance, contractor pricing, or a commercial match unless verified. Return only JSON with keys answer (string), considerations (string array), nextSteps (string array).\n\nProject type: ${project.room_type}\nUser question: ${input.question}\nSpace analysis: ${JSON.stringify(safeJsonParse(analysis?.payload_json, null))}\nRenovation plan: ${JSON.stringify(safeJsonParse(plan?.payload_json, null))}`,
      images: image ? [{ path: image.file_path, mimeType: image.mime_type, label: latestGenerated ? "CURRENT GENERATED DESIGN" : "CURRENT SPACE" }] : [],
      schema: outputSchema,
    });
    return NextResponse.json({ response: result.data });
  });
}
