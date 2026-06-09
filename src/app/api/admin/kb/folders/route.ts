import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/identity";
import { recordAudit } from "@/lib/audit";
import {
  getFolderTree,
  createFolder,
  renameFolder,
  deleteFolder,
} from "@/lib/kb/folders";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const tree = await getFolderTree();
  return NextResponse.json({ tree });
}

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  parentId: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const folder = await createFolder(
    parsed.data.name,
    parsed.data.parentId ?? null,
  );
  await recordAudit({
    actorUserId: actor.id,
    action: "admin.kb.folder.create",
    target: folder.path,
  });
  return NextResponse.json({ folder });
}

const PatchSchema = z.object({ id: z.string(), name: z.string().min(1).max(120) });

export async function PATCH(req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const folder = await renameFolder(parsed.data.id, parsed.data.name);
  await recordAudit({
    actorUserId: actor.id,
    action: "admin.kb.folder.rename",
    target: folder.path,
  });
  return NextResponse.json({ folder });
}

export async function DELETE(req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  await deleteFolder(id);
  await recordAudit({
    actorUserId: actor.id,
    action: "admin.kb.folder.delete",
    target: id,
  });
  return NextResponse.json({ ok: true });
}
