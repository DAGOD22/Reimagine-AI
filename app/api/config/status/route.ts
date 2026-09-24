import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { withApiErrors } from "@/lib/server/errors";
import { OPENROUTER_MODEL } from "@/lib/constants";

export async function GET() {
  return withApiErrors(async () => {
    await requireUser();
    const provider = (process.env.IMAGE_PROVIDER || "pollinations").toLowerCase();
    return NextResponse.json({
      openrouter: { configured: Boolean(process.env.OPENROUTER_API_KEY), model: OPENROUTER_MODEL, endpoint: "https://openrouter.ai/api/v1/chat/completions" },
      imageGeneration: {
        provider,
        configured: provider === "fal" ? Boolean(process.env.FAL_KEY) : true,
        mode: provider === "fal" ? "production" : process.env.POLLINATIONS_API_KEY ? "authenticated" : "community",
        model: provider === "fal" ? "fal-ai/flux-2-pro/edit" : "kontext",
      },
      database: { configured: true, engine: "SQLite" },
      authentication: { configured: true, mode: "secure server session" },
    });
  });
}
