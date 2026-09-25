import { NextRequest, NextResponse } from "next/server";
import { revokeCurrentSession } from "@/lib/server/auth";
import { withApiErrors } from "@/lib/server/errors";
import { assertSameOrigin } from "@/lib/server/security";

export async function POST(request: NextRequest) {
  return withApiErrors(async () => {
    assertSameOrigin(request);
    const response = NextResponse.json({ ok: true });
    await revokeCurrentSession(response);
    return response;
  });
}
