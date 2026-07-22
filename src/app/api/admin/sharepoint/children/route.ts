import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/identity";
import { listFolderChildren } from "@/lib/sharepoint";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/sharepoint/children?driveId=&itemId=
 * Sub-folders of a drive folder (root when itemId omitted). Folders only.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const driveId = req.nextUrl.searchParams.get("driveId");
  const itemId = req.nextUrl.searchParams.get("itemId") ?? undefined;
  if (!driveId) {
    return NextResponse.json({ error: "driveId is required" }, { status: 400 });
  }

  const result = await listFolderChildren(driveId, itemId);
  if (!result.ok) {
    return NextResponse.json(
      { error: "Could not list folders." },
      { status: 502 },
    );
  }
  return NextResponse.json({ items: result.items });
}
