import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { generateRedesign } from "@/lib/server/image-generation";
import { ApiError, withApiErrors } from "@/lib/server/errors";
import { assertSameOrigin } from "@/lib/server/security";

const schema = z.object({
  projectId: z.string().min(1),
  baseImageId: z.string().min(1),
  instructions: z.string().trim().min(3).max(8000),
  point: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), label: z.string().max(120).optional() }).optional(),
});

export async function POST(request: NextRequest) {
  return withApiErrors(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    if (user.isGuest) {
      throw new ApiError(403, "DEMO_GENERATION_LIMIT", "Create an account to edit your demo redesign and unlock version history.", "authorization", true);
    }
    const input = schema.parse(await request.json());
    const result = await generateRedesign({ request, userId: user.id, ...input });
    return NextResponse.json(result, { status: 201 });
  });
}
