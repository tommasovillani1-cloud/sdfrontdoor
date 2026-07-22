import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/identity";
import { listSites } from "@/lib/sharepoint";

export const dynamic = "force-dynamic";

/** GET /api/admin/sharepoint/sites?q= — sites the signed-in admin can access. */
export async function GET(req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const result = await listSites(actor.id, q);
  if (!result.ok) return NextResponse.json({ needsAuth: true });
  return NextResponse.json({ items: result.items });
}
