import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { compare, hash } from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { ApiError } from "@/lib/server/errors";
import { getDb, newId, nowIso } from "@/lib/server/db";
import type { UserSafe } from "@/lib/types";

const COOKIE_NAME = "hearthform_session";
const SESSION_DAYS = 30;

export type UserRow = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  is_guest: number;
  has_password: number;
  created_at: string;
};

type SessionUserRow = UserRow & { expires_at: string; session_id: string };

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function safeUser(row: UserRow): UserSafe {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.created_at,
    isGuest: Boolean(row.is_guest),
  };
}

export async function hashPassword(password: string) {
  return hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  try {
    return await compare(password, passwordHash);
  } catch {
    return false;
  }
}

export function issueSession(userId: string, response: NextResponse, days = SESSION_DAYS) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expires = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
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

export async function revokeCurrentSession(response: NextResponse, deleteGuest = true) {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) {
    const db = getDb();
    const session = db
      .prepare("SELECT s.user_id, u.is_guest FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?")
      .get(tokenHash(token)) as { user_id: string; is_guest: number } | undefined;
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
    if (deleteGuest && session?.is_guest) {
      db.prepare("DELETE FROM users WHERE id = ? AND is_guest = 1").run(session.user_id);
      await fs.rm(path.join(process.cwd(), "data", "uploads", session.user_id), { recursive: true, force: true });
      await fs.rm(path.join(process.cwd(), "data", "files", session.user_id), { recursive: true, force: true });
    }
  }
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
}

export function findUserByEmail(email: string) {
  return getDb().prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(email) as UserRow | undefined;
}

export function getUserById(id: string) {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

export function createUser(input: { email: string; name: string; passwordHash: string; isGuest?: boolean; hasPassword?: boolean }) {
  const db = getDb();
  const id = newId("usr");
  const now = nowIso();
  const transaction = db.transaction(() => {
    db.prepare(
      "INSERT INTO users (id, email, name, password_hash, is_guest, has_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(id, input.email.toLowerCase(), input.name, input.passwordHash, input.isGuest ? 1 : 0, (input.hasPassword ?? !input.isGuest) ? 1 : 0, now, now);
    db.prepare(
      "INSERT INTO preferences (user_id, appearance, currency, units, ai_detail, privacy_mode, updated_at) VALUES (?, 'system', 'USD', 'metric', 'balanced', 'standard', ?)",
    ).run(id, now);
  });
  transaction();
  return {
    id,
    email: input.email.toLowerCase(),
    name: input.name,
    createdAt: now,
    isGuest: Boolean(input.isGuest),
  } satisfies UserSafe;
}

export async function createGuestUser() {
  const marker = randomBytes(18).toString("hex");
  return createUser({
    email: `demo-${marker}@guest.hearthform.local`,
    name: "Demo designer",
    passwordHash: await hashPassword(randomBytes(48).toString("base64url")),
    isGuest: true,
  });
}

export function convertGuestToAccount(input: {
  guestUserId: string;
  email: string;
  name: string;
  passwordHash: string;
  hasPassword?: boolean;
}) {
  const db = getDb();
  const guest = getUserById(input.guestUserId);
  if (!guest?.is_guest) throw new ApiError(409, "DEMO_SESSION_EXPIRED", "The demo session has expired. Please create an account again.", "authentication", true);
  const now = nowIso();
  db.prepare("UPDATE users SET email = ?, name = ?, password_hash = ?, has_password = ?, is_guest = 0, updated_at = ? WHERE id = ? AND is_guest = 1")
    .run(input.email.toLowerCase(), input.name, input.passwordHash, (input.hasPassword ?? true) ? 1 : 0, now, input.guestUserId);
  return {
    id: input.guestUserId,
    email: input.email.toLowerCase(),
    name: input.name,
    createdAt: guest.created_at,
    isGuest: false,
  } satisfies UserSafe;
}

export function mergeGuestIntoUser(guestUserId: string, targetUserId: string) {
  if (guestUserId === targetUserId) return;
  const db = getDb();
  const guest = getUserById(guestUserId);
  if (!guest?.is_guest) return;
  db.transaction(() => {
    for (const table of [
      "project_images",
      "project_files",
      "analyses",
      "renovation_plans",
      "versions",
      "budgets",
      "product_recommendations",
      "design_messages",
      "ai_requests",
    ]) {
      db.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id = ?`).run(targetUserId, guestUserId);
    }
    db.prepare("UPDATE projects SET user_id = ? WHERE user_id = ?").run(targetUserId, guestUserId);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(guestUserId);
    db.prepare("DELETE FROM preferences WHERE user_id = ?").run(guestUserId);
    db.prepare("DELETE FROM users WHERE id = ? AND is_guest = 1").run(guestUserId);
  })();
  // Files stay at their original opaque path; ownership is enforced from the DB.
}
