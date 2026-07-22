import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/identity";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/sharepoint/status
 * Whether SharePoint browsing is configured. Browsing is app-only (no per-user
 * sign-in), so there is no "connected" grant state to report.
 */
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ configured: env.sharepoint.configured });
}
