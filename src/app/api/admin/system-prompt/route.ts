import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/identity";
import { getSystemPrompt, setSystemPrompt } from "@/lib/settings";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const prompt = await getSystemPrompt();
  return NextResponse.json({ prompt });
}

const BodySchema = z.object({
  content: z.string().min(20).max(20000),
  note: z.string().max(280).optional(),
});

export async function PUT(req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // Guard against em dashes in the prompt (house style).
  const content = parsed.data.content.replace(/—/g, "-");

  await setSystemPrompt(content, actor.email, parsed.data.note);

  await recordAudit({
    actorUserId: actor.id,
    action: "admin.system_prompt.update",
    target: "system_prompt",
    metadata: { note: parsed.data.note ?? null, length: content.length },
  });

  return NextResponse.json({ ok: true });
}
