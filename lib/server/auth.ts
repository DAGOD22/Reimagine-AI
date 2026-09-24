import "server-only";

import { compare, hash } from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/errors";
import { getDb, newId, nowIso } from "@/lib/server/db";
import type { UserSafe } from "@/lib/types";

const COOKIE_NAME = "hearthform_session";
const SESSION_DAYS = 30;

type UserRow = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  created_at: string;
};

type SessionUserRow = UserRow & { expires_at: string; session_id: string };

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function safeUser(row: UserRow): UserSafe {
  return { id: row.id, email: row.email, name: row.name, createdAt: row.created_at };
}

export async function hashPassword(password: string) {
  return hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}

export function issueSession(userId: string, response: NextResponse) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  getDb()
    .prepare(
      "INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(newId("ses"), userId, tokenHash(token), expires.toISOString(), now.toISOString(), now.toISOString());
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function getCurrentUser(): Promise<UserSafe | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.*, s.expires_at, s.id AS session_id
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .get(tokenHash(token)) as SessionUserRow | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(row.session_id);
    return null;
  }
  db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(nowIso(), row.session_id);
  return safeUser(row);
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new ApiError(401, "SIGN_IN_REQUIRED", "Please sign in to continue.", "authentication", true);
  }
  return user;
}

export async function revokeCurrentSession(response: NextResponse) {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
  response.cookies.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", path: "/", expires: new Date(0) });
}

export function findUserByEmail(email: string) {
  return getDb().prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(email) as UserRow | undefined;
}

export function createUser(input: { email: string; name: string; passwordHash: string }) {
  const db = getDb();
  const id = newId("usr");
  const now = nowIso();
  const transaction = db.transaction(() => {
    db.prepare(
      "INSERT INTO users (id, email, name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(id, input.email.toLowerCase(), input.name, input.passwordHash, now, now);
    db.prepare(
      "INSERT INTO preferences (user_id, appearance, currency, units, ai_detail, privacy_mode, updated_at) VALUES (?, 'system', 'USD', 'metric', 'balanced', 'standard', ?)",
    ).run(id, now);
  });
  transaction();
  return { id, email: input.email.toLowerCase(), name: input.name, createdAt: now } satisfies UserSafe;
}
