import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/identity";
import { categoriseConversation } from "@/lib/chat/categorise";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ resolved: z.boolean() });

/**
 * POST /api/conversations/:id/resolve
 * Records the user's answer to the resolution check.
 *  resolved=true  -> status resolved, set resolved_at, auto-categorise.
 *  resolved=false -> caller proceeds to the escalation flow (separate route).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const convo = await prisma.conversation.findFirst({
    where: { id: params.id, userId: user.id, deletedAt: null },
  });
  if (!convo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (parsed.data.resolved) {
    await prisma.conversation.update({
      where: { id: convo.id },
      data: { status: "resolved", resolvedAt: new Date() },
    });
    // Categorise asynchronously (do not block the response).
    void categoriseConversation(convo.id);
    return NextResponse.json({ ok: true, status: "resolved" });
  }

  // Not resolved: leave active; client opens the escalation flow.
  return NextResponse.json({ ok: true, status: convo.status });
}
