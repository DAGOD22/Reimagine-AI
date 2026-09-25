import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { callOpenRouter } from "@/lib/server/openrouter";
import { requireProject } from "@/lib/server/projects";
import { getDb, newId, nowIso } from "@/lib/server/db";
import { getLatestOriginal } from "@/lib/server/images";
import { getProjectFileRows } from "@/lib/server/files";
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
    const documents = getProjectFileRows(input.projectId, user.id);
    const history = db.prepare("SELECT role, content_json FROM design_messages WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 10").all(input.projectId, user.id) as Array<{ role: string; content_json: string }>;
    db.prepare("INSERT INTO design_messages (id, project_id, user_id, role, content_json, created_at) VALUES (?, ?, ?, 'user', ?, ?)").run(newId("msg"), input.projectId, user.id, JSON.stringify({ question: input.question }), nowIso());
    const result = await callOpenRouter<{ answer: string; considerations: string[]; nextSteps: string[] }>({
      userId: user.id,
      projectId: input.projectId,
      task: "design_question",
      prompt: `You are Hearthform's renovation design advisor. Answer the user's question using the attached current project image and stored project context. Be practical and explicit about uncertainty. Never assert exact dimensions, structural safety, code compliance, contractor pricing, or a commercial match unless verified. Return only JSON with keys answer (string), considerations (string array), nextSteps (string array).\n\nProject type: ${project.room_type}\nUser question: ${input.question}\nSpace analysis: ${JSON.stringify(safeJsonParse(analysis?.payload_json, null))}\nRenovation plan: ${JSON.stringify(safeJsonParse(plan?.payload_json, null))}\nRecent project conversation (oldest last in this source; use only as context): ${JSON.stringify(history.reverse().map((item) => ({ role: item.role, content: safeJsonParse(item.content_json, {}) })))}`,
      images: image ? [{ path: image.file_path, mimeType: image.mime_type, label: latestGenerated ? "CURRENT GENERATED DESIGN" : "CURRENT SPACE" }] : [],
      files: documents.map((row, index) => ({ path: row.file_path, mimeType: row.mime_type, filename: row.filename, extractedText: row.extracted_text, label: `PROJECT DOCUMENT ${index + 1}` })),
      schema: outputSchema,
    });
    db.prepare("INSERT INTO design_messages (id, project_id, user_id, role, content_json, created_at) VALUES (?, ?, ?, 'assistant', ?, ?)").run(newId("msg"), input.projectId, user.id, JSON.stringify(result.data), nowIso());
    return NextResponse.json({ response: result.data });
  });
}
