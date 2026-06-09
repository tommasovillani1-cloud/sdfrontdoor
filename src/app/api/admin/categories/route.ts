import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/identity";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json({ categories });
}

const CreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  itilMapping: z.string().max(100).optional(),
});

export async function POST(req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const existing = await prisma.category.findUnique({
    where: { name: parsed.data.name },
  });
  if (existing) {
    return NextResponse.json(
      { error: "A category with that name already exists." },
      { status: 409 },
    );
  }

  const max = await prisma.category.aggregate({ _max: { sortOrder: true } });
  const category = await prisma.category.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      itilMapping: parsed.data.itilMapping,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
  });

  await recordAudit({
    actorUserId: actor.id,
    action: "admin.category.create",
    target: category.name,
  });

  return NextResponse.json({ category });
}

const UpdateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  itilMapping: z.string().max(100).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = UpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const { id, ...data } = parsed.data;

  const category = await prisma.category.update({ where: { id }, data });

  await recordAudit({
    actorUserId: actor.id,
    action: "admin.category.update",
    target: category.name,
    metadata: data,
  });

  return NextResponse.json({ category });
}
