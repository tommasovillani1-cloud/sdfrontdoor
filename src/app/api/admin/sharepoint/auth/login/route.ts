import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/identity";
import { encryptSecret } from "@/lib/crypto";
import {
  createPkce,
  buildAuthorizeUrl,
  computeRedirectUri,
} from "@/lib/sharepoint";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Cookie holding the (encrypted) PKCE verifier + state. No tokens inside. */
const PKCE_COOKIE = "sp_browse_pkce";

/**
 * GET /api/admin/sharepoint/auth/login
 *
 * Starts the delegated SharePoint sign-in. Generates PKCE + state, stashes them
 * in a short-lived encrypted cookie, and 302s the admin to Microsoft's authorize
 * endpoint. Returns { configured: false } (200) when the browse app is not set
 * up, so the UI can show a clean "not configured" note.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!env.sharepointBrowse.configured) {
    return NextResponse.json({ configured: false });
  }

  const redirectUri = computeRedirectUri(req.headers);
  const { pkce, challenge } = createPkce();
  const authorizeUrl = buildAuthorizeUrl(redirectUri, challenge, pkce.state);

  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set(PKCE_COOKIE, encryptSecret(JSON.stringify(pkce)), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes to complete the round-trip
  });
  return res;
}
