# Element Six Service Desk Front Door — Build Brief for Claude Code

You are building a production web application for Element Six (De Beers Group). Read this entire brief, propose a short plan, then build it in the phases described. Ask me before introducing any dependency or service not listed here. Do not use em dashes in any user-facing copy or generated content.

---

## 0. How to work

- Propose a short plan first, then build phase by phase.
- **Self-validation loop**: after building, validate and self-fix before presenting to me. Run up to 5 iterations of: type-check, lint, build, start the app, and exercise the core flows (sign-in identity, chat, scope guard, resolution check, escalation mailto, admin pages render, reporting filters return data). Fix every issue you find, then re-run. Stop early once a clean pass with no errors is achieved, or after 5 loops. When you present, give me a short report of what you validated, what you fixed, and anything still open.
- **Branding**: I will attach the Element Six logo and corporate colour palette. Use them. Put the logo in the header/sidebar, drive the Tailwind theme from the corporate colours (define them as design tokens / CSS variables, do not hard-code hex values throughout), and keep the look clean and on-brand. If the attachment is missing when you start, ask me for it rather than inventing a palette.

---

## 1. What we are building

An AI-powered "front door" for the IT Service Desk. A signed-in employee opens the app, is recognised by name, and chats with an AI assistant (Claude-style interface) that helps resolve simple IT issues. If the assistant cannot resolve the issue, it hands the user off to the Service Desk via a pre-filled email. The assistant only answers IT questions and politely declines anything else.

Two audiences:
- **End users**: chat, history sidebar, resolution flow, escalation handoff.
- **Admins**: user management, reporting, ServiceNow connection settings.

Design principle: nice and simple. Clean, fast, responsive, no clutter. Favour a small surface area over feature sprawl.

---

## 2. Technology stack (fixed)

- **Frontend + backend**: Next.js 14+ (App Router, TypeScript, React Server Components where sensible).
- **Database**: PostgreSQL only. All data, including chat history, lives in Postgres. Do not add MongoDB / Cosmos DB. A normalised `messages` table at service-desk volume is simpler to secure, back up, and report on than a second document store, and JSONB covers any semi-structured needs.
- **ORM**: Prisma (or Drizzle if you prefer; pick one and justify briefly).
- **Auth**: none in the app. This is published as a **Databricks App**, so Databricks authenticates users at the platform level. The app trusts the user identity Databricks forwards in request headers and enriches it via Microsoft Graph (see section 5). No login screen, no Auth.js.
- **AI access**: provider-abstracted adapter (see section 6). Default target is Claude Sonnet 4.6 served through a Databricks serving endpoint (OpenAI-compatible Chat Completions API).
- **Styling**: Tailwind CSS. Keep components self-contained and accessible.
- **Streaming**: stream assistant responses token by token.

---

## 3. Environment variables

All tunables live in `.env`. Provide a committed `.env.example` with comments. At minimum:

```
# Database
DATABASE_URL=

# Microsoft Graph (one service principal; reads display name + country/site).
# This is the same app registration that would otherwise have been used for sign-in,
# so there is a single client ID, not two.
GRAPH_CLIENT_ID=
GRAPH_CLIENT_SECRET=
GRAPH_TENANT_ID=

# AI provider (provider-abstracted so the model can be swapped)
AI_PROVIDER=databricks            # databricks | anthropic | openai-compatible
AI_BASE_URL=                      # e.g. Databricks serving endpoint base URL
AI_API_KEY=                       # Databricks PAT or provider key
AI_MODEL=claude-sonnet-4-6        # the model to use, settable here
AI_MAX_TOKENS=2048
AI_TEMPERATURE=0.2

# Service Desk escalation
SERVICE_DESK_EMAIL=European.Servicedesk@angloamerican.com

# Retention
CONVERSATION_RETENTION_MONTHS=6

# Bootstrap admins (comma separated)
DEFAULT_ADMINS=tommaso.villani@e6.com,sian.romani@e6.com

# Encryption at rest for stored secrets (e.g. ServiceNow creds)
APP_ENCRYPTION_KEY=

# Knowledge base (Databricks AI Search). Leave the KB_* values blank to run with an empty KB.
DATABRICKS_HOST=
DATABRICKS_TOKEN=                    # workspace token / app service principal for Volume, Jobs, AI Search
KB_VOLUME_PATH=                      # UC Volume, e.g. /Volumes/<catalog>/<schema>/<volume>
KB_DELTA_TABLE=                      # e.g. <catalog>.<schema>.kb_chunks
KB_VECTOR_ENDPOINT=                  # AI Search endpoint name
KB_VECTOR_INDEX=                     # <catalog>.<schema>.<index>
KB_PROCESSING_JOB_ID=                # Databricks Job that parses/chunks uploads
KB_SYNC_CADENCE=daily                # hourly | every_6_hours | daily (default; admin-editable in the UI)

# ServiceNow (disabled at launch; live values are managed in the admin UI, not here)
SERVICENOW_ENABLED=false
```

Note: I had a typo in my original request (`tommaso..villani`). The correct address is `tommaso.villani@e6.com`, reflected above.

---

## 4. Data model (Postgres)

Design migrations and seed data for:

- **users**: `id`, `email` (unique, the forwarded identity), `display_name`, `site` (from Graph country, nullable), `is_admin` (bool), `created_at`, `last_seen_at`. (`entra_oid` is optional; identity arrives via the forwarded email, not a token claim.)
- **conversations**: `id`, `user_id`, `title`, `status` enum (`active` | `resolved` | `escalated`), `category_id` (nullable, FK), `started_at`, `resolved_at` (nullable), `escalated_at` (nullable), `deleted_at` (nullable, for soft delete before purge).
- **messages**: `id`, `conversation_id`, `role` enum (`user` | `assistant` | `system`), `content` (text), `model` (nullable), `tokens_in` (int, nullable), `tokens_out` (int, nullable), `created_at`.
- **categories**: `id`, `name`, `description`, `itil_mapping`, `is_active` (bool), `sort_order`. Editable by admins. Seed with the list in section 7.
- **escalations**: `id`, `conversation_id`, `to_email`, `subject`, `body`, `created_at`. One row per time the user is handed off, so deflection can be measured.
- **feedback**: `id`, `message_id`, `user_id`, `rating` enum (`up` | `down`), `created_at`.
- **app_settings**: `key`, `value` (JSONB). Stores the editable system prompt, retention override, and ServiceNow config (secrets encrypted with `APP_ENCRYPTION_KEY`).
- **audit_log**: `id`, `actor_user_id`, `action`, `target`, `metadata` (JSONB), `created_at`. Record admin actions (promoting/demoting admins, editing categories, changing ServiceNow settings).
- **kb_folders**: `id`, `parent_id` (nullable, self-referencing for subfolders), `name`, `path` (mirrors the Volume layout), `created_at`. Drives the folder tree and the Volume structure.
- **kb_documents**: `id`, `folder_id` (FK), `original_filename` (stored verbatim), `volume_path`, `content_type`, `version`, `is_active` (bool), `status` enum (`pending` | `processed` | `error`), `uploaded_by`, `uploaded_at`, `last_reviewed` (nullable), `owner` (nullable). Registry that drives the KB admin UI and tracks processing.

Note on KB data location: the folder tree and document registry above live in Postgres, but the chunked KB text and embeddings live in a Databricks **`kb_chunks` Delta table** under Unity Catalog (the source for the AI Search index), not in Postgres. Postgres holds operational data and the registry; Databricks holds the searchable content.

Seed default admins from `DEFAULT_ADMINS` on first run.

Use `started_at` as the reporting date for a conversation throughout.

---

## 5. User recognition (no app-level login)

The app runs as a Databricks App, so Databricks authenticates the user before any request reaches us. The app reads the forwarded identity headers and recognises the user from them. There is no login screen and no anonymous access (Databricks already guarantees a signed-in user).

- On each request, read the Databricks-forwarded headers. Primary identity is `X-Forwarded-Email`; also available are `X-Forwarded-Preferred-Username` and `X-Forwarded-User`. These are only present inside Databricks Apps, so for local development simulate them (e.g. via a dev-only env override) and document how.
- On first sighting of an email, create the `users` row; on every request update `last_seen_at`. This is the "auto-authentication" step: trust the forwarded identity, resolve or create the local user, no extra prompt.
- Enrich the user from Microsoft Graph using the service principal (app-only token via `GRAPH_*`): fetch `displayName` and `country`. Look up by the forwarded email. Store `country` as `site` (the site is inferred from the country). If `country` is empty, set `site = Unknown`.
- Admin status is determined by `is_admin` on the resolved user, seeded from `DEFAULT_ADMINS`.
- Greet by local time of day using the user's first name: `Good morning`, `Good afternoon`, `Good evening`, and for the small-hours window use `Good evening` or a friendly `Working late?` (in British English "Good night" reads as a farewell, so do not use it as a greeting).

---

## 6. AI integration

Build a thin provider adapter (`lib/ai/`) exposing `streamChat({ messages, model, tools })`. Implement the Databricks path first (OpenAI-compatible client pointed at `AI_BASE_URL` with `AI_MODEL`), but keep the interface generic so Anthropic-direct or any OpenAI-compatible endpoint can be slotted in by changing `.env`. Stream responses.

Log `tokens_in` / `tokens_out` / `model` per assistant message so usage and cost can be tracked (this should feed our existing Databricks AI Gateway governance).

### System prompt
Store the system prompt in `app_settings` so admins can tune scope and tone without a redeploy. Default content should:
- Establish the assistant as the Element Six IT Service Desk assistant.
- Restrict scope to IT issues only. For off-topic requests, respond warmly and briefly that it is a Service Desk assistant and cannot help with that, then offer to help with an IT issue. Do not answer the off-topic question.
- Keep answers concise and actionable, ask one clarifying question at a time, and never request passwords, MFA codes, or other secrets.
- Avoid em dashes.

### Knowledge base (Databricks AI Search, in MVP scope, must tolerate an empty KB)
The KB grounds the assistant in Element Six specific content and is the main driver of resolution quality. It is in scope for the MVP. Critically, **the app must boot and run with a completely empty KB**: if no documents exist yet, or the AI Search index/endpoint is not provisioned, retrieval returns nothing, the assistant falls back to general IT guidance and escalation, and nothing errors or blocks. Keep all retrieval behind an interface so an empty or un-provisioned KB is a clean no-op.

Storage and organisation:
- Files live in a Unity Catalog Volume, organised in a **folder/subfolder tree** so the KB is curated, not a dumping ground. The folder hierarchy the admin builds in the UI is mirrored as the path structure in the Volume.
- **Preserve original filenames.** Store and display each document's original filename exactly as uploaded, and use that name (not an opaque generated ID, hash, or random string) in the Volume path. Claude Code tends to rename uploads to generated IDs: do not do that here. Sanitise only characters that are illegal in a path, keep the human-readable name, and on a name collision within the same folder append a version suffix rather than overwriting or substituting an ID.

Processing and indexing:
- A processing step extracts text, chunks it, and writes rows to a `kb_chunks` Delta table under Unity Catalog with metadata (original filename, folder path, category, version, active flag, uploaded_by, uploaded_at). Reuse the existing Claude OCR path for scanned PDFs. Run processing **asynchronously** (drop the file in the Volume, then trigger a Databricks Job) so large files do not block a web request.
- A Databricks AI Search Delta Sync Index with managed embeddings sits on `kb_chunks`. Use **Triggered** sync, not Continuous, to control cost.
- **Admin-configurable sync cadence**: the admin chooses how often the triggered sync runs (hourly, every 6 hours, or daily) from the KB admin page, plus a manual "Sync now" button. Store the cadence in `app_settings`. Implement it as a single frequently-running trigger that compares the configured interval against the last successful sync timestamp and runs a sync only when due, so cadence is fully app-controlled without reprogramming Databricks schedules.

Retrieval at chat time:
- Run hybrid (semantic + keyword) retrieval against the index, filtered to active documents (and optionally category/site), and inject the top results as grounding with source attribution (show the original filename). Instruct the assistant to prefer KB content and to escalate when the KB does not cover the issue.

### Resolution detection (structured, not guessed)
Do not parse free text to decide the issue is resolved. Give the model a tool / structured-output signal it emits when it judges the issue likely resolved, e.g. `propose_resolution_check`. When the app receives that signal, render a clear prompt in the chat: "Did this resolve your issue?" with **Yes** and **No** buttons.
- **Yes** → set conversation `status = resolved`, set `resolved_at`, show a short thank-you.
- **No** → trigger the escalation flow (section 8).

### Categorisation
When a conversation reaches `resolved` or `escalated`, make a separate server-side model call that returns one category from the active list as JSON. Store `category_id`. Admins can recategorise from the reporting page.

---

## 7. ITIL-aligned categories (seed, editable in DB)

Seed these and let admins edit/add/deactivate:

1. **End User Compute** (laptops, desktops, peripherals, OS issues)
2. **Business Applications** (ERP/JDE, line-of-business apps)
3. **Productivity and Collaboration** (M365, Teams, Outlook, SharePoint, OneDrive)
4. **Network and Connectivity** (VPN, Wi-Fi, internet, remote access)
5. **Identity and Access** (passwords, MFA, account lockouts, permissions)
6. **Security** (phishing, suspicious activity, malware)
7. **Telephony and Mobile** (mobile devices, desk phones)
8. **Printing**
9. **Data and Reporting** (BI, Power BI, dashboards)
10. **Hardware and Procurement Requests**
11. **Other / Uncategorised**

---

## 8. Escalation handoff (mailto)

When a user is not resolved:
- The assistant generates a concise email **summary**, not a transcript. Important: `mailto:` URLs have a practical length ceiling (around 1800 to 2000 characters total in many clients) and are plain text only, so do not dump the full conversation. Summarise: the issue, what was already tried in chat, and what is outstanding.
- Build a `mailto:` link:
  - `to` = `SERVICE_DESK_EMAIL` (configurable).
  - `subject` = an AI-generated subject related to the chat.
  - `body` = AI-generated summary, ending with a polite request to open a ticket for the user's issue. Include the user's name. URL-encode the subject and body (encode newlines as `%0D%0A`).
- Render this as a button/link that opens the user's mail client.
- Write an `escalations` row at the same time and set conversation `status = escalated`, `escalated_at`. This is what we measure deflection against.

---

## 9. Chat history sidebar

- Left sidebar lists the user's own conversations, newest first, with auto-generated titles (derive from the first user message or a short AI summary), like Claude or ChatGPT.
- Clicking a conversation reopens it. The user can continue an `active` conversation. Reopening a `resolved` conversation and sending a new message moves it back to `active`.
- Add a search box to filter the user's history by title/content.
- **Retention**: a scheduled job purges conversations whose `started_at` is older than `CONVERSATION_RETENTION_MONTHS` (default 6). Soft delete first (`deleted_at`), then hard delete on a later pass. Implement the schedule in a way that suits a Databricks App deployment (a protected API route triggered by a scheduler or Databricks Workflow, or `pg_cron`); document the choice.

---

## 10. Admin features

Gate all admin routes by `is_admin`. Show admin nav only to admins.

### User management page
- List users (email, name, site, admin status, last seen).
- Toggle `is_admin`. Prevent removing the last remaining admin. Write every change to `audit_log`.

### Reporting page
Headline metrics and an analysis by category.
- **Metrics**: total interactions (conversations), resolutions (`status = resolved`), escalations, and **deflection rate** (resolved / total) as the headline number. Add average turns to resolution and a simple trend line over the selected period.
- **By category**: counts and resolution rate per category.
- **Filters**: year, month, explicit date range, category, and Site. All date filtering is on `started_at`. Filters compose.
- Allow admins to recategorise a conversation here.

### Knowledge base page
- A folder/subfolder tree the admin can create, rename, and reorganise; the structure is mirrored in the Unity Catalog Volume.
- Upload documents into a folder (or write an article inline). Original filenames are preserved verbatim and shown in the list; never display or store generated IDs as the name.
- Per document: activate/deactivate, set category, see processing status (pending/processed/error), reprocess, and view last-reviewed and owner.
- Sync controls: choose the triggered-sync cadence (hourly / every 6 hours / daily), a manual "Sync now" button, and a display of the last successful sync time.
- All changes recorded in `audit_log`.

### ServiceNow connection page
- Form to configure the ServiceNow integration: instance URL, auth type, credentials, enabled toggle (default off). Store in `app_settings` with secrets encrypted via `APP_ENCRYPTION_KEY`. Never log secrets. Record changes in `audit_log`.

---

## 11. ServiceNow MCP (built but disabled at launch)

Scaffold an MCP server/integration for ServiceNow, wired so it is **disabled by default** and only activates when enabled in the admin page with valid credentials. Define (stub now, implement later) these capabilities:
- Log an incident ticket.
- Log a change request.
- Get status of a ticket or change request.
- Resolve a ticket or change request.
- Read the content of an existing ticket the user previously logged.

Auth design note: a static API key is not the only option, and the team owns that decision. ServiceNow supports OAuth 2.0 and scoped integration users, which is usually an easier internal approval than a long-lived API key. Build the auth layer so it can use OAuth 2.0 (client credentials) or basic/integration-user creds, selectable in the admin page. Because the integration is disabled at launch and the email handoff covers escalation, the missing API key does not block v1.

---

## 12. Cross-cutting requirements

- **Secrets/PII hygiene**: users will sometimes paste passwords or codes. The system prompt must instruct the assistant never to ask for them, and the app should surface a quiet notice that users should not share passwords. Consider light client-side redaction of obvious secret patterns before storage.
- **GDPR**: 6-month retention satisfies minimisation; also provide an admin action to delete all conversations for a given user (right to erasure). Conversations may contain personal data, so treat the DB accordingly.
- **Feedback**: thumbs up/down on assistant messages, stored in `feedback`, surfaced as a quality signal in reporting.
- **Responsive and accessible**: works on mobile, keyboard navigable, sensible empty and error states.
- **Audit**: log all admin actions.

---

## 13. Build phases (with acceptance criteria)

Build incrementally; each phase should run and be demoable.

1. **Foundation**: Next.js + Tailwind + Postgres + Prisma. Read Databricks-forwarded identity headers, resolve/create the user, enrich via Graph. Users table seeded; default admins promoted. Apply branding (logo + corporate colours as theme tokens). Time-of-day greeting by first name. *Accept: opening the app inside Databricks recognises me by name with the correct branding; locally I can simulate the identity headers.*
2. **Chat core**: streaming chat against the AI adapter (Databricks/Claude Sonnet 4.6), IT-only scope guard, messages persisted, history sidebar with auto titles, search, continue/reopen. Retrieval is wired behind an interface but the KB may be empty: the app must run end to end with zero KB content. *Accept: I can hold an IT conversation with an empty KB, it is saved, off-topic is declined, and nothing breaks when no documents exist.*
3. **Knowledge base**: Unity Catalog Volume with a folder/subfolder tree, document upload that preserves original filenames, async parse/chunk into the `kb_chunks` Delta table, an AI Search Delta Sync Index with managed embeddings, triggered sync with admin-configurable cadence plus a Sync now button, and hybrid retrieval grounding with source attribution. *Accept: I can create folders, upload a document keeping its real name, watch it process and sync, and see the assistant ground answers in it; emptying the KB leaves the app fully working.*
4. **Resolution and escalation**: structured resolution check with Yes/No, resolved tracking, mailto escalation with AI subject/body summary, escalation rows. *Accept: a resolved chat is marked resolved; an unresolved one opens a pre-filled email to the Service Desk and is marked escalated.*
5. **Categorisation and retention**: auto-categorisation on close, editable categories, scheduled retention purge at 6 months. *Accept: closed chats get categorised; old chats are purged on schedule.*
6. **Admin**: user management with audit log, reporting page with all filters and deflection rate, recategorisation. *Accept: I can manage admins and read the reporting page with year/month/range/category/site filters.*
7. **ServiceNow scaffold**: disabled MCP integration, admin connection page with encrypted creds and OAuth-capable auth layer, capability stubs. *Accept: the integration exists, stays off until enabled, and stores creds securely.*
8. **Polish**: feedback thumbs, PII notice, responsive pass, empty/error states, token/cost logging surfaced.

---

## 14. Open items I want you to flag, not assume

- Whether the editable system prompt should be versioned (history of changes), given it changes assistant behaviour.
- The retention purge runs as a scheduled job. Confirm the trigger mechanism that fits a Databricks App deployment (a protected API route called by a scheduler, a Databricks Workflow/job hitting the endpoint, or `pg_cron`) and propose the simplest one.

Decided already (do not re-ask): Site is derived from the Graph `country` attribute; hosting is a Databricks App with platform-level authentication.

Deliver a short plan first, confirm the open items where cheap, then build phase by phase with the self-validation loop described in section 0.
