import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAuthUrl } from "@/lib/google-oauth";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId") ?? undefined;

  const statePayload: Record<string, string> = { userId };
  if (clientId) statePayload.clientId = clientId;

  const state = Buffer.from(JSON.stringify(statePayload)).toString("base64url");
  const authUrl = getAuthUrl(state);

  return NextResponse.redirect(authUrl);
}
