import { NextRequest, NextResponse } from "next/server";
import { asApiError } from "@/lib/server/errors";
import { completeOAuth, type OAuthProvider } from "@/lib/server/oauth";
import { getPublicOrigin } from "@/lib/server/security";

const supported = new Set(["google", "microsoft"]);
type Context = { params: Promise<{ provider: string }> };

export async function GET(request: NextRequest, context: Context) {
  const { provider } = await context.params;
  if (!supported.has(provider)) return NextResponse.redirect(new URL("/sign-in?oauth_error=unsupported", getPublicOrigin(request)), 303);
  try {
    return await completeOAuth(request, provider as OAuthProvider);
  } catch (error) {
    const normalized = asApiError(error);
    const target = new URL("/sign-in", getPublicOrigin(request));
    target.searchParams.set("oauth_error", normalized.code.toLowerCase());
    return NextResponse.redirect(target, 303);
  }
}
