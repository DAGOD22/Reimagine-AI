import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/server/security";
import { createUser, findUserByEmail, hashPassword, issueSession } from "@/lib/server/auth";
import { ApiError, withApiErrors } from "@/lib/server/errors";

const schema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80),
  email: z.email().max(254),
  password: z.string().min(10, "Use at least 10 characters.").max(128),
});

export async function POST(request: NextRequest) {
  return withApiErrors(async () => {
    assertSameOrigin(request);
    const input = schema.parse(await request.json());
    if (findUserByEmail(input.email)) {
      throw new ApiError(409, "EMAIL_IN_USE", "An account already exists for this email.", "validation", true);
    }
    const user = createUser({ ...input, passwordHash: await hashPassword(input.password) });
    const response = NextResponse.json({ user }, { status: 201 });
    issueSession(user.id, response);
    return response;
  });
}
