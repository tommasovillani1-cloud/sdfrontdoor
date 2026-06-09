import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/identity";
import { getConversation } from "@/lib/chat/conversations";

export const dynamic = "force-dynamic";

/** GET /api/conversations/:id — full conversation with messages. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const convo = await getConversation(user.id, params.id);
  if (!convo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ conversation: convo });
}

/** DELETE /api/conversations/:id — soft delete (user erasing their own chat). */
export async function DELETE(
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
  });
  if (!convo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.conversation.update({
    where: { id: convo.id },
    data: { deletedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
