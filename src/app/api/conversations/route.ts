import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/identity";
import { listConversations } from "@/lib/chat/conversations";

export const dynamic = "force-dynamic";

/** GET /api/conversations?search=... — the current user's own conversations. */
export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const search = req.nextUrl.searchParams.get("search") ?? undefined;
  const conversations = await listConversations(user.id, search);
  return NextResponse.json({ conversations });
}
