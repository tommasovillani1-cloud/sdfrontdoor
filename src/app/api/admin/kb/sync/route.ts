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
 * POST — manual "Sync now". Triggers one SharePoint sync Job run per selected
 * folder (each Job run does its own incremental delta), then a single index
 * sync, and records the time. No-ops cleanly when no folders are selected or
 * Databricks is absent.
 */
export async function POST(_req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sources = await prisma.kbSource.findMany({
    orderBy: { selectedAt: "desc" },
  });
  if (sources.length === 0) {
    return NextResponse.json({
      ok: true,
      jobsTriggered: 0,
      indexTriggered: false,
      note: "No SharePoint folders are selected yet, so there is nothing to sync.",
    });
  }

  const jobs = await Promise.all(
    sources.map((source) =>
      triggerSharePointSyncJob({
        siteId: source.siteId,
        driveId: source.driveId,
        folderItemId: source.folderItemId,
        folderPath: source.folderPath,
        includeSubfolders: source.includeSubfolders,
      }),
    ),
  );
  const jobsTriggered = jobs.filter((j) => j.triggered).length;
  // Run ids the client polls to report a real succeeded/failed outcome.
  const runIds = jobs
    .map((j) => j.runId)
    .filter((id): id is number => typeof id === "number");

  // Only sync the index once, after the per-folder jobs have been kicked off.
  const index = jobsTriggered > 0 ? await triggerIndexSync() : { triggered: false };

  const now = new Date().toISOString();
  if (jobsTriggered > 0) {
    await setSetting(SETTINGS_KEYS.kbLastSyncAt, now);
  }

  await recordAudit({
    actorUserId: actor.id,
    action: "admin.kb.sync.manual",
    target: `${sources.length} folder(s)`,
    metadata: {
      jobsTriggered,
      sourceCount: sources.length,
      indexTriggered: index.triggered,
    },
  });

  return NextResponse.json({
    ok: true,
    jobsTriggered,
    runIds,
    indexTriggered: index.triggered,
    lastSyncAt: jobsTriggered > 0 ? now : null,
    note:
      jobsTriggered > 0
        ? undefined
        : "Databricks is not fully configured, so the sync Job was not triggered. Set DATABRICKS_* and KB_PROCESSING_JOB_ID to enable.",
  });
}
