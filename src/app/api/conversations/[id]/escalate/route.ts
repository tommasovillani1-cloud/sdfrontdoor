import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { requireUser } from "@/lib/identity";
import { firstNameFrom } from "@/lib/utils";
import {
  generateEscalationSummary,
  buildMailto,
} from "@/lib/chat/escalation";
import { categoriseConversation } from "@/lib/chat/categorise";

export const dynamic = "force-dynamic";

/**
 * POST /api/conversations/:id/escalate
 * Generates an AI subject + summary body, writes an escalations row, sets the
 * conversation to escalated, and returns a ready-to-open mailto: link.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const convo = await prisma.conversation.findFirst({
    where: { id: params.id, userId: user.id, deletedAt: null },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 40 } },
  });
  if (!convo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const userName = user.displayName || firstNameFrom(user.displayName, user.email);

  const { subject, body } = await generateEscalationSummary(
    userName,
    convo.messages.map((m) => ({ role: m.role, content: m.content })),
  );

  const toEmail = env.serviceDeskEmail;
  const mailto = buildMailto(toEmail, subject, body);

  // Record the escalation and mark the conversation, in one transaction.
  await prisma.$transaction([
    prisma.escalation.create({
      data: {
        conversationId: convo.id,
        toEmail,
        subject,
        body,
      },
    }),
    prisma.conversation.update({
      where: { id: convo.id },
      data: { status: "escalated", escalatedAt: new Date() },
    }),
  ]);

  // Auto-categorise on close (escalated counts as closed).
  void categoriseConversation(convo.id);

  return NextResponse.json({ ok: true, mailto, subject, body, toEmail });
}
