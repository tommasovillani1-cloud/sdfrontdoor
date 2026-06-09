import {
  getServiceNowConfig,
  decryptConfigSecret,
} from "./config";
import type {
  ServiceNowCapabilities,
  ServiceNowConfig,
  IncidentInput,
  ChangeRequestInput,
  TicketRef,
  TicketStatus,
  TicketContent,
} from "./types";

/**
 * ServiceNow MCP-style client (brief section 11).
 *
 * Built but DISABLED by default. It only activates when the admin enables it
 * with valid credentials. The capability methods are stubbed: the auth layer
 * (OAuth 2.0 client credentials OR basic/integration user) is wired and ready,
 * but the actual ServiceNow calls throw a clear "not implemented yet" so v1
 * relies on the email handoff. This keeps the surface defined for later.
 */

export class ServiceNowDisabledError extends Error {
  constructor() {
    super("ServiceNow integration is disabled.");
    this.name = "ServiceNowDisabledError";
  }
}

export class ServiceNowNotImplementedError extends Error {
  constructor(capability: string) {
    super(`ServiceNow capability "${capability}" is scaffolded but not implemented in v1.`);
    this.name = "ServiceNowNotImplementedError";
  }
}

/** Acquire an auth header per the configured auth type. Ready for real use. */
async function buildAuthHeader(
  config: ServiceNowConfig,
): Promise<Record<string, string>> {
  if (config.authType === "basic") {
    const password = decryptConfigSecret(config.passwordEnc);
    if (!config.username || !password) {
      throw new Error("ServiceNow basic auth is not fully configured.");
    }
    const token = Buffer.from(`${config.username}:${password}`).toString("base64");
    return { Authorization: `Basic ${token}` };
  }

  // OAuth 2.0 client credentials.
  const clientSecret = decryptConfigSecret(config.oauthClientSecretEnc);
  if (!config.oauthClientId || !clientSecret) {
    throw new Error("ServiceNow OAuth is not fully configured.");
  }
  const tokenUrl =
    config.oauthTokenUrl ||
    `${config.instanceUrl.replace(/\/$/, "")}/oauth_token.do`;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.oauthClientId,
    client_secret: clientSecret,
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`ServiceNow OAuth token request failed: ${res.status}`);
  }
  const json = (await res.json()) as { access_token: string };
  return { Authorization: `Bearer ${json.access_token}` };
}

class ServiceNowClient implements ServiceNowCapabilities {
  constructor(private config: ServiceNowConfig) {}

  private ensureEnabled() {
    if (!this.config.enabled) throw new ServiceNowDisabledError();
  }

  // The auth layer is exercised so it is ready; the actual REST calls are the
  // pieces deferred to a later version.
  private async authHeaders(): Promise<Record<string, string>> {
    return buildAuthHeader(this.config);
  }

  async logIncident(_input: IncidentInput): Promise<TicketRef> {
    this.ensureEnabled();
    await this.authHeaders();
    throw new ServiceNowNotImplementedError("logIncident");
  }

  async logChangeRequest(_input: ChangeRequestInput): Promise<TicketRef> {
    this.ensureEnabled();
    await this.authHeaders();
    throw new ServiceNowNotImplementedError("logChangeRequest");
  }

  async getTicketStatus(_number: string): Promise<TicketStatus> {
    this.ensureEnabled();
    await this.authHeaders();
    throw new ServiceNowNotImplementedError("getTicketStatus");
  }

  async resolveTicket(
    _number: string,
    _resolutionNote: string,
  ): Promise<TicketStatus> {
    this.ensureEnabled();
    await this.authHeaders();
    throw new ServiceNowNotImplementedError("resolveTicket");
  }

  async readTicket(_number: string): Promise<TicketContent> {
    this.ensureEnabled();
    await this.authHeaders();
    throw new ServiceNowNotImplementedError("readTicket");
  }
}

/** Returns a client only if the integration is enabled, else null. */
export async function getServiceNowClient(): Promise<ServiceNowCapabilities | null> {
  const config = await getServiceNowConfig();
  if (!config.enabled) return null;
  return new ServiceNowClient(config);
}

/** Lightweight status for the admin UI / health checks. */
export async function getServiceNowStatus(): Promise<{
  enabled: boolean;
  reachableConfig: boolean;
}> {
  const config = await getServiceNowConfig();
  const reachableConfig =
    config.authType === "basic"
      ? Boolean(config.instanceUrl && config.username && config.passwordEnc)
      : Boolean(
          config.instanceUrl &&
            config.oauthClientId &&
            config.oauthClientSecretEnc,
        );
  return { enabled: config.enabled, reachableConfig };
}
