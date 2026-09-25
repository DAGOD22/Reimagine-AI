import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { getDb, nowIso } from "@/lib/server/db";
import { withApiErrors } from "@/lib/server/errors";
import { assertSameOrigin } from "@/lib/server/security";

const schema = z.object({
  appearance: z.enum(["light", "dark", "system"]),
  currency: z.string().length(3),
  units: z.enum(["metric", "imperial"]),
  aiDetail: z.enum(["concise", "balanced", "detailed"]),
  privacyMode: z.enum(["standard", "strict"]),
});

export async function GET() {
  return withApiErrors(async () => {
    const user = await requireUser();
    const db = getDb();
    const row = db.prepare("SELECT * FROM preferences WHERE user_id = ?").get(user.id) as Record<string, string>;
    const account = db.prepare("SELECT has_password FROM users WHERE id = ?").get(user.id) as { has_password: number };
    return NextResponse.json({
      preferences: { appearance: row.appearance, currency: row.currency, units: row.units, aiDetail: row.ai_detail, privacyMode: row.privacy_mode },
      passwordConfigured: Boolean(account.has_password),
    });
  });
}

export async function PUT(request: NextRequest) {
  return withApiErrors(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = schema.parse(await request.json());
    getDb().prepare("UPDATE preferences SET appearance = ?, currency = ?, units = ?, ai_detail = ?, privacy_mode = ?, updated_at = ? WHERE user_id = ?")
      .run(input.appearance, input.currency, input.units, input.aiDetail, input.privacyMode, nowIso(), user.id);
    return NextResponse.json({ preferences: input });
  });
}
