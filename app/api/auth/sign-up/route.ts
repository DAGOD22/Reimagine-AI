import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/server/security";
import {
  convertGuestToAccount,
  createUser,
  findUserByEmail,
  getCurrentUser,
  hashPassword,
  issueSession,
  revokeCurrentSession,
} from "@/lib/server/auth";
import { ApiError, asApiError, errorResponse } from "@/lib/server/errors";

const schema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80),
  email: z.email().max(254),
  password: z.string().min(10, "Use at least 10 characters.").max(128),
});

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
    const input = parsed.input;
    if (findUserByEmail(input.email)) {
      throw new ApiError(409, "EMAIL_IN_USE", "An account already exists for this email.", "validation", true);
    }
    const current = await getCurrentUser();
    const passwordHash = await hashPassword(input.password);
    const user = current?.isGuest
      ? convertGuestToAccount({ guestUserId: current.id, email: input.email, name: input.name, passwordHash })
      : createUser({ ...input, passwordHash });
    const target = new URL(isForm ? "/dashboard" : request.nextUrl.pathname, request.url);
    const response = isForm
      ? NextResponse.redirect(target, 303)
      : NextResponse.json({ user }, { status: 201 });
    if (current) await revokeCurrentSession(response, false);
    issueSession(user.id, response);
    return response;
  } catch (error) {
    const normalized = asApiError(error);
    if (isForm) {
      const target = new URL("/sign-up", request.url);
      target.searchParams.set("error", normalized.code);
      return NextResponse.redirect(target, 303);
    }
    return errorResponse(normalized);
  }
}
