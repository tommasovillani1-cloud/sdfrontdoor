import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/identity";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ categoryId: z.string().nullable() });

/** PATCH /api/admin/conversations/:id/categorise — admin recategorisation. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const convo = await prisma.conversation.findUnique({
    where: { id: params.id },
  });
  if (!convo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.conversation.update({
    where: { id: params.id },
    data: { categoryId: parsed.data.categoryId },
  });

  await recordAudit({
    actorUserId: actor.id,
    action: "admin.conversation.recategorise",
    target: params.id,
    metadata: { from: convo.categoryId, to: parsed.data.categoryId },
  });

  return NextResponse.json({ ok: true });
}
