import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { analyzeSpace, createBudget, createPlan, createProducts, identifyColor } from "@/lib/server/ai-actions";
import { withApiErrors } from "@/lib/server/errors";
import { assertSameOrigin } from "@/lib/server/security";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("analysis"), projectId: z.string().min(1), instructions: z.string().max(8000).optional() }),
  z.object({ action: z.literal("plan"), projectId: z.string().min(1), instructions: z.string().trim().min(3).max(8000) }),
  z.object({ action: z.literal("budget"), projectId: z.string().min(1), currency: z.string().min(3).max(3), budget: z.number().positive().max(1_000_000_000), workMode: z.enum(["diy", "mixed", "professional"]), finishLevel: z.enum(["low", "medium", "premium"]) }),
  z.object({ action: z.literal("products"), projectId: z.string().min(1) }),
  z.object({ action: z.literal("color"), projectId: z.string().min(1), imageId: z.string().optional(), target: z.string().max(300).optional() }),
]);

export async function POST(request: NextRequest) {
  return withApiErrors(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = schema.parse(await request.json());
    if (input.action === "analysis") return NextResponse.json({ analysis: await analyzeSpace({ ...input, userId: user.id }) });
    if (input.action === "plan") return NextResponse.json({ plan: await createPlan({ ...input, userId: user.id }) });
    if (input.action === "budget") return NextResponse.json({ budget: await createBudget({ ...input, userId: user.id }) });
    if (input.action === "products") return NextResponse.json({ products: await createProducts({ ...input, userId: user.id }) });
    return NextResponse.json({ color: await identifyColor({ ...input, userId: user.id }) });
  });
}
