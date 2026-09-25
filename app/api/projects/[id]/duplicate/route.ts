import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { getDb, newId, nowIso } from "@/lib/server/db";
import { ApiError, withApiErrors } from "@/lib/server/errors";
import { saveImageBuffer } from "@/lib/server/images";
import { saveProjectFile } from "@/lib/server/files";
import { requireProject } from "@/lib/server/projects";
import { assertSameOrigin } from "@/lib/server/security";

type Context = { params: Promise<{ id: string }> };
type ImageRow = { id: string; kind: "original" | "reference" | "generated"; file_path: string; filename: string; version_id: string | null };
type VersionRow = { id: string; number: number; image_id: string | null; parent_id: string | null; prompt: string; provider: string; plan_id: string | null; created_at: string };

export async function POST(request: NextRequest, context: Context) {
  return withApiErrors(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    if (user.isGuest) {
      throw new ApiError(403, "DEMO_PROJECT_LIMIT", "Create an account to duplicate this demo project and start more renovations.", "authorization", true);
    }
    const { id } = await context.params;
    const source = requireProject(id, user.id);
    const db = getDb();
    const newProjectId = newId("prj");
    const now = nowIso();
    db.prepare("INSERT INTO projects (id, user_id, name, room_type, status, instructions, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(newProjectId, user.id, `${source.name} copy`, source.room_type, source.status, source.instructions, source.notes, now, now);

    try {
      const planMap = new Map<string, string>();
      const analyses = db.prepare("SELECT * FROM analyses WHERE project_id = ? AND user_id = ? ORDER BY created_at ASC").all(id, user.id) as Array<Record<string, string>>;
      for (const item of analyses) {
        db.prepare("INSERT INTO analyses (id, project_id, user_id, kind, payload_json, raw_response, model, request_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .run(newId("ana"), newProjectId, user.id, item.kind, item.payload_json, item.raw_response, item.model, item.request_id, item.created_at);
      }
      const plans = db.prepare("SELECT * FROM renovation_plans WHERE project_id = ? AND user_id = ? ORDER BY created_at ASC").all(id, user.id) as Array<Record<string, string>>;
      for (const item of plans) {
        const planId = newId("pln");
        planMap.set(item.id, planId);
        db.prepare("INSERT INTO renovation_plans (id, project_id, user_id, payload_json, raw_response, model, request_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
          .run(planId, newProjectId, user.id, item.payload_json, item.raw_response, item.model, item.request_id, item.created_at);
      }

      const images = db.prepare("SELECT id, kind, file_path, filename, version_id FROM project_images WHERE project_id = ? AND user_id = ? ORDER BY created_at ASC").all(id, user.id) as ImageRow[];
      for (const image of images.filter((item) => item.kind !== "generated")) {
        await saveImageBuffer({ userId: user.id, projectId: newProjectId, kind: image.kind, buffer: await fs.readFile(image.file_path), originalFilename: image.filename });
      }
      const sourceFiles = db.prepare("SELECT file_path, filename, mime_type FROM project_files WHERE project_id = ? AND user_id = ? ORDER BY created_at ASC").all(id, user.id) as Array<{ file_path: string; filename: string; mime_type: string }>;
      for (const sourceFile of sourceFiles) {
        const bytes = await fs.readFile(sourceFile.file_path);
        await saveProjectFile({
          userId: user.id,
          projectId: newProjectId,
          file: new File([new Uint8Array(bytes)], sourceFile.filename, { type: sourceFile.mime_type }),
        });
      }

      const versionMap = new Map<string, string>();
      const versions = db.prepare("SELECT * FROM versions WHERE project_id = ? AND user_id = ? ORDER BY number ASC").all(id, user.id) as VersionRow[];
      for (const version of versions) {
        const versionId = newId("ver");
        versionMap.set(version.id, versionId);
        db.prepare("INSERT INTO versions (id, project_id, user_id, number, image_id, parent_id, prompt, provider, plan_id, created_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)")
          .run(versionId, newProjectId, user.id, version.number, version.parent_id ? versionMap.get(version.parent_id) || null : null, version.prompt, version.provider, version.plan_id ? planMap.get(version.plan_id) || null : null, version.created_at);
        const sourceImage = images.find((image) => image.id === version.image_id);
        if (sourceImage) {
          const copied = await saveImageBuffer({ userId: user.id, projectId: newProjectId, kind: "generated", buffer: await fs.readFile(sourceImage.file_path), originalFilename: sourceImage.filename, versionId });
          db.prepare("UPDATE versions SET image_id = ? WHERE id = ?").run(copied.id, versionId);
        }
      }

      const latestBudget = db.prepare("SELECT * FROM budgets WHERE project_id = ? AND user_id = ? ORDER BY updated_at DESC LIMIT 1").get(id, user.id) as Record<string, string | number> | undefined;
      if (latestBudget) {
        db.prepare("INSERT INTO budgets (id, project_id, user_id, currency, target_budget, work_mode, finish_level, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .run(newId("bdg"), newProjectId, user.id, latestBudget.currency, latestBudget.target_budget, latestBudget.work_mode, latestBudget.finish_level, latestBudget.payload_json, latestBudget.created_at, latestBudget.updated_at);
      }
      const latestProducts = db.prepare("SELECT * FROM product_recommendations WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1").get(id, user.id) as Record<string, string> | undefined;
      if (latestProducts) {
        db.prepare("INSERT INTO product_recommendations (id, project_id, user_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?)")
          .run(newId("prd"), newProjectId, user.id, latestProducts.payload_json, latestProducts.created_at);
      }
      db.prepare("UPDATE projects SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(source.status, now, newProjectId, user.id);
    } catch (error) {
      db.prepare("DELETE FROM projects WHERE id = ? AND user_id = ?").run(newProjectId, user.id);
      await fs.rm(path.join(process.cwd(), "data", "uploads", user.id, newProjectId), { recursive: true, force: true });
      throw error;
    }

    return NextResponse.json({ project: { id: newProjectId } }, { status: 201 });
  });
}
