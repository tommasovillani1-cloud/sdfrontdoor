import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/identity";
import { listSites } from "@/lib/sharepoint";

export const dynamic = "force-dynamic";

/** GET /api/admin/sharepoint/sites?q= — SharePoint sites (app-only). */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const result = await listSites(q);
  if (!result.ok) {
    return NextResponse.json(
      { error: "Could not list SharePoint sites." },
      { status: 502 },
    );
  }
  return NextResponse.json({ items: result.items });
}
