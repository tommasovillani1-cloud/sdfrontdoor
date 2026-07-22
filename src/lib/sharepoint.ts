import { env } from "./env";

/**
 * SharePoint browse layer (APP-ONLY identity).
 *
 * Browsing uses the SharePoint Entra app (SHAREPOINT_*) as the application
 * itself, via a client-credentials token with the app's Application
 * Sites.Read.All permission (admin-consented). There is no interactive
 * sign-in: the folder picker lists whatever the service principal can read
 * across the tenant. This mirrors the app-only pattern in graph.ts and matches
 * the Databricks sync job, which uses the same registration the same way.
 *
 * Everything degrades cleanly: when SharePoint is not configured, callers get
 * a not-ok result and the UI shows a "not configured" note. Nothing throws.
 */

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// --------------------------------------------------------------------------
// App-only token (client credentials). Cached with a 60s safety margin,
// mirroring graph.ts getAppToken.
// --------------------------------------------------------------------------

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAppToken(): Promise<string | null> {
  if (!env.sharepoint.configured) return null;

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const url = `https://login.microsoftonline.com/${env.sharepoint.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: env.sharepoint.clientId,
    client_secret: env.sharepoint.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("SharePoint token request failed:", res.status);
      return null;
    }
    const json = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    cachedToken = {
      value: json.access_token,
      expiresAt: Date.now() + json.expires_in * 1000,
    };
    return cachedToken.value;
  } catch (err) {
    console.error("SharePoint token error:", (err as Error).message);
    return null;
  }
}

// --------------------------------------------------------------------------
// Graph browse helpers (app-only). Return typed items, or a not-ok signal.
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

/** Discriminated result so callers can render a clean error on failure. */
export type BrowseResult<T> =
  | { ok: true; items: T[] }
  | { ok: false; error: true };

const NOT_OK: BrowseResult<never> = { ok: false, error: true };
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

/** List sites (search; blank query returns all/most-relevant). */
export async function listSites(
  query?: string,
): Promise<BrowseResult<SharePointSite>> {
  const token = await getAppToken();
  if (!token) return NOT_OK;

  const search = query?.trim() ? query.trim() : "*";
  const url = `${GRAPH_BASE}/sites?search=${encodeURIComponent(search)}&$select=id,displayName,name,webUrl`;
  const rows = await graphGetAll<{
    id: string;
    displayName?: string;
    name?: string;
    webUrl: string;
  }>(url, token);
  if (rows === null) return NOT_OK;

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
  siteId: string,
): Promise<BrowseResult<SharePointDrive>> {
  const token = await getAppToken();
  if (!token) return NOT_OK;

  const url = `${GRAPH_BASE}/sites/${encodeURIComponent(siteId)}/drives?$select=id,name,webUrl`;
  const rows = await graphGetAll<{ id: string; name: string; webUrl: string }>(
    url,
    token,
  );
  if (rows === null) return NOT_OK;

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
  driveId: string,
  itemId?: string,
): Promise<BrowseResult<SharePointFolder>> {
  const token = await getAppToken();
  if (!token) return NOT_OK;

  const childrenPath = itemId
    ? `items/${encodeURIComponent(itemId)}/children`
    : `root/children`;
  const url = `${GRAPH_BASE}/drives/${encodeURIComponent(driveId)}/${childrenPath}?$select=id,name,folder`;
  const rows = await graphGetAll<{
    id: string;
    name: string;
    folder?: { childCount?: number };
  }>(url, token);
  if (rows === null) return NOT_OK;

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
