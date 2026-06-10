import { env } from "./env";

/**
 * Microsoft Graph enrichment using one app-only service principal.
 * Fetches displayName + country for a user, looked up by email (UPN/mail).
 *
 * Degrades cleanly: if Graph is not configured (local dev) or a lookup fails,
 * returns null and the caller falls back to email-derived values.
 */

interface GraphProfile {
  displayName: string | null;
  country: string | null;
  preferredLanguage: string | null;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAppToken(): Promise<string | null> {
  if (!env.graph.configured) return null;

  // Reuse a still-valid token (60s safety margin).
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const url = `https://login.microsoftonline.com/${env.graph.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: env.graph.clientId,
    client_secret: env.graph.clientSecret,
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
      console.error("Graph token request failed:", res.status);
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
    console.error("Graph token error:", (err as Error).message);
    return null;
  }
}

/**
 * Look up a user by email. Tries direct /users/{email} (works when email is
 * the UPN), then falls back to a $filter on mail.
 */
export async function getGraphProfile(
  email: string,
): Promise<GraphProfile | null> {
  const token = await getAppToken();
  if (!token) return null;

  const select = "displayName,country,preferredLanguage";
  const headers = { Authorization: `Bearer ${token}` };

  try {
    // Primary: treat email as UPN.
    const direct = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
        email,
      )}?$select=${select}`,
      { headers, cache: "no-store" },
    );
    if (direct.ok) {
      const u = (await direct.json()) as GraphProfile;
      return {
        displayName: u.displayName ?? null,
        country: u.country ?? null,
        preferredLanguage: u.preferredLanguage ?? null,
      };
    }

    // Fallback: filter on mail.
    const filtered = await fetch(
      `https://graph.microsoft.com/v1.0/users?$filter=${encodeURIComponent(
        `mail eq '${email}'`,
      )}&$select=${select}`,
      { headers, cache: "no-store" },
    );
    if (filtered.ok) {
      const data = (await filtered.json()) as { value: GraphProfile[] };
      const u = data.value?.[0];
      if (u) {
        return {
          displayName: u.displayName ?? null,
          country: u.country ?? null,
          preferredLanguage: u.preferredLanguage ?? null,
        };
      }
    }
  } catch (err) {
    console.error("Graph profile lookup error:", (err as Error).message);
  }

  return null;
}
