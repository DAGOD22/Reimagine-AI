import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { beginOAuth, type OAuthProvider } from "@/lib/server/oauth";

const supported = new Set(["google", "microsoft"]);
type Context = { params: Promise<{ provider: string }> };

export async function GET(request: NextRequest, context: Context) {
  const { provider } = await context.params;
  if (!supported.has(provider)) return NextResponse.redirect(new URL("/sign-in?oauth_error=unsupported", request.url), 303);
  const user = await getCurrentUser();
  if (user && !user.isGuest) return NextResponse.redirect(new URL("/dashboard", request.url), 303);
  return beginOAuth(request, provider as OAuthProvider, user?.isGuest ? user.id : undefined);
}
