# AGENTS.md — Doctor AI Agent Platform

## Stack
- **Framework:** Next.js 14+ (App Router) with Tailwind CSS + shadcn/ui components
- **Execution:** Trigger.dev v3 (serverless tasks) — approval uses polling, NOT `wait.createToken` (see rule 6)
- **Agent:** `ai` SDK v7 (`generateText` + `generateChatResponse()` in `packages/agent/src/agent.ts`) — dynamic agent sessions, no pre-scripted workflows. Model: `mimo-v2.5` via `https://opencode.ai/zen/go/v1`
- **Database:** Supabase (Postgres) with RLS on every `doctor_id`-scoped table
- **Auth:** Supabase Auth (Google OAuth for login — separate from Google API OAuth in Phase 5)
- **Google API tokens:** Stored encrypted in Supabase (app-level encryption via `GOOGLE_ENCRYPTION_KEY`). Single Trigger.dev project for all doctors — each task fetches its doctor's token at runtime.
- **Logger:** `packages/agent/src/logger.ts` — `log()`/`logWithClient()` write to Supabase `logs` table AND a local file `logs/local-dev.log` (JSON lines).

## Monorepo layout
```
doctor-ai-platform/
├── apps/web/          # Next.js dashboard (App Router)
├── apps/worker/       # Trigger.dev tasks (agent runs inside)
├── packages/db/       # Supabase client, types, Zod schemas
├── packages/agent/    # AI agent (ai SDK) + tool definitions
├── packages/shared/   # Types, constants (SessionType, ApprovalStatus, etc.)
└── supabase/          # Migrations
```

## Dev commands
```bash
pnpm dev          # turbo dev — runs all dev servers
pnpm build        # turbo build — production build
pnpm lint         # turbo lint
pnpm typecheck    # turbo typecheck — verify no typescript errors
pnpm db:push      # push Supabase migrations
pnpm db:types     # regenerate DB types from live Supabase into packages/db/src/types.ts
```

Run a single workspace: `pnpm --filter @apps/web dev` or `pnpm --filter @repo/db exec tsc --noEmit`

## Local development (NO push to GitHub needed)
- **Start the web app:** `npx next dev --port 3000` from `apps/web/`. The `trigger.dev` worker needs its CLI and is NOT required for web dev.
- **Env for local:** `apps/web/.env.local` (gitignored) overrides `.env` for local. It MUST contain `NEXT_PUBLIC_SITE_URL=http://localhost:3000`, `GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google-callback`, plus the Supabase/Google/AI keys (`.env.local` is the single source of truth for the local server — root `.env` is NOT read by `next dev`).
- **One-time external setup for local auth to work:**
  1. Supabase Dashboard → Authentication → URL Configuration → Redirect URLs: add `http://localhost:3000/api/auth/callback`
  2. Google Cloud Console → OAuth Client ID → Authorized redirect URIs: add `http://localhost:3000/api/auth/google-callback` (keep the Vercel one too)
- **Local log file:** every `log*()` call appends a JSON line to `logs/local-dev.log` (gitignored). Read it to debug without touching Supabase.
- Changes hot-reload on save. Deploy to production by pushing to GitHub (Vercel auto-deploys).

## Testing (test the feature through its API, not the browser)
Every UI button calls an API endpoint, so tests hit the real endpoints with an auth cookie — no browser needed. The auth cookie is built from a real Supabase password sign-in using the **test user**.

**Test user:** `test.doctor.local@example.com` / `TestDoctor123!` (Supabase auth user `3a8f5d9f-d667-4494-a044-11252eaff411`). Has a `doctors` row + an active `google_connections` row (same Google account as the real user). Created via `supabase.auth.admin.createUser` + service-key inserts. RLS works because `auth.uid()` matches the doctor id.

```bash
pnpm test:agent    # direct Google tool calls (gmail/calendar/drive/sheets) — bypasses HTTP
pnpm test:api      # endpoint checks: auth, settings/oauth URL, tasks/events CRUD, approvals, logs. NO chat.
pnpm test:chat     # INTERACTIVE conversation with the agent via POST /api/chat (multi-turn). 
                   #   pnpm test:chat              → default 3-turn scenario
                   #   pnpm test:chat "your msg"   → single custom message
                   #   pnpm test:chat -n 5 "msg"   → repeat 5 times
```

- To add a feature: build it, then extend the matching script and run it (feature is verified from the API output before pushing).
- `scripts/` run via `tsx` (root devDependency). `scripts/lib/config.ts` loads `apps/web/.env.local`. `scripts/lib/polyfill.ts` polyfills `globalThis.WebSocket` with `ws` (required because Node 20 has no native WebSocket and `@supabase/supabase-js` v2.112 needs it).
- `scripts/test-agent.ts` creates its Supabase client with a service-key header via `global.headers` so RLS is bypassed (it tests agent internals, not auth). `scripts/test-api.ts` + `scripts/test-chat.ts` sign in as the test user and use the real `sb-<project-ref>-auth-token` cookie.
- Chat route (`apps/web/src/app/api/chat/route.ts`) passes the authenticated Supabase client through `AgentContext.supabase` so `getGoogleAuth()` reads `google_connections` WITHOUT needing `SUPABASE_SERVICE_KEY`. Do not regress this — it is why tools work locally.

## Architecture rules (do NOT violate these)

### 1. No fixed workflows
Every session (chat/cron/event) spawns a **fresh dynamic AI agent session** via `generateChatResponse()`. The agent decides steps itself based on instructions + tools + context. Uses `ai` SDK v7 `generateText` with `stopWhen: isStepCount(10)`.

### 2. Approval gate = code-level, not LLM-level
Sensitive/non-sensitive classification is built into each tool's `execute()` function (factory functions in `packages/agent/src/tools/`). The LLM cannot bypass this. Sensitive tools check `ctx.sessionType`:
- `"chat"` → execute directly (doctor is present)
- `"cron"` / `"event"` → call `ctx.requestApproval()` which pauses via Trigger.dev `wait.for` polling (exponential backoff, 10s → 300s max). No native wait tokens in this SDK version — polling-based.

### 3. Context-driven tools (factory pattern)
All tools are factory functions (`createSendEmailTool(ctx)`, etc.) that accept `AgentContext`. Agent context carries `doctorId`, `sessionType`, and optional `requestApproval` handler (injected by Trigger.dev task for automated sessions, left undefined for chat).

### 4. RLS on ALL tables
Every table has `doctor_id` and RLS policy `auth.uid() = doctor_id`. Never query without the auth context — data isolation is DB-level, not app-level.

### 5. Two separate Google OAuth flows
- **Login auth:** `signInWithOAuth` in `app/(auth)/login/page.tsx` — identity only
- **API auth:** Google consent screen with Gmail/Calendar/Drive scopes — stored as encrypted refresh token in Supabase. Separate OAuth grant, configured in `app/(dashboard)/settings/page.tsx`

### 6. Approval uses polling, not wait tokens
Trigger.dev SDK v3.3.0 does not have `wait.createToken`/`forToken`/`completeToken`. Approval is implemented with `wait.for({ seconds: N })` + Supabase polling. The Next.js API route updates approval status in DB, the polling loop detects it. Exponential backoff: 10s → 300s. No timeout — polls indefinitely until approved/rejected.

## File signposts
| Concern | Path |
|---|---|
| Auth middleware | `apps/web/src/middleware.ts` |
| Server Supabase client | `apps/web/src/lib/supabase-server.ts` |
| Browser Supabase client | `apps/web/src/lib/supabase-browser.ts` |
| DB migration (schema source of truth) | `supabase/migrations/00001_initial_schema.sql` |
| Types + constants | `packages/shared/src/` |
| DB types (hand-written) | `packages/db/src/types.ts` |
| Agent + context definition | `packages/agent/src/agent.ts` |
| Agent context interface | `packages/agent/src/context.ts` |
| Tool factories (context-driven) | `packages/agent/src/tools/` (gmail.ts, calendar.ts, drive.ts, sheets.ts) |
| Approval gate helper | `packages/agent/src/approvals.ts` |
| Chat API route | `apps/web/src/app/api/chat/route.ts` |
| Approval resolve API (PATCH) | `apps/web/src/app/api/approval/[id]/route.ts` |
| Approval list API (GET) | `apps/web/src/app/api/approvals/route.ts` |
| Review dashboard | `apps/web/src/app/(dashboard)/review/page.tsx` |
| Tasks dashboard | `apps/web/src/app/(dashboard)/tasks/page.tsx` |
| Tasks list API (GET/POST) | `apps/web/src/app/api/tasks/route.ts` |
| Task update API (PATCH/DELETE) | `apps/web/src/app/api/tasks/[id]/route.ts` |
| Events list API (GET/POST) | `apps/web/src/app/api/events/route.ts` |
| Event update API (PATCH/DELETE) | `apps/web/src/app/api/events/[id]/route.ts` |
| Google OAuth + token mgmt | `packages/agent/src/google/auth.ts` (`getGoogleAuth(doctorId, supabaseClient?)` — accepts optional client, falls back to service key) |
| Token encryption | `packages/agent/src/google/encryption.ts` |
| Real Gmail API calls | `packages/agent/src/google/gmail.ts` |
| Real Calendar API calls | `packages/agent/src/google/calendar.ts` |
| Real Drive API calls | `packages/agent/src/google/drive.ts` |
| Real Sheets API calls | `packages/agent/src/google/sheets.ts` |
| Logger (DB + local file) | `packages/agent/src/logger.ts` |
| Local log output | `logs/local-dev.log` (gitignored) |
| Test config / env loader | `scripts/lib/config.ts` |
| Node 20 WebSocket polyfill | `scripts/lib/polyfill.ts` |
| Agent tool tests | `scripts/test-agent.ts` (`pnpm test:agent`) |
| API endpoint tests | `scripts/test-api.ts` (`pnpm test:api`) |
| Agent conversation test | `scripts/test-chat.ts` (`pnpm test:chat`) |
| Google connect URL API | `apps/web/src/app/api/settings/google-connect/route.ts` |
| Google OAuth callback | `apps/web/src/app/api/auth/google-callback/route.ts` |
| Google connection API | `apps/web/src/app/api/settings/google-connection/route.ts` |
| Trigger.dev config | `apps/worker/trigger.config.ts` |
| Trigger.dev approval handler | `apps/worker/src/approval-handler.ts` |
| Chat task | `apps/worker/src/trigger/chat.ts` |
| Cron task | `apps/worker/src/trigger/cron.ts` |
| Event task | `apps/worker/src/trigger/events.ts` |

## Phase conventions
- **Phase 5:** All tools call real Google APIs via `googleapis` (Gmail, Calendar, Drive, Sheets). Use `getGoogleAuth(doctorId, supabaseClient?)` → fetches encrypted refresh token from `google_connections`, creates OAuth2 client, auto-refreshes tokens. Pass the caller's Supabase client when available so it works without `SUPABASE_SERVICE_KEY`.
- **Phase 5 env vars:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_ENCRYPTION_KEY` (must be exactly 32 chars).
- **AI model:** `mimo-v2.5` via `createOpenAICompatible({ baseURL: "https://opencode.ai/zen/go/v1" })`, using `OPENAI_API_KEY`. The `getModel()` function in `packages/agent/src/agent.ts` is the single point to swap providers/models.
- **Supabase clients:** `packages/db/src/server.ts` uses `SUPABASE_SERVICE_ROLE_KEY`; `packages/agent/src/google/auth.ts` and the logger use `SUPABASE_SERVICE_KEY`. `.env.local` sets both via `SUPABASE_SERVICE_KEY` (the env used by the running server).
