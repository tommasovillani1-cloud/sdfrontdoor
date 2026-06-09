import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/identity";
import { recordAudit } from "@/lib/audit";
import { resolveCollision, buildDocumentPath } from "@/lib/kb/paths";
import { uploadToVolume, triggerProcessingJob } from "@/lib/kb/databricks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/admin/kb/documents?folderId=... — documents in a folder. */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const folderId = req.nextUrl.searchParams.get("folderId");
  if (!folderId) {
    return NextResponse.json({ documents: [] });
  }
  const documents = await prisma.kbDocument.findMany({
    where: { folderId },
    orderBy: { uploadedAt: "desc" },
  });
  return NextResponse.json({ documents });
}

/**
 * POST /api/admin/kb/documents  (multipart/form-data)
 * fields: folderId, file, optional categoryId, optional owner
 *
 * Preserves the original filename verbatim, versions on collision, uploads to
 * the Volume (no-op when unconfigured), registers the document, and triggers
 * async processing. The registry/UI work even when Databricks is absent: the
 * doc is recorded as pending so the flow is demonstrable end to end.
 */
export async function POST(req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Expected multipart form" }, { status: 400 });
  }

  const folderId = String(form.get("folderId") ?? "");
  const categoryId = form.get("categoryId") ? String(form.get("categoryId")) : null;
  const owner = form.get("owner") ? String(form.get("owner")) : null;
  const file = form.get("file");

  if (!folderId || !(file instanceof File)) {
    return NextResponse.json({ error: "folderId and file are required" }, { status: 400 });
  }

  const folder = await prisma.kbFolder.findUnique({ where: { id: folderId } });
  if (!folder) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  // Preserve the original filename; version on collision within this folder.
  const existingDocs = await prisma.kbDocument.findMany({
    where: { folderId },
    select: { originalFilename: true },
  });
  const existingNames = new Set(existingDocs.map((d) => d.originalFilename));
  const { filename, version } = resolveCollision(file.name, existingNames);

  const volumePath = buildDocumentPath(folder.path, filename);
  const bytes = Buffer.from(await file.arrayBuffer());

  // Upload to the Volume (clean no-op if Databricks not configured).
  const upload = await uploadToVolume(volumePath, bytes);

  // Register the document (status pending). Even without Databricks, we record
  // it so the admin UI and the flow are demonstrable.
  const doc = await prisma.kbDocument.create({
    data: {
      folderId,
      originalFilename: filename,
      volumePath,
      contentType: file.type || null,
      version,
      isActive: true,
      status: "pending",
      categoryId,
      uploadedBy: actor.email,
      owner,
    },
  });

  // Trigger async processing (parse/chunk/write to kb_chunks). No-op if unconfig.
  const job = await triggerProcessingJob({
    documentId: doc.id,
    volumePath,
    originalFilename: filename,
    folderPath: folder.path,
    category: categoryId,
  });

  await recordAudit({
    actorUserId: actor.id,
    action: "admin.kb.document.upload",
    target: volumePath,
    metadata: {
      uploadedToVolume: upload.uploaded,
      processingTriggered: job.triggered,
      version,
    },
  });

  return NextResponse.json({
    document: doc,
    uploadedToVolume: upload.uploaded,
    processingTriggered: job.triggered,
    notes:
      !upload.uploaded || !job.triggered
        ? "Databricks is not fully configured, so the document was registered but not uploaded/processed. It will work once KB_* values are set."
        : undefined,
  });
}
