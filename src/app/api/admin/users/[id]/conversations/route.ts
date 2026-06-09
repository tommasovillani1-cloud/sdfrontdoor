import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/identity";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/admin/users/:id/conversations
 * GDPR right to erasure: hard-delete all conversations (and cascade messages,
 * escalations, feedback) for a given user. Audited.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await prisma.conversation.deleteMany({
    where: { userId: params.id },
  });

  await recordAudit({
    actorUserId: actor.id,
    action: "admin.user.erase_conversations",
    target: target.email,
    metadata: { deletedCount: result.count },
  });

  return NextResponse.json({ ok: true, deleted: result.count });
}
