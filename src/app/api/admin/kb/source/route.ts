import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/identity";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** The single selected SharePoint source (one folder at a time). */
async function currentSource() {
  return prisma.kbSource.findFirst({ orderBy: { selectedAt: "desc" } });
}

/** GET — the currently selected SharePoint source, or null. */
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ source: await currentSource() });
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
 * PUT — set (replace) the selected SharePoint source. Only one source exists at
 * a time, so any previous selection is cleared and a fresh row written.
 */
export async function PUT(req: NextRequest) {
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

  const [, source] = await prisma.$transaction([
    prisma.kbSource.deleteMany({}),
    prisma.kbSource.create({
      data: { ...parsed.data, selectedBy: actor.email },
    }),
  ]);

  await recordAudit({
    actorUserId: actor.id,
    action: "admin.kb.source.set",
    target: source.folderPath,
    metadata: {
      siteName: source.siteName,
      driveName: source.driveName,
      includeSubfolders: source.includeSubfolders,
    },
  });

  return NextResponse.json({ source });
}

/** DELETE — clear the selected source. */
export async function DELETE() {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.kbSource.deleteMany({});
  await recordAudit({
    actorUserId: actor.id,
    action: "admin.kb.source.clear",
  });
  return NextResponse.json({ ok: true });
}
