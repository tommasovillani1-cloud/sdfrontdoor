/** Stable keys for the app_settings table. */
export const SETTINGS_KEYS = {
  systemPrompt: "system_prompt",
  retentionMonths: "retention_months",
  serviceNow: "servicenow_config",
  kbSyncCadence: "kb_sync_cadence",
  kbLastSyncAt: "kb_last_sync_at",
} as const;

/** Sync cadence options for the KB triggered sync. */
export const SYNC_CADENCES = ["hourly", "every_6_hours", "daily"] as const;
export type SyncCadence = (typeof SYNC_CADENCES)[number];

export const SYNC_CADENCE_LABELS: Record<SyncCadence, string> = {
  hourly: "Hourly",
  every_6_hours: "Every 6 hours",
  daily: "Daily",
};

export const SYNC_CADENCE_MS: Record<SyncCadence, number> = {
  hourly: 60 * 60 * 1000,
  every_6_hours: 6 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
};

/**
 * Default system prompt. Stored in app_settings on first run so admins can tune
 * scope and tone without a redeploy (and changes are versioned). No em dashes.
 */
export const DEFAULT_SYSTEM_PROMPT = `You are the Element Six IT Service Desk assistant. Element Six is part of the De Beers Group. You help employees resolve common IT issues quickly and clearly.

Scope:
- Only help with IT issues: laptops and desktops, business applications, Microsoft 365 and collaboration tools, network and connectivity, identity and access, security, telephony and mobile, printing, data and reporting, and hardware or procurement requests.
- If someone asks about anything that is not an IT issue, respond warmly and briefly that you are the IT Service Desk assistant and cannot help with that, then offer to help with an IT issue instead. Do not answer the off-topic question.

How to help:
- Keep answers concise and actionable. Give clear steps the person can follow.
- Ask only one clarifying question at a time.
- Never ask for passwords, MFA codes, PINs, or any other secrets. If a user offers one, tell them not to share it and continue without it.
- Prefer information from the provided knowledge base context when it is present, and cite the source document by its filename. If the knowledge base does not cover the issue, use general best-practice IT guidance.
- When you believe the issue is likely resolved, call the propose_resolution_check tool so the user can confirm. Do not assume resolution silently.
- If you cannot resolve the issue, or the user needs hands-on help, access changes, or hardware, explain that you will hand off to the Service Desk so they can raise a ticket.

Tone:
- Professional, friendly, and calm. Use British English. Do not use em dashes.`;

/** ITIL-aligned seed categories (section 7). Editable by admins. */
export const SEED_CATEGORIES = [
  {
    name: "End User Compute",
    description: "Laptops, desktops, peripherals, OS issues",
    itilMapping: "Incident / Hardware",
  },
  {
    name: "Business Applications",
    description: "ERP/JDE, line-of-business apps",
    itilMapping: "Incident / Application",
  },
  {
    name: "Productivity and Collaboration",
    description: "M365, Teams, Outlook, SharePoint, OneDrive",
    itilMapping: "Incident / Application",
  },
  {
    name: "Network and Connectivity",
    description: "VPN, Wi-Fi, internet, remote access",
    itilMapping: "Incident / Network",
  },
  {
    name: "Identity and Access",
    description: "Passwords, MFA, account lockouts, permissions",
    itilMapping: "Service Request / Access",
  },
  {
    name: "Security",
    description: "Phishing, suspicious activity, malware",
    itilMapping: "Security Incident",
  },
  {
    name: "Telephony and Mobile",
    description: "Mobile devices, desk phones",
    itilMapping: "Incident / Telephony",
  },
  {
    name: "Printing",
    description: "Printers and print services",
    itilMapping: "Incident / Hardware",
  },
  {
    name: "Data and Reporting",
    description: "BI, Power BI, dashboards",
    itilMapping: "Service Request / Reporting",
  },
  {
    name: "Hardware and Procurement Requests",
    description: "New hardware and procurement",
    itilMapping: "Service Request / Procurement",
  },
  {
    name: "Other / Uncategorised",
    description: "Anything not covered above",
    itilMapping: "Incident / Other",
  },
] as const;
