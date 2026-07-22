import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/identity";
import { listDrives } from "@/lib/sharepoint";

export const dynamic = "force-dynamic";

/** GET /api/admin/sharepoint/drives?siteId= — document libraries in a site. */
export async function GET(req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json({ error: "siteId is required" }, { status: 400 });
  }

  const result = await listDrives(actor.id, siteId);
  if (!result.ok) return NextResponse.json({ needsAuth: true });
  return NextResponse.json({ items: result.items });
}
