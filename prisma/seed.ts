/**
 * Seed: ITIL categories, default admins (from DEFAULT_ADMINS), the initial
 * system prompt (stored in app_settings + a v1 version row), and the default
 * KB sync cadence. Idempotent: safe to run repeatedly.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SETTINGS_KEYS = {
  systemPrompt: "system_prompt",
  kbSyncCadence: "kb_sync_cadence",
} as const;

const DEFAULT_SYSTEM_PROMPT = `You are the Element Six IT Service Desk assistant. Element Six is part of the De Beers Group. You help employees resolve common IT issues quickly and clearly.

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

const SEED_CATEGORIES = [
  { name: "End User Compute", description: "Laptops, desktops, peripherals, OS issues", itilMapping: "Incident / Hardware" },
  { name: "Business Applications", description: "ERP/JDE, line-of-business apps", itilMapping: "Incident / Application" },
  { name: "Productivity and Collaboration", description: "M365, Teams, Outlook, SharePoint, OneDrive", itilMapping: "Incident / Application" },
  { name: "Network and Connectivity", description: "VPN, Wi-Fi, internet, remote access", itilMapping: "Incident / Network" },
  { name: "Identity and Access", description: "Passwords, MFA, account lockouts, permissions", itilMapping: "Service Request / Access" },
  { name: "Security", description: "Phishing, suspicious activity, malware", itilMapping: "Security Incident" },
  { name: "Telephony and Mobile", description: "Mobile devices, desk phones", itilMapping: "Incident / Telephony" },
  { name: "Printing", description: "Printers and print services", itilMapping: "Incident / Hardware" },
  { name: "Data and Reporting", description: "BI, Power BI, dashboards", itilMapping: "Service Request / Reporting" },
  { name: "Hardware and Procurement Requests", description: "New hardware and procurement", itilMapping: "Service Request / Procurement" },
  { name: "Other / Uncategorised", description: "Anything not covered above", itilMapping: "Incident / Other" },
];

async function main() {
  // Categories (idempotent upsert by unique name, preserving sort order).
  for (let i = 0; i < SEED_CATEGORIES.length; i++) {
    const c = SEED_CATEGORIES[i];
    await prisma.category.upsert({
      where: { name: c.name },
      create: { ...c, sortOrder: i, isActive: true },
      update: { description: c.description, itilMapping: c.itilMapping, sortOrder: i },
    });
  }
  console.log(`Seeded ${SEED_CATEGORIES.length} categories.`);

  // Default admins from env.
  const admins = (process.env.DEFAULT_ADMINS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  for (const email of admins) {
    await prisma.user.upsert({
      where: { email },
      create: { email, isAdmin: true, site: "Unknown" },
      update: { isAdmin: true },
    });
  }
  console.log(`Ensured ${admins.length} default admin(s): ${admins.join(", ") || "(none)"}`);

  // Initial system prompt + v1 version row (only if not already set).
  const existingPrompt = await prisma.appSetting.findUnique({
    where: { key: SETTINGS_KEYS.systemPrompt },
  });
  if (!existingPrompt) {
    await prisma.appSetting.create({
      data: { key: SETTINGS_KEYS.systemPrompt, value: DEFAULT_SYSTEM_PROMPT },
    });
    await prisma.systemPromptVersion.create({
      data: { content: DEFAULT_SYSTEM_PROMPT, editedBy: "system", note: "Initial default prompt" },
    });
    console.log("Seeded default system prompt (v1).");
  } else {
    console.log("System prompt already set; left unchanged.");
  }

  // Default KB sync cadence.
  const cadence = process.env.KB_SYNC_CADENCE || "daily";
  await prisma.appSetting.upsert({
    where: { key: SETTINGS_KEYS.kbSyncCadence },
    create: { key: SETTINGS_KEYS.kbSyncCadence, value: cadence },
    update: {},
  });
  console.log(`Default KB sync cadence: ${cadence}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
