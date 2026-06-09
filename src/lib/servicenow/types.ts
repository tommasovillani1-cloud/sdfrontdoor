/** ServiceNow integration configuration (stored in app_settings, secrets
 *  encrypted). Disabled by default; only activates when enabled with valid
 *  credentials. */

export type ServiceNowAuthType = "oauth2_client_credentials" | "basic";

export interface ServiceNowConfig {
  enabled: boolean;
  instanceUrl: string; // e.g. https://dev12345.service-now.com
  authType: ServiceNowAuthType;
  // OAuth 2.0 (client credentials)
  oauthClientId?: string;
  oauthClientSecretEnc?: string; // encrypted
  oauthTokenUrl?: string; // defaults to <instanceUrl>/oauth_token.do
  // Basic / integration user
  username?: string;
  passwordEnc?: string; // encrypted
}

export const DEFAULT_SERVICENOW_CONFIG: ServiceNowConfig = {
  enabled: false,
  instanceUrl: "",
  authType: "oauth2_client_credentials",
};

/** A redacted view safe to send to the browser (no secrets). */
export interface ServiceNowConfigPublic {
  enabled: boolean;
  instanceUrl: string;
  authType: ServiceNowAuthType;
  oauthClientId?: string;
  oauthTokenUrl?: string;
  username?: string;
  hasClientSecret: boolean;
  hasPassword: boolean;
}

// --- MCP-style capability contracts (stubbed now, implemented later) --------

export interface IncidentInput {
  shortDescription: string;
  description?: string;
  callerEmail?: string;
  urgency?: "low" | "medium" | "high";
}

export interface ChangeRequestInput {
  shortDescription: string;
  description?: string;
  type?: "standard" | "normal" | "emergency";
}

export interface TicketRef {
  number: string; // e.g. INC0012345 / CHG0007654
}

export interface TicketStatus {
  number: string;
  state: string;
  shortDescription: string;
  updatedAt: string | null;
}

export interface TicketContent extends TicketStatus {
  description: string;
  comments: { author: string; body: string; createdAt: string }[];
}

/** The capability surface the MCP server exposes. */
export interface ServiceNowCapabilities {
  logIncident(input: IncidentInput): Promise<TicketRef>;
  logChangeRequest(input: ChangeRequestInput): Promise<TicketRef>;
  getTicketStatus(number: string): Promise<TicketStatus>;
  resolveTicket(number: string, resolutionNote: string): Promise<TicketStatus>;
  readTicket(number: string): Promise<TicketContent>;
}
