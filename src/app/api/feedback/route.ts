import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/identity";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  messageId: z.string(),
  rating: z.enum(["up", "down"]),
});

/** POST /api/feedback — upsert the user's thumbs rating on an assistant message. */
export async function POST(req: NextRequest) {
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
  const { messageId, rating } = parsed.data;

  // Ensure the message belongs to a conversation the user owns.
  const message = await prisma.message.findFirst({
    where: { id: messageId, conversation: { userId: user.id } },
    select: { id: true },
  });
  if (!message) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.feedback.upsert({
    where: { messageId_userId: { messageId, userId: user.id } },
    create: { messageId, userId: user.id, rating },
    update: { rating },
  });

  return NextResponse.json({ ok: true });
}
