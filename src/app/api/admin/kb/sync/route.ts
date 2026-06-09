import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/identity";
import { recordAudit } from "@/lib/audit";
import { getSetting, setSetting } from "@/lib/settings";
import { SETTINGS_KEYS, SYNC_CADENCES, type SyncCadence } from "@/lib/constants";
import { triggerIndexSync, isIndexConfigured } from "@/lib/kb/databricks";

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

/** POST — manual "Sync now". Triggers the index sync and records the time. */
export async function POST(_req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const result = await triggerIndexSync();
  const now = new Date().toISOString();
  if (result.triggered) {
    await setSetting(SETTINGS_KEYS.kbLastSyncAt, now);
  }
  await recordAudit({
    actorUserId: actor.id,
    action: "admin.kb.sync.manual",
    metadata: { triggered: result.triggered },
  });
  return NextResponse.json({
    ok: true,
    triggered: result.triggered,
    lastSyncAt: result.triggered ? now : null,
    note: result.triggered
      ? undefined
      : "The AI Search index is not provisioned, so there was nothing to sync. Set KB_VECTOR_* to enable.",
  });
}
