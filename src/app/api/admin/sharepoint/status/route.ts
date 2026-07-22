import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/identity";
import { recordAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { hasBrowseGrant, clearBrowseGrant } from "@/lib/sharepoint";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/sharepoint/status
 * Whether the browse app is configured and whether this admin has a live grant.
 */
export async function GET() {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({
    configured: env.sharepoint.configured,
    connected: await hasBrowseGrant(actor.id),
  });
}

/** DELETE /api/admin/sharepoint/status — disconnect (drop the stored grant). */
export async function DELETE(_req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await clearBrowseGrant(actor.id);
  await recordAudit({
    actorUserId: actor.id,
    action: "admin.kb.sharepoint.disconnect",
  });
  return NextResponse.json({ ok: true });
}
