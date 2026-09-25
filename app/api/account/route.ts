import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword, requireUser, verifyPassword } from "@/lib/server/auth";
import { getDb, nowIso } from "@/lib/server/db";
import { ApiError, withApiErrors } from "@/lib/server/errors";
import { assertSameOrigin } from "@/lib/server/security";

const schema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  currentPassword: z.string().max(128).optional(),
  newPassword: z.string().min(10).max(128).optional(),
});

export async function PATCH(request: NextRequest) {
  return withApiErrors(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = schema.parse(await request.json());
    const db = getDb();
    const row = db.prepare("SELECT password_hash, has_password FROM users WHERE id = ?").get(user.id) as { password_hash: string; has_password: number };
    let passwordHash = row.password_hash;
    let passwordConfigured = Boolean(row.has_password);
    if (input.newPassword) {
      if (passwordConfigured && !input.currentPassword) {
        throw new ApiError(400, "CURRENT_PASSWORD_REQUIRED", "Enter your current password before choosing a new one.", "validation", true);
      }
      if (passwordConfigured && !(await verifyPassword(input.currentPassword!, row.password_hash))) {
        throw new ApiError(401, "CURRENT_PASSWORD_INCORRECT", "Your current password is incorrect.", "authentication", true);
      }
      passwordHash = await hashPassword(input.newPassword);
      passwordConfigured = true;
    }
    db.prepare("UPDATE users SET name = ?, password_hash = ?, has_password = ?, updated_at = ? WHERE id = ?")
      .run(input.name || user.name, passwordHash, passwordConfigured ? 1 : 0, nowIso(), user.id);
    return NextResponse.json({ user: { ...user, name: input.name || user.name }, passwordConfigured });
  });
}
