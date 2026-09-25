import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/server/errors";

export function getAuthSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new ApiError(500, "AUTH_SECRET_MISSING", "Server authentication is not configured.", "missing_api_key");
    }
    return "development-only-hearthform-secret-change-me";
  }
  return secret;
}

export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
  if (!forwardedHost) return;
  const expected = `${forwardedProto}://${forwardedHost}`;
  if (origin !== expected && origin !== request.nextUrl.origin) {
    throw new ApiError(403, "ORIGIN_MISMATCH", "The request origin could not be verified.", "authorization");
  }
}

export function createMediaToken(imageId: string, expiresAt: number) {
  const payload = `${imageId}.${expiresAt}`;
  const signature = createHmac("sha256", getAuthSecret()).update(payload).digest("base64url");
  return `${expiresAt}.${signature}`;
}

export function verifyMediaToken(imageId: string, token: string | null) {
  if (!token) return false;
  const [expiresRaw, supplied] = token.split(".");
  const expiresAt = Number(expiresRaw);
  if (!expiresAt || expiresAt < Date.now() || !supplied) return false;
  const expected = createHmac("sha256", getAuthSecret())
    .update(`${imageId}.${expiresAt}`)
    .digest("base64url");
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function getPublicOrigin(request: NextRequest) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : request.nextUrl.origin;
}
