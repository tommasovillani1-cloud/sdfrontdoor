/**
 * Centralised, typed access to environment variables.
 *
 * Most variables are optional by design: the brief requires the app to boot
 * with an empty/unprovisioned KB, no AI key, and no Graph credentials (local
 * dev). So we validate shape lazily and never throw at import time. Call sites
 * decide how to degrade (e.g. empty-KB no-op, escalation-only chat).
 */

function str(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function float(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name: string, fallback = false): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v.toLowerCase() === "true" || v === "1";
}

export const env = {
  databaseUrl: str("DATABASE_URL"),

  graph: {
    clientId: str("GRAPH_CLIENT_ID"),
    clientSecret: str("GRAPH_CLIENT_SECRET"),
    tenantId: str("GRAPH_TENANT_ID"),
    get configured() {
      return Boolean(this.clientId && this.clientSecret && this.tenantId);
    },
  },

  ai: {
    provider: str("AI_PROVIDER", "databricks") as
      | "databricks"
      | "anthropic"
      | "openai-compatible",
    baseUrl: str("AI_BASE_URL"),
    apiKey: str("AI_API_KEY"),
    model: str("AI_MODEL", "claude-sonnet-4-6"),
    maxTokens: int("AI_MAX_TOKENS", 2048),
    temperature: float("AI_TEMPERATURE", 0.2),
    get configured() {
      return Boolean(this.baseUrl && this.apiKey);
    },
  },

  serviceDeskEmail: str(
    "SERVICE_DESK_EMAIL",
    "European.Servicedesk@angloamerican.com",
  ),

  retentionMonths: int("CONVERSATION_RETENTION_MONTHS", 6),

  defaultAdmins: str("DEFAULT_ADMINS")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),

  appEncryptionKey: str("APP_ENCRYPTION_KEY"),

  databricks: {
    host: str("DATABRICKS_HOST"),
    token: str("DATABRICKS_TOKEN"),
  },

  kb: {
    volumePath: str("KB_VOLUME_PATH"),
    deltaTable: str("KB_DELTA_TABLE"),
    vectorEndpoint: str("KB_VECTOR_ENDPOINT"),
    vectorIndex: str("KB_VECTOR_INDEX"),
    processingJobId: str("KB_PROCESSING_JOB_ID"),
    defaultCadence: str("KB_SYNC_CADENCE", "daily"),
    /** The KB is "live" only when the index + endpoint are provisioned. */
    get provisioned() {
      return Boolean(
        env.databricks.host &&
          env.databricks.token &&
          this.vectorEndpoint &&
          this.vectorIndex,
      );
    },
  },

  serviceNowEnabledEnv: bool("SERVICENOW_ENABLED", false),

  dev: {
    forwardedEmail: str("DEV_FORWARDED_EMAIL"),
    forwardedName: str("DEV_FORWARDED_NAME"),
  },

  cronSecret: str("CRON_SECRET"),

  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
};

export type AppEnv = typeof env;
