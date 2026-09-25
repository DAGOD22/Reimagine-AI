import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/server/security";
import {
  findUserByEmail,
  getCurrentUser,
  issueSession,
  mergeGuestIntoUser,
  revokeCurrentSession,
  verifyPassword,
} from "@/lib/server/auth";
import { ApiError, asApiError, errorResponse } from "@/lib/server/errors";

const schema = z.object({ email: z.email(), password: z.string().min(1).max(128) });

async function requestInput(request: NextRequest) {
  const isForm = request.headers.get("content-type")?.includes("application/x-www-form-urlencoded") || false;
  const raw = isForm ? Object.fromEntries((await request.formData()).entries()) : await request.json();
  return { input: schema.parse(raw), isForm };
}

export async function POST(request: NextRequest) {
  let isForm = false;
  try {
    assertSameOrigin(request);
    const parsed = await requestInput(request);
    isForm = parsed.isForm;
    const row = findUserByEmail(parsed.input.email);
    if (!row || row.is_guest || !row.has_password || !(await verifyPassword(parsed.input.password, row.password_hash))) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "The email or password is incorrect.", "authentication", true);
    }
    const current = await getCurrentUser();
    if (current?.isGuest) mergeGuestIntoUser(current.id, row.id);
    const response = isForm
      ? NextResponse.redirect(new URL("/dashboard", request.url), 303)
      : NextResponse.json({
          user: { id: row.id, email: row.email, name: row.name, createdAt: row.created_at, isGuest: false },
        });
    if (current && !current.isGuest) await revokeCurrentSession(response, false);
    issueSession(row.id, response);
    return response;
  } catch (error) {
    const normalized = asApiError(error);
    if (isForm) {
      const target = new URL("/sign-in", request.url);
      target.searchParams.set("error", normalized.code);
      return NextResponse.redirect(target, 303);
    }
    return errorResponse(normalized);
  }
}
