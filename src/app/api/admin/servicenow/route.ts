import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/identity";
import { recordAudit } from "@/lib/audit";
import {
  getServiceNowConfigPublic,
  saveServiceNowConfig,
} from "@/lib/servicenow/config";

export const dynamic = "force-dynamic";

/** GET — secret-free config for the form. */
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const config = await getServiceNowConfigPublic();
  return NextResponse.json({ config });
}

const SaveSchema = z.object({
  enabled: z.boolean(),
  instanceUrl: z.string().max(300),
  authType: z.enum(["oauth2_client_credentials", "basic"]),
  oauthClientId: z.string().max(300).optional(),
  oauthClientSecret: z.string().max(500).optional(),
  oauthTokenUrl: z.string().max(300).optional(),
  username: z.string().max(200).optional(),
  password: z.string().max(500).optional(),
});

/** PUT — save config. Secrets encrypted server-side; never logged. */
export async function PUT(req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = SaveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  await saveServiceNowConfig(parsed.data);

  // Audit WITHOUT any secret material.
  await recordAudit({
    actorUserId: actor.id,
    action: "admin.servicenow.update",
    target: parsed.data.instanceUrl || "(no instance)",
    metadata: {
      enabled: parsed.data.enabled,
      authType: parsed.data.authType,
      clientSecretProvided: Boolean(parsed.data.oauthClientSecret),
      passwordProvided: Boolean(parsed.data.password),
    },
  });

  return NextResponse.json({ ok: true });
}
