import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/identity";
import { recordAudit } from "@/lib/audit";
import { decryptSecret } from "@/lib/crypto";
import {
  exchangeCodeForTokens,
  computeRedirectUri,
  type PkceState,
} from "@/lib/sharepoint";

export const dynamic = "force-dynamic";

const PKCE_COOKIE = "sp_browse_pkce";
const KB_PAGE = "/admin/knowledge-base";

/** Redirect back to the KB page with a status flag for the UI to surface. */
function backToKb(req: NextRequest, status: string): NextResponse {
  const url = new URL(KB_PAGE, req.nextUrl.origin);
  url.searchParams.set("sp", status);
  const res = NextResponse.redirect(url);
  res.cookies.delete(PKCE_COOKIE);
  return res;
}

/**
 * GET /api/admin/sharepoint/auth/callback
 *
 * Completes the delegated sign-in: validates state against the PKCE cookie
 * (CSRF), exchanges the code for tokens, stores them (encrypted) for the admin,
 * then redirects back to the KB page. All failures redirect with sp=error
 * rather than dumping a stack.
 */
export async function GET(req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");

  if (oauthError) return backToKb(req, "denied");
  if (!code || !state) return backToKb(req, "error");

  // Validate state against the encrypted PKCE cookie.
  const raw = req.cookies.get(PKCE_COOKIE)?.value;
  if (!raw) return backToKb(req, "error");
  let pkce: PkceState;
  try {
    pkce = JSON.parse(decryptSecret(raw)) as PkceState;
  } catch {
    return backToKb(req, "error");
  }
  if (pkce.state !== state) return backToKb(req, "error");

  const redirectUri = computeRedirectUri(req.headers);
  const ok = await exchangeCodeForTokens(actor.id, code, redirectUri, pkce.verifier);

  await recordAudit({
    actorUserId: actor.id,
    action: "admin.kb.sharepoint.connect",
    metadata: { ok },
  });

  return backToKb(req, ok ? "connected" : "error");
}
