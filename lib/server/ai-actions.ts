import "server-only";

import { getDb, newId, nowIso } from "@/lib/server/db";
import { getLatestOriginal, getReferenceImages, type getImageRow } from "@/lib/server/images";
import { requireProject } from "@/lib/server/projects";
import { safeJsonParse } from "@/lib/utils";
import type { BudgetPlan, ColorEstimate, ProductCategory, RenovationPlan, SpaceAnalysis } from "@/lib/types";
import { analysisPrompt, budgetPrompt, colorPrompt, planPrompt, productsPrompt } from "@/lib/server/ai-prompts";
import { budgetSchema, colorSchema, productsSchema, renovationPlanSchema, spaceAnalysisSchema } from "@/lib/server/ai-schemas";
import { callOpenRouter } from "@/lib/server/openrouter";
import { ApiError } from "@/lib/server/errors";

type ImageRow = NonNullable<ReturnType<typeof getImageRow>>;

function visionImage(row: ImageRow, label: string) {
  return { path: row.file_path, mimeType: row.mime_type, label };
}

export async function analyzeSpace(input: { userId: string; projectId: string; instructions?: string }) {
  const project = requireProject(input.projectId, input.userId);
  const original = getLatestOriginal(input.projectId, input.userId);
  if (!original) throw new ApiError(400, "ORIGINAL_IMAGE_REQUIRED", "Upload a primary space image first.", "invalid_image", true);
  const references = getReferenceImages(input.projectId, input.userId);
  const result = await callOpenRouter<SpaceAnalysis>({
    userId: input.userId,
    projectId: input.projectId,
    task: "space_analysis",
    prompt: analysisPrompt({ roomType: project.room_type, instructions: input.instructions || project.instructions }),
    images: [visionImage(original, "PRIMARY SPACE PHOTOGRAPH"), ...references.map((row, index) => visionImage(row, `REFERENCE INSPIRATION ${index + 1}`))],
    schema: spaceAnalysisSchema,
  });
  const id = newId("ana");
  getDb()
    .prepare("INSERT INTO analyses (id, project_id, user_id, kind, payload_json, raw_response, model, request_id, created_at) VALUES (?, ?, ?, 'space', ?, ?, ?, ?, ?)")
    .run(id, input.projectId, input.userId, JSON.stringify(result.data), result.raw, process.env.OPENROUTER_MODEL || "google/gemma-4-26b-a4b-it:free", result.requestId || null, nowIso());
  getDb().prepare("UPDATE projects SET updated_at = ?, status = 'analyzed' WHERE id = ? AND user_id = ?").run(nowIso(), input.projectId, input.userId);
  return result.data;
}

export async function createPlan(input: { userId: string; projectId: string; instructions: string }) {
  const project = requireProject(input.projectId, input.userId);
  if (!input.instructions.trim()) throw new ApiError(400, "INSTRUCTIONS_REQUIRED", "Describe what you would like to change.", "validation", true);
  let analysisRow = getDb()
    .prepare("SELECT payload_json FROM analyses WHERE project_id = ? AND user_id = ? AND kind = 'space' ORDER BY created_at DESC LIMIT 1")
    .get(input.projectId, input.userId) as { payload_json: string } | undefined;
  if (!analysisRow) {
    await analyzeSpace({ userId: input.userId, projectId: input.projectId, instructions: input.instructions });
    analysisRow = getDb()
      .prepare("SELECT payload_json FROM analyses WHERE project_id = ? AND user_id = ? AND kind = 'space' ORDER BY created_at DESC LIMIT 1")
      .get(input.projectId, input.userId) as { payload_json: string };
  }
  const analysis = safeJsonParse<SpaceAnalysis>(analysisRow.payload_json, {} as SpaceAnalysis);
  const original = getLatestOriginal(input.projectId, input.userId);
  if (!original) throw new ApiError(400, "ORIGINAL_IMAGE_REQUIRED", "Upload a primary space image first.", "invalid_image", true);
  const references = getReferenceImages(input.projectId, input.userId);
  const result = await callOpenRouter<RenovationPlan>({
    userId: input.userId,
    projectId: input.projectId,
    task: "renovation_plan",
    prompt: planPrompt({ roomType: project.room_type, instructions: input.instructions, analysis, referenceCount: references.length }),
    images: [visionImage(original, "PRIMARY SPACE PHOTOGRAPH"), ...references.map((row, index) => visionImage(row, `REFERENCE INSPIRATION ${index + 1}`))],
    schema: renovationPlanSchema,
  });
  const id = newId("pln");
  const now = nowIso();
  getDb()
    .prepare("INSERT INTO renovation_plans (id, project_id, user_id, payload_json, raw_response, model, request_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, input.projectId, input.userId, JSON.stringify(result.data), result.raw, process.env.OPENROUTER_MODEL || "google/gemma-4-26b-a4b-it:free", result.requestId || null, now);
  getDb().prepare("UPDATE projects SET instructions = ?, status = 'planned', updated_at = ? WHERE id = ? AND user_id = ?").run(input.instructions, now, input.projectId, input.userId);
  return result.data;
}

function latestPlan(projectId: string, userId: string) {
  const row = getDb()
    .prepare("SELECT payload_json FROM renovation_plans WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(projectId, userId) as { payload_json: string } | undefined;
  if (!row) throw new ApiError(400, "PLAN_REQUIRED", "Create a renovation plan first.", "validation", true);
  return safeJsonParse<RenovationPlan>(row.payload_json, {} as RenovationPlan);
}

export async function createBudget(input: { userId: string; projectId: string; currency: string; budget: number; workMode: string; finishLevel: string }) {
  const project = requireProject(input.projectId, input.userId);
  const plan = latestPlan(input.projectId, input.userId);
  const result = await callOpenRouter<BudgetPlan>({
    userId: input.userId,
    projectId: input.projectId,
    task: "budget_plan",
    prompt: budgetPrompt({ ...input, roomType: project.room_type, plan }),
    schema: budgetSchema,
  });
  const now = nowIso();
  getDb().prepare("INSERT INTO budgets (id, project_id, user_id, currency, target_budget, work_mode, finish_level, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(newId("bdg"), input.projectId, input.userId, input.currency, input.budget, input.workMode, input.finishLevel, JSON.stringify(result.data), now, now);
  return result.data;
}

export async function createProducts(input: { userId: string; projectId: string }) {
  const project = requireProject(input.projectId, input.userId);
  const plan = latestPlan(input.projectId, input.userId);
  const result = await callOpenRouter<{ products: ProductCategory[] }>({
    userId: input.userId,
    projectId: input.projectId,
    task: "product_discovery",
    prompt: productsPrompt({ plan, roomType: project.room_type }),
    schema: productsSchema,
  });
  getDb().prepare("INSERT INTO product_recommendations (id, project_id, user_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(newId("prd"), input.projectId, input.userId, JSON.stringify(result.data.products), nowIso());
  return result.data.products;
}

export async function identifyColor(input: { userId: string; projectId: string; imageId?: string; target?: string }) {
  requireProject(input.projectId, input.userId);
  const image = input.imageId
    ? (getDb().prepare("SELECT * FROM project_images WHERE id = ? AND project_id = ? AND user_id = ?").get(input.imageId, input.projectId, input.userId) as ImageRow | undefined)
    : getLatestOriginal(input.projectId, input.userId);
  if (!image) throw new ApiError(400, "IMAGE_REQUIRED", "Choose an image to identify a color.", "invalid_image", true);
  const result = await callOpenRouter<ColorEstimate>({
    userId: input.userId,
    projectId: input.projectId,
    task: "color_identification",
    prompt: colorPrompt(input.target),
    images: [visionImage(image, "IMAGE FOR APPROXIMATE COLOR IDENTIFICATION")],
    schema: colorSchema,
  });
  return result.data;
}
