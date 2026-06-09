import { getSetting, setSetting } from "@/lib/settings";
import { SETTINGS_KEYS } from "@/lib/constants";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import {
  DEFAULT_SERVICENOW_CONFIG,
  type ServiceNowConfig,
  type ServiceNowConfigPublic,
} from "./types";

/** Load the full config (with encrypted secrets in place). */
export async function getServiceNowConfig(): Promise<ServiceNowConfig> {
  return getSetting<ServiceNowConfig>(
    SETTINGS_KEYS.serviceNow,
    DEFAULT_SERVICENOW_CONFIG,
  );
}

/** Public, secret-free view for the admin UI. */
export async function getServiceNowConfigPublic(): Promise<ServiceNowConfigPublic> {
  const c = await getServiceNowConfig();
  return {
    enabled: c.enabled,
    instanceUrl: c.instanceUrl,
    authType: c.authType,
    oauthClientId: c.oauthClientId,
    oauthTokenUrl: c.oauthTokenUrl,
    username: c.username,
    hasClientSecret: Boolean(c.oauthClientSecretEnc),
    hasPassword: Boolean(c.passwordEnc),
  };
}

export interface ServiceNowConfigInput {
  enabled: boolean;
  instanceUrl: string;
  authType: ServiceNowConfig["authType"];
  oauthClientId?: string;
  oauthClientSecret?: string; // plaintext from the form; encrypted here
  oauthTokenUrl?: string;
  username?: string;
  password?: string; // plaintext from the form; encrypted here
}

/**
 * Persist config, encrypting any newly provided secrets. Secrets left blank in
 * the form are preserved from the existing config (so editing other fields does
 * not wipe stored credentials). Secrets are never logged.
 */
export async function saveServiceNowConfig(
  input: ServiceNowConfigInput,
): Promise<void> {
  const existing = await getServiceNowConfig();

  const next: ServiceNowConfig = {
    enabled: input.enabled,
    instanceUrl: input.instanceUrl.trim(),
    authType: input.authType,
    oauthClientId: input.oauthClientId?.trim() || undefined,
    oauthTokenUrl: input.oauthTokenUrl?.trim() || undefined,
    username: input.username?.trim() || undefined,
    oauthClientSecretEnc: existing.oauthClientSecretEnc,
    passwordEnc: existing.passwordEnc,
  };

  if (input.oauthClientSecret) {
    next.oauthClientSecretEnc = encryptSecret(input.oauthClientSecret);
  }
  if (input.password) {
    next.passwordEnc = encryptSecret(input.password);
  }

  await setSetting(SETTINGS_KEYS.serviceNow, next);
}

/** Decrypt a stored secret for use by the client (server-side only). */
export function decryptConfigSecret(enc: string | undefined): string | null {
  if (!enc) return null;
  try {
    return decryptSecret(enc);
  } catch {
    return null;
  }
}
