import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/identity";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** GET /api/admin/users — list all users. */
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const users = await prisma.user.findMany({
    orderBy: [{ isAdmin: "desc" }, { lastSeenAt: "desc" }],
  });
  return NextResponse.json({ users });
}

const PatchSchema = z.object({
  userId: z.string(),
  isAdmin: z.boolean(),
});

/** PATCH /api/admin/users — toggle admin. Prevent removing the last admin. */
export async function PATCH(req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const { userId, isAdmin } = parsed.data;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Prevent removing the last remaining admin.
  if (target.isAdmin && !isAdmin) {
    const adminCount = await prisma.user.count({ where: { isAdmin: true } });
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "Cannot remove the last remaining administrator." },
        { status: 409 },
      );
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isAdmin },
  });

  await recordAudit({
    actorUserId: actor.id,
    action: isAdmin ? "admin.user.promote" : "admin.user.demote",
    target: target.email,
    metadata: { userId: target.id },
  });

  return NextResponse.json({ user: updated });
}
