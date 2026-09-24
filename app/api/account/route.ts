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
}).refine((value) => !value.newPassword || Boolean(value.currentPassword), {
  message: "Enter your current password before choosing a new one.",
  path: ["currentPassword"],
});

export async function PATCH(request: NextRequest) {
  return withApiErrors(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = schema.parse(await request.json());
    const db = getDb();
    const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as { password_hash: string };
    let passwordHash = row.password_hash;
    if (input.newPassword) {
      if (!(await verifyPassword(input.currentPassword!, row.password_hash))) {
        throw new ApiError(401, "CURRENT_PASSWORD_INCORRECT", "Your current password is incorrect.", "authentication", true);
      }
      passwordHash = await hashPassword(input.newPassword);
    }
    db.prepare("UPDATE users SET name = ?, password_hash = ?, updated_at = ? WHERE id = ?")
      .run(input.name || user.name, passwordHash, nowIso(), user.id);
    return NextResponse.json({ user: { ...user, name: input.name || user.name } });
  });
}
