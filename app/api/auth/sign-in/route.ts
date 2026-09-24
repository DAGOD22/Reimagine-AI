import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/server/security";
import { findUserByEmail, issueSession, verifyPassword } from "@/lib/server/auth";
import { ApiError, withApiErrors } from "@/lib/server/errors";

const schema = z.object({ email: z.email(), password: z.string().min(1).max(128) });

export async function POST(request: NextRequest) {
  return withApiErrors(async () => {
    assertSameOrigin(request);
    const input = schema.parse(await request.json());
    const row = findUserByEmail(input.email);
    if (!row || !(await verifyPassword(input.password, row.password_hash))) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "The email or password is incorrect.", "authentication", true);
    }
    const response = NextResponse.json({ user: { id: row.id, email: row.email, name: row.name, createdAt: row.created_at } });
    issueSession(row.id, response);
    return response;
  });
}
