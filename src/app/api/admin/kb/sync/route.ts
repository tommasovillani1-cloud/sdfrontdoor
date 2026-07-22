import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/identity";
import { recordAudit } from "@/lib/audit";
import { getSetting, setSetting } from "@/lib/settings";
import { SETTINGS_KEYS, SYNC_CADENCES, type SyncCadence } from "@/lib/constants";
import {
  triggerSharePointSyncJob,
  triggerIndexSync,
  isIndexConfigured,
} from "@/lib/kb/databricks";

export const dynamic = "force-dynamic";

/** GET — current cadence, last sync time, and whether the index is provisioned. */
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const [cadence, lastSyncAt] = await Promise.all([
    getSetting<SyncCadence>(SETTINGS_KEYS.kbSyncCadence, "daily"),
    getSetting<string | null>(SETTINGS_KEYS.kbLastSyncAt, null),
  ]);
  return NextResponse.json({
    cadence,
    lastSyncAt,
    indexConfigured: isIndexConfigured(),
  });
}

const CadenceSchema = z.object({ cadence: z.enum(SYNC_CADENCES) });

/** PATCH — set the cadence. */
export async function PATCH(req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = CadenceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  await setSetting(SETTINGS_KEYS.kbSyncCadence, parsed.data.cadence);
  await recordAudit({
    actorUserId: actor.id,
    action: "admin.kb.sync.cadence",
    target: parsed.data.cadence,
  });
  return NextResponse.json({ ok: true, cadence: parsed.data.cadence });
}

/**
 * POST — manual "Sync now". Triggers the SharePoint sync Job for the selected
 * folder (the Job does the incremental delta), then the index sync, and records
 * the time. No-ops cleanly when no folder is selected or Databricks is absent.
 */
export async function POST(_req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const source = await prisma.kbSource.findFirst({
    orderBy: { selectedAt: "desc" },
  });
  if (!source) {
    return NextResponse.json({
      ok: true,
      jobTriggered: false,
      indexTriggered: false,
      note: "No SharePoint folder is selected yet, so there is nothing to sync.",
    });
  }

  const job = await triggerSharePointSyncJob({
    siteId: source.siteId,
    driveId: source.driveId,
    folderItemId: source.folderItemId,
    folderPath: source.folderPath,
    includeSubfolders: source.includeSubfolders,
  });
  const index = await triggerIndexSync();

  const now = new Date().toISOString();
  if (job.triggered) {
    await setSetting(SETTINGS_KEYS.kbLastSyncAt, now);
  }

  await recordAudit({
    actorUserId: actor.id,
    action: "admin.kb.sync.manual",
    target: source.folderPath,
    metadata: { jobTriggered: job.triggered, indexTriggered: index.triggered },
  });

  return NextResponse.json({
    ok: true,
    jobTriggered: job.triggered,
    indexTriggered: index.triggered,
    lastSyncAt: job.triggered ? now : null,
    note: job.triggered
      ? undefined
      : "Databricks is not fully configured, so the sync Job was not triggered. Set DATABRICKS_* and KB_PROCESSING_JOB_ID to enable.",
  });
}
