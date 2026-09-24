import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { generateRedesign } from "@/lib/server/image-generation";
import { withApiErrors } from "@/lib/server/errors";
import { assertSameOrigin } from "@/lib/server/security";

const schema = z.object({ projectId: z.string().min(1), instructions: z.string().trim().min(3).max(8000) });

export async function POST(request: NextRequest) {
  return withApiErrors(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = schema.parse(await request.json());
    const result = await generateRedesign({ request, userId: user.id, ...input });
    return NextResponse.json(result, { status: 201 });
  });
}
