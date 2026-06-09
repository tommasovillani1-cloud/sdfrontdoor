# Element Six Service Desk Front Door

An AI-powered front door for the Element Six (De Beers Group) IT Service Desk.
A signed-in employee is recognised by name and chats with an assistant that
helps resolve common IT issues, grounds answers in a curated knowledge base,
and hands off to the Service Desk via a pre-filled email when it cannot resolve
the issue. Admins manage users, reporting, the knowledge base, the system
prompt, and the (disabled) ServiceNow integration.

## Stack

- **Next.js 14** (App Router, TypeScript, React Server Components, route handlers)
- **PostgreSQL** via **Prisma** (all operational data, including chat history)
- **Tailwind CSS** themed from the Element Six corporate palette (design tokens
  in `src/app/globals.css`, never hard-coded hex)
- **Provider-abstracted AI adapter** (`src/lib/ai/`) defaulting to a Databricks
  serving endpoint (OpenAI-compatible), model set via `AI_MODEL`
- **No app-level auth**: deployed as a Databricks App; the platform authenticates
  users and forwards identity headers, enriched via Microsoft Graph

## Getting started (local development)

1. **Install**

   ```bash
   npm install
   ```

2. **Configure environment**

   Copy `.env.example` to `.env` and fill in values. The only required value to
   boot is `DATABASE_URL` (a PostgreSQL / Databricks Lakebase connection string
   with `sslmode=require`). Everything else is optional: the app runs with an
   empty knowledge base, no AI key, and no Graph credentials, degrading cleanly.

3. **Set up the database**

   ```bash
   npx prisma db push      # sync schema to the database
   npm run db:seed         # seed categories, default admins, system prompt
   ```

   For environments that allow it, `npx prisma migrate deploy` applies the
   committed migration in `prisma/migrations/` instead of `db push`.

4. **Run**

   ```bash
   npm run dev
   ```

### Simulating the signed-in user locally

In production, Databricks forwards `X-Forwarded-Email` (and
`X-Forwarded-Preferred-Username`, `X-Forwarded-User`). Locally there is no proxy,
so set these in `.env` to simulate a user:

```
DEV_FORWARDED_EMAIL=tommaso.villani@e6.com
DEV_FORWARDED_NAME=Tommaso Villani
```

Real forwarded headers always take precedence over the dev override. To test as
another user, send the header explicitly, e.g.
`curl -H "X-Forwarded-Email: someone@e6.com" http://localhost:3000/`.

## Configuration notes

- **AI provider**: set `AI_BASE_URL` + `AI_API_KEY` to enable live replies.
  `AI_PROVIDER` selects `databricks` | `anthropic` | `openai-compatible` (all use
  the OpenAI-compatible client). Without these, chat returns a clear fallback and
  escalation still works.
- **Knowledge base**: leave `KB_*` blank to run with an empty KB. When the UC
  Volume, processing Job, and AI Search index are provisioned, uploads are
  stored (original filenames preserved), processed asynchronously, and synced on
  the admin-chosen cadence. Retrieval is hybrid (semantic + keyword) and a
  missing/empty index is a clean no-op.
- **Secrets**: `APP_ENCRYPTION_KEY` (32 bytes, base64 or hex) encrypts stored
  secrets such as ServiceNow credentials (AES-256-GCM). Generate with
  `openssl rand -base64 32`.

## Scheduled jobs (Databricks App deployment)

Two protected API routes are designed to be called on a schedule by a Databricks
Workflow, authenticated with the `CRON_SECRET` shared secret
(`Authorization: Bearer <secret>` or `?secret=<secret>`):

- **`POST /api/cron/retention`** — retention purge. Soft-deletes conversations
  whose `started_at` is older than `CONVERSATION_RETENTION_MONTHS` (default 6),
  then hard-deletes those soft-deleted beyond a 7-day grace period. *Chosen
  mechanism: protected API route called by a Databricks Workflow* (keeps all
  logic in the app, no DB extensions, portable, manually testable).
- **`POST /api/cron/kb-sync`** — cadence-driven KB index sync. Call it frequently
  (e.g. hourly); it compares the admin-configured cadence
  (hourly / every 6 hours / daily) against the last successful sync timestamp and
  triggers a sync only when due, so cadence is app-controlled without
  reprogramming Databricks schedules.

## Decisions worth noting

- **System prompt is versioned.** Each edit stores a history row
  (`system_prompt_versions`) with author and note, viewable and restorable from
  the admin System Prompt page, because the prompt changes assistant behaviour.
- **Resolution is structured, not guessed.** The model emits a
  `propose_resolution_check` tool call; the app renders an explicit Yes / No
  prompt rather than parsing free text.
- **Filenames are preserved verbatim.** Uploads keep their original names in both
  the registry and the Volume path. Only illegal path characters are sanitised;
  collisions get a ` (n)` version suffix. Generated IDs are never substituted for
  names.
- **GDPR**: 6-month retention plus an admin action to erase all conversations for
  a given user (right to erasure).

## Project layout

```
prisma/                 schema, migration, seed
src/app/(app)/          authenticated UI (chat + admin)
src/app/api/            route handlers (chat, conversations, admin, cron)
src/components/          UI components (chat/, admin/, shared)
src/lib/                 env, db, identity, graph, crypto, settings, audit
src/lib/ai/              provider-abstracted streaming adapter
src/lib/chat/            prompt assembly, tools, redaction, escalation, categorise
src/lib/kb/              retrieval, Databricks Volume/Jobs/sync, path handling
src/lib/servicenow/      disabled-by-default MCP-style integration (stubs)
```

## Validation

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # next lint
npm run build         # prisma generate && next build
```

Do not use em dashes in user-facing copy or generated content.
