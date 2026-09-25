import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  convertGuestToAccount,
  createUser,
  findUserByEmail,
  getUserById,
  hashPassword,
  issueSession,
  mergeGuestIntoUser,
} from "@/lib/server/auth";
import { getDb, newId, nowIso } from "@/lib/server/db";
import { ApiError } from "@/lib/server/errors";
import { getPublicOrigin } from "@/lib/server/security";

export type OAuthProvider = "google" | "microsoft";

const OAUTH_COOKIE = "hearthform_oauth";

const providers = {
  google: {
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    scope: "openid email profile",
  },
  microsoft: {
    authorizationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    clientIdEnv: "MICROSOFT_CLIENT_ID",
    clientSecretEnv: "MICROSOFT_CLIENT_SECRET",
    scope: "openid email profile",
  },
} as const;

function digest(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

function config(provider: OAuthProvider) {
  const definition = providers[provider];
  return {
    ...definition,
    clientId: process.env[definition.clientIdEnv] || "",
    clientSecret: process.env[definition.clientSecretEnv] || "",
  };
}

export function oauthConfiguration() {
  return {
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    microsoft: Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
  };
}

function callbackUrl(request: NextRequest, provider: OAuthProvider) {
  return `${getPublicOrigin(request)}/api/auth/oauth/${provider}/callback`;
}

function safeReturnTo(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export function beginOAuth(request: NextRequest, provider: OAuthProvider, guestUserId?: string) {
  const providerConfig = config(provider);
  if (!providerConfig.clientId || !providerConfig.clientSecret) {
    const target = new URL("/sign-in", getPublicOrigin(request));
    target.searchParams.set("oauth_error", `${provider}_not_configured`);
    return NextResponse.redirect(target, 303);
  }

  const state = randomBytes(32).toString("base64url");
  const browserToken = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const nonce = randomBytes(24).toString("base64url");
  const now = new Date();
  const expires = new Date(now.getTime() + 10 * 60 * 1000);
  const db = getDb();
  db.prepare("DELETE FROM oauth_states WHERE expires_at < ?").run(now.toISOString());
  db.prepare(
    `INSERT INTO oauth_states
     (id, state_hash, browser_hash, provider, code_verifier, nonce, return_to, guest_user_id, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId("oas"),
    digest(state),
    digest(browserToken),
    provider,
    verifier,
    nonce,
    safeReturnTo(request.nextUrl.searchParams.get("next")),
    guestUserId || null,
    expires.toISOString(),
    now.toISOString(),
  );

  const authorization = new URL(providerConfig.authorizationUrl);
  authorization.searchParams.set("client_id", providerConfig.clientId);
  authorization.searchParams.set("redirect_uri", callbackUrl(request, provider));
  authorization.searchParams.set("response_type", "code");
  authorization.searchParams.set("scope", providerConfig.scope);
  authorization.searchParams.set("state", state);
  authorization.searchParams.set("nonce", nonce);
  authorization.searchParams.set("code_challenge", digest(verifier));
  authorization.searchParams.set("code_challenge_method", "S256");
  authorization.searchParams.set("prompt", "select_account");
  if (provider === "microsoft") authorization.searchParams.set("response_mode", "query");

  const response = NextResponse.redirect(authorization, 302);
  response.cookies.set(OAUTH_COOKIE, browserToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/oauth",
    expires,
  });
  return response;
}

type StateRow = {
  id: string;
  browser_hash: string;
  provider: OAuthProvider;
  code_verifier: string;
  nonce: string;
  return_to: string;
  guest_user_id: string | null;
  expires_at: string;
};

async function verifyIdentity(provider: OAuthProvider, idToken: string, clientId: string, nonce: string) {
  let payload: JWTPayload;
  if (provider === "google") {
    const jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
    ({ payload } = await jwtVerify(idToken, jwks, {
      audience: clientId,
      issuer: ["https://accounts.google.com", "accounts.google.com"],
    }));
  } else {
    const jwks = createRemoteJWKSet(
      new URL("https://login.microsoftonline.com/common/discovery/v2.0/keys"),
    );
    ({ payload } = await jwtVerify(idToken, jwks, { audience: clientId }));
    if (!/^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]+\/v2\.0$/i.test(String(payload.iss || ""))) {
      throw new ApiError(401, "OAUTH_ISSUER_INVALID", "Microsoft returned an invalid identity issuer.", "authentication");
    }
  }
  if (payload.nonce !== nonce) {
    throw new ApiError(401, "OAUTH_NONCE_INVALID", "The social sign-in response could not be verified.", "authentication");
  }
  const subject = String(payload.sub || "");
  const email = String(payload.email || payload.preferred_username || "").trim().toLowerCase();
  const name = String(payload.name || email.split("@")[0] || "Hearthform user").trim();
  if (!subject || !email) {
    throw new ApiError(422, "OAUTH_EMAIL_REQUIRED", "Your identity provider did not return an email address.", "authentication", true);
  }
  if (provider === "google" && payload.email_verified !== true) {
    throw new ApiError(401, "OAUTH_EMAIL_UNVERIFIED", "Google did not verify this email address.", "authentication");
  }
  return { subject, email, name };
}

export async function completeOAuth(request: NextRequest, provider: OAuthProvider) {
  const state = request.nextUrl.searchParams.get("state") || "";
  const code = request.nextUrl.searchParams.get("code") || "";
  const browserToken = request.cookies.get(OAUTH_COOKIE)?.value || "";
  if (request.nextUrl.searchParams.get("error")) {
    throw new ApiError(401, "OAUTH_CANCELLED", "Social sign-in was cancelled or denied.", "authentication", true);
  }
  if (!state || !code || !browserToken) {
    throw new ApiError(400, "OAUTH_RESPONSE_INVALID", "The social sign-in response was incomplete.", "authentication", true);
  }

  const db = getDb();
  const record = db
    .prepare("SELECT * FROM oauth_states WHERE state_hash = ? AND provider = ?")
    .get(digest(state), provider) as StateRow | undefined;
  if (!record || record.browser_hash !== digest(browserToken) || new Date(record.expires_at).getTime() < Date.now()) {
    throw new ApiError(401, "OAUTH_STATE_INVALID", "The social sign-in request expired or could not be verified.", "authentication", true);
  }
  db.prepare("DELETE FROM oauth_states WHERE id = ?").run(record.id);

  const providerConfig = config(provider);
  if (!providerConfig.clientId || !providerConfig.clientSecret) {
    throw new ApiError(503, "OAUTH_NOT_CONFIGURED", `${provider} sign-in is not configured on the server.`, "missing_api_key");
  }
  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(providerConfig.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: providerConfig.clientId,
        client_secret: providerConfig.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: callbackUrl(request, provider),
        code_verifier: record.code_verifier,
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new ApiError(502, "OAUTH_PROVIDER_UNREACHABLE", `${provider} could not be reached.`, "network", true);
  }
  const tokenPayload = (await tokenResponse.json().catch(() => ({}))) as { id_token?: string };
  if (!tokenResponse.ok || !tokenPayload.id_token) {
    throw new ApiError(401, "OAUTH_TOKEN_EXCHANGE_FAILED", `${provider} could not complete sign-in.`, "provider_authentication", true);
  }

  const identity = await verifyIdentity(
    provider,
    tokenPayload.id_token,
    providerConfig.clientId,
    record.nonce,
  );
  const linked = db
    .prepare("SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_account_id = ?")
    .get(provider, identity.subject) as { user_id: string } | undefined;
  const existingEmailUser = findUserByEmail(identity.email);
  const guest = record.guest_user_id ? getUserById(record.guest_user_id) : undefined;
  let userId: string;

  if (linked) {
    userId = linked.user_id;
    if (guest?.is_guest) mergeGuestIntoUser(guest.id, userId);
  } else if (existingEmailUser && !existingEmailUser.is_guest) {
    userId = existingEmailUser.id;
    if (guest?.is_guest) mergeGuestIntoUser(guest.id, userId);
  } else if (guest?.is_guest) {
    const converted = convertGuestToAccount({
      guestUserId: guest.id,
      email: identity.email,
      name: identity.name,
      passwordHash: await hashPassword(randomBytes(48).toString("base64url")),
      hasPassword: false,
    });
    userId = converted.id;
  } else {
    userId = (
      await Promise.resolve(
        createUser({
          email: identity.email,
          name: identity.name,
          passwordHash: await hashPassword(randomBytes(48).toString("base64url")),
          hasPassword: false,
        }),
      )
    ).id;
  }

  db.prepare(
    `INSERT INTO oauth_accounts (id, user_id, provider, provider_account_id, provider_email, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider, provider_account_id) DO UPDATE SET
       user_id = excluded.user_id, provider_email = excluded.provider_email, updated_at = excluded.updated_at`,
  ).run(newId("oac"), userId, provider, identity.subject, identity.email, nowIso(), nowIso());

  const target = new URL(safeReturnTo(record.return_to), getPublicOrigin(request));
  const response = NextResponse.redirect(target, 303);
  response.cookies.set(OAUTH_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/oauth",
    expires: new Date(0),
  });
  issueSession(userId, response);
  return response;
}
