import crypto from "crypto";
import { prisma } from "./db";
import { env } from "./env";
import { encryptSecret, decryptSecret } from "./crypto";

/**
 * SharePoint browse layer (DELEGATED identity).
 *
 * The admin signs in through the SharePoint Entra app (SHAREPOINT_*) via an
 * OAuth auth-code + PKCE flow, so they browse SharePoint as themselves and only
 * see what they can access. Tokens are stored per user, encrypted at rest with
 * APP_ENCRYPTION_KEY. This is entirely separate from the app-only Graph
 * enrichment identity (graph.ts) and from the backend sync identity, which runs
 * inside the Databricks job.
 *
 * Everything degrades cleanly: when the browse app is not configured, or the
 * admin has no live grant, callers get null / needsAuth and the UI prompts to
 * connect. Nothing throws.
 */

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

/** Delegated scopes: read SharePoint + a refresh token to stay alive browsing. */
export const BROWSE_SCOPES = [
  "openid",
  "profile",
  "offline_access",
  "User.Read",
  "Sites.Read.All",
].join(" ");

const AUTH_CALLBACK_PATH = "/api/admin/sharepoint/auth/callback";

// --------------------------------------------------------------------------
// OAuth endpoints + redirect URI
// --------------------------------------------------------------------------

function authorizeEndpoint(): string {
  return `https://login.microsoftonline.com/${env.sharepoint.tenantId}/oauth2/v2.0/authorize`;
}

function tokenEndpoint(): string {
  return `https://login.microsoftonline.com/${env.sharepoint.tenantId}/oauth2/v2.0/token`;
}

/**
 * Compute the OAuth redirect URI. Prefer APP_BASE_URL when set; otherwise derive
 * the origin from the forwarded proto/host headers the Databricks App provides.
 */
export function computeRedirectUri(headers: Headers): string {
  const base = env.appBaseUrl.trim();
  if (base) return `${base.replace(/\/$/, "")}${AUTH_CALLBACK_PATH}`;

  const proto = headers.get("x-forwarded-proto") || "https";
  const host =
    headers.get("x-forwarded-host") || headers.get("host") || "localhost:3000";
  return `${proto}://${host}${AUTH_CALLBACK_PATH}`;
}

// --------------------------------------------------------------------------
// PKCE + state
// --------------------------------------------------------------------------

export interface PkceState {
  verifier: string;
  state: string;
}

/** Generate a PKCE verifier/challenge pair plus an anti-CSRF state value. */
export function createPkce(): { pkce: PkceState; challenge: string } {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  const state = crypto.randomBytes(16).toString("base64url");
  return { pkce: { verifier, state }, challenge };
}

/** Build the Microsoft authorize URL for the interactive sign-in redirect. */
export function buildAuthorizeUrl(redirectUri: string, challenge: string, state: string): string {
  const params = new URLSearchParams({
    client_id: env.sharepoint.clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: BROWSE_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${authorizeEndpoint()}?${params.toString()}`;
}

// --------------------------------------------------------------------------
// Token exchange + storage
// --------------------------------------------------------------------------

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

async function requestToken(
  body: URLSearchParams,
): Promise<TokenResponse | null> {
  try {
    const res = await fetch(tokenEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("SharePoint token request failed:", res.status);
      return null;
    }
    return (await res.json()) as TokenResponse;
  } catch (err) {
    console.error("SharePoint token error:", (err as Error).message);
    return null;
  }
}

/** Persist (encrypted) tokens for a user, upserting the single row. */
async function persistTokens(userId: string, tok: TokenResponse, previousRefresh?: string) {
  // Azure may or may not rotate the refresh token; keep the previous one if the
  // response omits it (e.g. on a plain refresh).
  const refresh = tok.refresh_token || previousRefresh;
  if (!refresh) return; // cannot persist a usable session without a refresh token
  const expiresAt = new Date(Date.now() + tok.expires_in * 1000);
  const data = {
    accessToken: encryptSecret(tok.access_token),
    refreshToken: encryptSecret(refresh),
    expiresAt,
    scope: tok.scope ?? null,
  };
  await prisma.sharePointBrowseToken.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}

/**
 * Exchange an authorization code for tokens and store them for the user.
 * Returns true on success.
 */
export async function exchangeCodeForTokens(
  userId: string,
  code: string,
  redirectUri: string,
  verifier: string,
): Promise<boolean> {
  if (!env.sharepoint.configured) return false;
  const body = new URLSearchParams({
    client_id: env.sharepoint.clientId,
    client_secret: env.sharepoint.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
    scope: BROWSE_SCOPES,
  });
  const tok = await requestToken(body);
  if (!tok) return false;
  await persistTokens(userId, tok);
  return true;
}

/**
 * Return a valid delegated access token for the user, refreshing if needed.
 * Returns null when the browse app is unconfigured, there is no stored grant,
 * or a refresh fails (the caller then treats it as "needs sign-in").
 */
export async function getDelegatedToken(userId: string): Promise<string | null> {
  if (!env.sharepoint.configured) return null;

  const row = await prisma.sharePointBrowseToken.findUnique({ where: { userId } });
  if (!row) return null;

  // Reuse a still-valid token (60s safety margin, matching graph.ts).
  if (row.expiresAt.getTime() > Date.now() + 60_000) {
    try {
      return decryptSecret(row.accessToken);
    } catch {
      // Fall through to a refresh attempt if decryption fails.
    }
  }

  let refreshToken: string;
  try {
    refreshToken = decryptSecret(row.refreshToken);
  } catch {
    return null;
  }

  const body = new URLSearchParams({
    client_id: env.sharepoint.clientId,
    client_secret: env.sharepoint.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: BROWSE_SCOPES,
  });
  const tok = await requestToken(body);
  if (!tok) return null;
  await persistTokens(userId, tok, refreshToken);
  return tok.access_token;
}

/** Whether the user currently holds a stored browse grant. */
export async function hasBrowseGrant(userId: string): Promise<boolean> {
  const row = await prisma.sharePointBrowseToken.findUnique({
    where: { userId },
    select: { userId: true },
  });
  return Boolean(row);
}

/** Remove a user's stored browse grant (disconnect). */
export async function clearBrowseGrant(userId: string): Promise<void> {
  await prisma.sharePointBrowseToken
    .delete({ where: { userId } })
    .catch(() => undefined);
}

// --------------------------------------------------------------------------
// Graph browse helpers (delegated). Return typed items, or a needsAuth signal.
// --------------------------------------------------------------------------

export interface SharePointSite {
  id: string;
  name: string;
  webUrl: string;
}

export interface SharePointDrive {
  id: string;
  name: string;
  webUrl: string;
}

export interface SharePointFolder {
  id: string;
  name: string;
  childCount: number;
}

/** Discriminated result so callers can render a "connect" prompt on needsAuth. */
export type BrowseResult<T> =
  | { ok: true; items: T[] }
  | { ok: false; needsAuth: true };

const NEEDS_AUTH: BrowseResult<never> = { ok: false, needsAuth: true };
const MAX_PAGES = 20;

/** Follow @odata.nextLink, accumulating values, with a page cap. */
async function graphGetAll<T>(
  firstUrl: string,
  token: string,
): Promise<T[] | null> {
  const out: T[] = [];
  let url: string | null = firstUrl;
  let pages = 0;
  try {
    while (url && pages < MAX_PAGES) {
      const res: Response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        console.error("SharePoint browse non-OK:", res.status);
        return null;
      }
      const data = (await res.json()) as {
        value?: T[];
        "@odata.nextLink"?: string;
      };
      if (data.value) out.push(...data.value);
      url = data["@odata.nextLink"] ?? null;
      pages++;
    }
    return out;
  } catch (err) {
    console.error("SharePoint browse error:", (err as Error).message);
    return null;
  }
}

/** List sites the admin can see (search; blank query returns all/most-relevant). */
export async function listSites(
  userId: string,
  query?: string,
): Promise<BrowseResult<SharePointSite>> {
  const token = await getDelegatedToken(userId);
  if (!token) return NEEDS_AUTH;

  const search = query?.trim() ? query.trim() : "*";
  const url = `${GRAPH_BASE}/sites?search=${encodeURIComponent(search)}&$select=id,displayName,name,webUrl`;
  const rows = await graphGetAll<{
    id: string;
    displayName?: string;
    name?: string;
    webUrl: string;
  }>(url, token);
  if (rows === null) return NEEDS_AUTH;

  return {
    ok: true,
    items: rows.map((s) => ({
      id: s.id,
      name: s.displayName || s.name || s.webUrl,
      webUrl: s.webUrl,
    })),
  };
}

/** List document libraries (drives) in a site. */
export async function listDrives(
  userId: string,
  siteId: string,
): Promise<BrowseResult<SharePointDrive>> {
  const token = await getDelegatedToken(userId);
  if (!token) return NEEDS_AUTH;

  const url = `${GRAPH_BASE}/sites/${encodeURIComponent(siteId)}/drives?$select=id,name,webUrl`;
  const rows = await graphGetAll<{ id: string; name: string; webUrl: string }>(
    url,
    token,
  );
  if (rows === null) return NEEDS_AUTH;

  return {
    ok: true,
    items: rows.map((d) => ({ id: d.id, name: d.name, webUrl: d.webUrl })),
  };
}

/**
 * List sub-folders of a drive folder. When itemId is omitted, lists the drive
 * root's folders. Only folder items are returned (files are not selectable).
 */
export async function listFolderChildren(
  userId: string,
  driveId: string,
  itemId?: string,
): Promise<BrowseResult<SharePointFolder>> {
  const token = await getDelegatedToken(userId);
  if (!token) return NEEDS_AUTH;

  const childrenPath = itemId
    ? `items/${encodeURIComponent(itemId)}/children`
    : `root/children`;
  const url = `${GRAPH_BASE}/drives/${encodeURIComponent(driveId)}/${childrenPath}?$select=id,name,folder`;
  const rows = await graphGetAll<{
    id: string;
    name: string;
    folder?: { childCount?: number };
  }>(url, token);
  if (rows === null) return NEEDS_AUTH;

  return {
    ok: true,
    items: rows
      .filter((i) => i.folder)
      .map((i) => ({
        id: i.id,
        name: i.name,
        childCount: i.folder?.childCount ?? 0,
      })),
  };
}
