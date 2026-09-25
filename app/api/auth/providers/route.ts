import { NextResponse } from "next/server";
import { oauthConfiguration } from "@/lib/server/oauth";

export async function GET() {
  return NextResponse.json({ providers: oauthConfiguration() });
}
