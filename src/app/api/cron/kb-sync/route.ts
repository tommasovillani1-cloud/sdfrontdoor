import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getSetting, setSetting } from "@/lib/settings";
import { SETTINGS_KEYS, SYNC_CADENCE_MS, type SyncCadence } from "@/lib/constants";
import {
  triggerSharePointSyncJob,
  triggerIndexSync,
  isProcessingJobConfigured,
} from "@/lib/kb/databricks";

export const dynamic = "force-dynamic";

/**
 * POST /api/cron/kb-sync
 *
 * Cadence-driven KB sync (brief section 6). Designed to be called frequently
 * (e.g. hourly) by a Databricks Workflow. It compares the configured cadence
 * against the last successful sync timestamp and only triggers a sync when due,
 * so cadence is fully app-controlled without reprogramming Databricks schedules.
 *
 * Protected by the same shared secret as the retention cron.
 */
function authorised(req: NextRequest): boolean {
  if (!env.cronSecret) return false;
  const header = req.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : null;
  const query = req.nextUrl.searchParams.get("secret");
  return bearer === env.cronSecret || query === env.cronSecret;
}

export async function POST(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  if (!isProcessingJobConfigured()) {
    return NextResponse.json({
      ok: true,
      skipped: "job_not_configured",
    });
  }

  const sources = await prisma.kbSource.findMany({
    orderBy: { selectedAt: "desc" },
  });
  if (sources.length === 0) {
    return NextResponse.json({
      ok: true,
      skipped: "no_source_selected",
    });
  }

  const [cadence, lastSyncAt] = await Promise.all([
    getSetting<SyncCadence>(SETTINGS_KEYS.kbSyncCadence, "daily"),
    getSetting<string | null>(SETTINGS_KEYS.kbLastSyncAt, null),
  ]);

  const intervalMs = SYNC_CADENCE_MS[cadence];
  const now = Date.now();
  const last = lastSyncAt ? new Date(lastSyncAt).getTime() : 0;
  const due = now - last >= intervalMs;

  if (!due) {
    return NextResponse.json({
      ok: true,
      due: false,
      cadence,
      lastSyncAt,
      nextDueInMs: intervalMs - (now - last),
    });
  }

  // Trigger one SharePoint sync Job run per folder (each does its own
  // incremental delta), then a single index sync.
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
  const index = jobsTriggered > 0 ? await triggerIndexSync() : { triggered: false };
  const iso = new Date(now).toISOString();
  if (jobsTriggered > 0) {
    await setSetting(SETTINGS_KEYS.kbLastSyncAt, iso);
  }

  return NextResponse.json({
    ok: true,
    due: true,
    jobsTriggered,
    sourceCount: sources.length,
    indexTriggered: index.triggered,
    cadence,
    lastSyncAt: jobsTriggered > 0 ? iso : lastSyncAt,
  });
}
