import { NextRequest, NextResponse } from "next/server";
import { createGuestUser, getCurrentUser, issueSession } from "@/lib/server/auth";
import { getPublicOrigin } from "@/lib/server/security";

export async function GET(request: NextRequest) {
  const current = await getCurrentUser();
  if (current) {
    return NextResponse.redirect(new URL(current.isGuest ? "/projects/new?demo=1" : "/projects/new", getPublicOrigin(request)), 303);
  }
  const guest = await createGuestUser();
  const response = NextResponse.redirect(new URL("/projects/new?demo=1", getPublicOrigin(request)), 303);
  issueSession(guest.id, response, 1);
  return response;
}
