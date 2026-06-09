import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/identity";
import { recordAudit } from "@/lib/audit";
import { triggerProcessingJob } from "@/lib/kb/databricks";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  isActive: z.boolean().optional(),
  categoryId: z.string().nullable().optional(),
  owner: z.string().nullable().optional(),
  lastReviewed: z.boolean().optional(), // true -> set to now
});

/** PATCH /api/admin/kb/documents/:id — activate/deactivate, category, owner, review. */
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
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const data: {
    isActive?: boolean;
    categoryId?: string | null;
    owner?: string | null;
    lastReviewed?: Date;
  } = {};
  if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;
  if (parsed.data.categoryId !== undefined) data.categoryId = parsed.data.categoryId;
  if (parsed.data.owner !== undefined) data.owner = parsed.data.owner;
  if (parsed.data.lastReviewed) data.lastReviewed = new Date();

  const doc = await prisma.kbDocument.update({
    where: { id: params.id },
    data,
  });

  await recordAudit({
    actorUserId: actor.id,
    action: "admin.kb.document.update",
    target: doc.volumePath,
    metadata: {
      isActive: data.isActive ?? null,
      categoryId: data.categoryId ?? null,
      owner: data.owner ?? null,
      lastReviewed: data.lastReviewed?.toISOString() ?? null,
    },
  });

  return NextResponse.json({ document: doc });
}

/** POST /api/admin/kb/documents/:id (reprocess) */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const doc = await prisma.kbDocument.findUnique({
    where: { id: params.id },
    include: { folder: true },
  });
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.kbDocument.update({
    where: { id: doc.id },
    data: { status: "pending", errorMessage: null },
  });

  const job = await triggerProcessingJob({
    documentId: doc.id,
    volumePath: doc.volumePath,
    originalFilename: doc.originalFilename,
    folderPath: doc.folder.path,
    category: doc.categoryId,
  });

  await recordAudit({
    actorUserId: actor.id,
    action: "admin.kb.document.reprocess",
    target: doc.volumePath,
    metadata: { triggered: job.triggered },
  });

  return NextResponse.json({ ok: true, processingTriggered: job.triggered });
}

/** DELETE /api/admin/kb/documents/:id */
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
  const doc = await prisma.kbDocument.findUnique({ where: { id: params.id } });
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.kbDocument.delete({ where: { id: params.id } });
  await recordAudit({
    actorUserId: actor.id,
    action: "admin.kb.document.delete",
    target: doc.volumePath,
  });
  return NextResponse.json({ ok: true });
}
