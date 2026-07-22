import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/identity";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** GET — all selected SharePoint sources, newest first. */
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const sources = await prisma.kbSource.findMany({
    orderBy: { selectedAt: "desc" },
  });
  return NextResponse.json({ sources });
}

const SourceSchema = z.object({
  siteId: z.string().min(1),
  siteName: z.string().min(1),
  driveId: z.string().min(1),
  driveName: z.string().min(1),
  folderItemId: z.string().min(1),
  folderPath: z.string().min(1),
  folderName: z.string().min(1),
  includeSubfolders: z.boolean(),
});

/**
 * POST — add a SharePoint folder to the knowledge base. Multiple folders can be
 * selected; each is synced independently. Adding the same folder twice is a
 * no-op that returns the existing row (409-free, idempotent).
 */
export async function POST(req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = SourceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // Guard against duplicates: the same folder (site + drive + item) may only be
  // added once. Return the existing row rather than creating a second one.
  const existing = await prisma.kbSource.findFirst({
    where: {
      siteId: parsed.data.siteId,
      driveId: parsed.data.driveId,
      folderItemId: parsed.data.folderItemId,
    },
  });
  if (existing) {
    return NextResponse.json({ source: existing, duplicate: true });
  }

  const source = await prisma.kbSource.create({
    data: { ...parsed.data, selectedBy: actor.email },
  });

  await recordAudit({
    actorUserId: actor.id,
    action: "admin.kb.source.add",
    target: source.folderPath,
    metadata: {
      siteName: source.siteName,
      driveName: source.driveName,
      includeSubfolders: source.includeSubfolders,
    },
  });

  return NextResponse.json({ source });
}
