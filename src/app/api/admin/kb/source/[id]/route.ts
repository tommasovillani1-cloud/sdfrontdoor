import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/identity";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

const PatchSchema = z.object({
  includeSubfolders: z.boolean(),
});

/**
 * PATCH /api/admin/kb/source/[id]
 * Edit a selected source in place. The folder identity (site/drive/item) is
 * fixed once picked; the only editable setting is whether subfolders are
 * included. To point at a different folder, remove this one and add another.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
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

  const existing = await prisma.kbSource.findUnique({
    where: { id: params.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const source = await prisma.kbSource.update({
    where: { id: params.id },
    data: { includeSubfolders: parsed.data.includeSubfolders },
  });

  await recordAudit({
    actorUserId: actor.id,
    action: "admin.kb.source.edit",
    target: source.folderPath,
    metadata: { includeSubfolders: source.includeSubfolders },
  });

  return NextResponse.json({ source });
}

/**
 * DELETE /api/admin/kb/source/[id]
 * Remove a single source. Its chunks are dropped from the index on the next
 * sync (the Databricks job reconciles per folder).
 */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.kbSource.findUnique({
    where: { id: params.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.kbSource.delete({ where: { id: params.id } });

  await recordAudit({
    actorUserId: actor.id,
    action: "admin.kb.source.remove",
    target: existing.folderPath,
  });

  return NextResponse.json({ ok: true });
}
