# AGENTS.md — Doctor AI Agent Platform

## Stack
- **Framework:** Next.js 14+ (App Router) with Tailwind CSS + shadcn/ui components
- **Execution (split):** ALL agent execution runs on Vercel (Next.js API routes). **chat** = `/api/chat` manual stateless loop (no Trigger.dev). **cron** / **event** = Trigger.dev v3 is a THIN SCHEDULER ONLY: the 15-min `doctor-scheduled-session` cron checks the DB for due scheduled tasks and forwards each to Vercel `/api/automation/run`; the 5-min `check-event-triggers` pings Vercel `/api/automation/poll`, which polls all users' Gmail/Outlook/Calendar/Drive/OneDrive in parallel, applies the deterministic filter, and forwards matches to `/api/automation/run`. The LLM never runs on Trigger.dev. Approval is a Vercel-side pause/resume (`chat_state` + `approval_requests`), NOT `wait.createToken` (see rule 2).
- **Agent:** `ai` SDK v7 (`streamText` + `streamChatResponse()` in `packages/agent/src/agent.ts`) — dynamic agent sessions, no pre-scripted workflows. Chat streams over SSE from the Next.js route. Model: `deepseek-v4-flash` via `https://opencode.ai/zen/go/v1`
- **Database:** Supabase (Postgres) with RLS on every `doctor_id`-scoped table
- **Auth:** Supabase Auth (Google OAuth for login — separate from Google API OAuth in Phase 5)
- **Google API tokens:** Stored encrypted in Supabase (app-level encryption via `GOOGLE_ENCRYPTION_KEY`). Single Trigger.dev project for all doctors — each task fetches its doctor's token at runtime.
- **Logger:** `packages/agent/src/logger.ts` — `log()`/`logWithClient()` write to Supabase `logs` table AND a local file `logs/local-dev.log` (JSON lines).
- **Request trace logger:** `apps/web/src/lib/request-trace.ts` — `createTrace()` per API request. Dev-only. Writes to `apps/web/logs/traces/<requestId>.log` (per-request phase/timing/error trace), `errors.log` (every error), `index.log` (1 line per request). Instrumented in `POST /api/chat` and all session routes — add phases to new routes with `trace.phase()`, `trace.info()`, `trace.data()`, `trace.error()`, `trace.end()`. See "Request trace logger" section below.

## Monorepo layout
```
doctor-ai-platform/
├── apps/web/          # Next.js dashboard (App Router)
├── apps/worker/       # Trigger.dev scheduler only (cron/ping → Vercel; no agent)
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

## Request trace logger (dev-only detailed logging)
- **Purpose:** capture a full, per-request trace on localhost so errors/timing are easy to debug. Every phase of `POST /api/chat` is recorded with relative timings, request body, DB results, stream stats (chunk count, TTFB, stream duration), and full error stacks.
- **Files (in `apps/web/logs/traces/`, all gitignored):**
  - `<requestId>.log` — one pretty-printed trace per request (the main file to read).
  - `errors.log` — every error entry appended across all requests, with full stack + request id.
  - `index.log` — one summary line per request (`time duration requestId phase`).
- **Usage:** `const trace = createTrace()` at the top of a route; call `trace.phase("name", data)`, `trace.info(...)`, `trace.data(label, value)`, `trace.warn(...)`, `trace.error(message, error, data)`, and `trace.end(summary)` before returning. Errors are auto-appended to `errors.log`.
- **Disabled in production** (only runs when `NODE_ENV !== "production"`), so it's safe to leave in the code.
- Changes hot-reload on save. Deploy to production by pushing to GitHub (Vercel auto-deploys).

## Total logging (capture EVERYTHING — for "something broke and I don't know why")
Everything funnels into the same Supabase `logs` table (and `logs/local-dev.log`), then shows live on `/logs`. The point: when the site misbehaves, open `/logs`, hit **Copy all**, and paste it to the AI.

Layers:
- **Every HTTP request** → `apps/web/src/middleware.ts` calls `logEdgeRequest()` (source `request`): method + path + query, userId, auth, UA, IP, referer. Fire-and-forget raw POST to Supabase REST via anon key (`doctor_id = NULL`, allowed by RLS; userId rides in `details`). Skips `/api/logs` so the page's own polling isn't logged.
- **Server errors/warnings** → `apps/web/src/instrumentation.ts` (needs `experimental.instrumentationHook` in `next.config.js`) → `apps/web/src/lib/server-logging.ts` (`initServerLogging`, Node runtime only):
  - `process.on('uncaughtException')` (source `uncaughtException`) and `unhandledRejection` (source `unhandledRejection`).
  - `console.error` is patched (source `console`) so any library error (AI SDK, Supabase, Next) is captured. `console.warn` is NOT patched (avoids recursion with the logger's own warn-on-insert-failure).
  - `globalThis.fetch` is patched (source `fetch`) to log every outbound call (Supabase, model, Google/Microsoft) as `METHOD host/path -> status (ms)`, warn on 4xx, error on 5xx/network. Skips `/rest/v1/logs`, `/rest/v1/tool_execution_log`, `/auth/v1/token`, `file:`/`data:` (recursion + noise guards).
- **Client/browser errors** → `apps/web/src/components/error-reporter.tsx` mounted in the root layout: `window 'error'` + `unhandledrejection` (source `client`) and an `ErrorBoundary` (source `react`) POST to `POST /api/logs/ingest`.
- **App code** → existing `log*()` calls in `packages/agent/src/logger.ts` (sources like `chat`, `chat-runner`, `gmail`, etc.).
- **UI** → `apps/web/src/app/(dashboard)/logs/page.tsx` polls every 2s (Pause/Live toggle), filter by level + search (message/source), **Copy all** / per-row copy, relative timestamps.

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

## Multi-session chat
- Each chat conversation is a **session** (`chat_sessions` table) — isolate messages by `session_id`.
- `POST /api/chat` with no `sessionId` → creates a new session, auto-titles from first message (truncated 60 chars).
- `POST /api/chat` with `sessionId` → continues that session; history loaded `WHERE doctor_id = $1 AND session_id = $2`.
- **`POST /api/chat` returns an SSE stream** (not JSON): `{"type":"text","text":"<chunk>"}` chunks as tokens arrive, then tool/approval events, then `{"type":"done","sessionId","text"}`. Full event set: `text`, `tool` (non-sensitive tool-call started), `tool-result` (`{toolCallId, toolName, output}`), `approval` (`{approvalId, toolName, toolCallId, input}` — pauses the turn), `done`, `error`. The chat UI parses this — update it if the event shape changes.
- **`POST /api/chat/approval`** resolves a pending sensitive tool (`{sessionId, approvalId, approved, input?}`) and streams the SAME event set (it first emits a `tool-result` for the resolved tool, then resumes the loop). `input` carries a revised input from the Modify flow.
- **Latency rules (keep the chat path fast):** the `logWithClient` "Processing message" call is fire-and-forget (`.catch(()=>{})`) so it never blocks the response; assistant turns are persisted once per loop completion; brand-new sessions skip the (empty) history query. Do not reintroduce awaited logs on the request path.
- Session APIs: `GET /api/sessions` (list), `POST /api/sessions` (create empty), `PATCH /api/sessions/[id]` (rename), `DELETE /api/sessions/[id]` (delete + cascade messages), `GET /api/sessions/[id]/messages` (load messages + returns `state.{status, pendingApproval, crashedToolCalls}`).
- Session sidebar in chat UI: list sessions, switch, rename (pencil icon), delete (trash icon), "+ New Chat" button.
- `AgentContext.sessionId` is set by the chat route; tools can optionally use it for logging/session-scoped operations.
- `test-chat.ts` supports `--session-id <uuid>` to continue an existing session.

## Architecture rules (do NOT violate these)

### 1. No fixed workflows
Every session (chat/cron/event) spawns a **fresh dynamic AI agent session** — the agent decides steps itself based on instructions + tools + context. Both paths use the same manual stateless loop (`runChatStep()`: single `streamText` step, schema-only tools, `stopWhen: isStepCount(1)`). **chat** is driven by `runChatTurn()` in `apps/web/src/lib/chat-runner.ts`; **cron**/**event** are driven by `runAutomationTurn()` in `apps/web/src/lib/automation-runner.ts` (loop capped at `MAX_STEPS = 10`). Both execute non-sensitive tools inline and pause on the first sensitive tool. All on Vercel.

### 1b. Model context MUST be valid AI SDK v7 `ModelMessage[]`
The stateless loop feeds the full history back into `streamText` on every step, and persists it in `chat_state.messages`. AI SDK v7 validates this array against `toolModelMessageSchema`, which requires every tool-result's `output` to be a **discriminated union on `type`** (`{ type: 'json' | 'text' | 'error-json' | 'error-text' | 'content' | 'execution-denied', value }`). Passing a raw object (e.g. `{ sent: true }`) throws `InvalidPromptError`, so the resumed loop and every later turn return nothing. Always wrap tool outputs with `wrapToolOutput()` (in `apps/web/src/lib/chat-state.ts`) before pushing them into model messages — both the inline tool-execution path in `chat-runner.ts` and the approval path in `app/api/chat/approval/route.ts`. The SSE `tool-result` event may still carry the raw output (it's for the UI), but the `messages` pushed for the model/persistence must be wrapped. Also push the assistant's final text back as `{ role: "assistant", content: stepText }` so the model keeps its own replies in context.

### 2. Approval gate = code-level, not LLM-level
Sensitive/non-sensitive classification is loaded per-doctor (`loadToolSensitivity`) and enforced in code — the LLM cannot bypass it:
- **chat** → `runChatTurn` pauses on a sensitive tool, persists the full context + `pending_approval` in `chat_state`, and emits an `approval` SSE event; the doctor Approves/Rejects/Modifies via `POST /api/chat/approval`.
- **cron** / **event** → `runAutomationTurn` pauses by writing `chat_state.status = awaiting_approval` + `pending_approval` and inserting an `approval_requests` row (surfaces on `/review`); the doctor approves/rejects via `PATCH /api/approval/[id]`, which inline-resumes via `resumeAutomationTurn`. Sensitivity is per automation: override (`automation_tool_overrides`) → general (`tool_sensitivity_settings`) → defaults.

### 3. Context-driven tools (factory pattern)
All tools are factory functions (`createSendEmailTool(ctx)`, etc.) that accept `AgentContext`. Agent context carries `doctorId`, `sessionType`, `sessionId`, and the Supabase client. Chat and automation (cron/event) sessions both run on Vercel and pass the same context shape.

### 4. RLS on ALL tables
Every table has `doctor_id` and RLS policy `auth.uid() = doctor_id`. Never query without the auth context — data isolation is DB-level, not app-level.

### 5. Two separate OAuth flows per provider (login vs API)
- **Login auth:** `signInWithOAuth` in `app/(auth)/login/page.tsx` — identity only (Google)
- **API auth:** provider consent screen with data scopes — stored as encrypted refresh token in Supabase. Separate OAuth grant, configured in `app/(dashboard)/settings/page.tsx`
  - **Google:** `google_connections` table + `packages/agent/src/google/` (scopes: Gmail, Calendar, Drive, Sheets)
  - **Microsoft:** `microsoft_connections` table + `packages/agent/src/microsoft/` (scopes: `Mail.ReadWrite Mail.Send Calendars.ReadWrite Files.ReadWrite User.Read offline_access`, tenant `common`, Graph v1.0). Env: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REDIRECT_URI`. Tokens encrypted with the same `GOOGLE_ENCRYPTION_KEY` (AES-GCM). Callback public in middleware.

### 6. Automation runs entirely on Vercel (no Trigger.dev wait tokens)
The agent never runs on Trigger.dev. Trigger.dev only schedules (15-min cron DB-check → forward, 5-min ping) and forwards to Vercel. Approval pause/resume is Vercel-side: `runAutomationTurn` writes `chat_state.status = awaiting_approval` + an `approval_requests` row; `PATCH /api/approval/[id]` resumes. No `wait.for` polling anymore.

## File signposts
| Concern | Path |
|---|---|
| Auth middleware | `apps/web/src/middleware.ts` |
| Server Supabase client | `apps/web/src/lib/supabase-server.ts` |
| Browser Supabase client | `apps/web/src/lib/supabase-browser.ts` |
| DB migration (schema source of truth) | `supabase/migrations/00001_initial_schema.sql` |
| Chat sessions migration | `supabase/migrations/00002_chat_sessions.sql` |
| Types + constants | `packages/shared/src/` |
| DB types (hand-written) | `packages/db/src/types.ts` |
| Agent + context definition | `packages/agent/src/agent.ts` |
| Agent context interface | `packages/agent/src/context.ts` |
| Tool factories (context-driven) | `packages/agent/src/tools/` (gmail.ts, calendar.ts, drive.ts, sheets.ts) |
| Approval gate helper | `packages/agent/src/approvals.ts` |
| Chat API route | `apps/web/src/app/api/chat/route.ts` |
| Sessions API (list/create) | `apps/web/src/app/api/sessions/route.ts` |
| Session edit/delete | `apps/web/src/app/api/sessions/[id]/route.ts` |
| Session messages | `apps/web/src/app/api/sessions/[id]/messages/route.ts` |
| Durable chat state migration | `supabase/migrations/00007_chat_state.sql` (`chat_state` + `tool_execution_log`) |
| Approval resolve API (PATCH) | `apps/web/src/app/api/approval/[id]/route.ts` |
| Approval list API (GET) | `apps/web/src/app/api/approvals/route.ts` |
| Review dashboard | `apps/web/src/app/(dashboard)/review/page.tsx` |
| Tasks dashboard | `apps/web/src/app/(dashboard)/tasks/page.tsx` |
| Tasks list API (GET/POST) | `apps/web/src/app/api/tasks/route.ts` |
| Task update API (PATCH/DELETE) | `apps/web/src/app/api/tasks/[id]/route.ts` |
| Task run-now API (POST — manual trigger, no cron wait) | `apps/web/src/app/api/tasks/[id]/run/route.ts` |
| Events list API (GET/POST) | `apps/web/src/app/api/events/route.ts` |
| Event update API (PATCH/DELETE) | `apps/web/src/app/api/events/[id]/route.ts` |
| Google OAuth + token mgmt | `packages/agent/src/google/auth.ts` (`getGoogleAuth(doctorId, supabaseClient?)` — accepts optional client, falls back to service key) |
| Token encryption | `packages/agent/src/google/encryption.ts` (AES-GCM, used for Google AND Microsoft tokens via `GOOGLE_ENCRYPTION_KEY`) |
| Real Gmail API calls | `packages/agent/src/google/gmail.ts` |
| Real Calendar API calls | `packages/agent/src/google/calendar.ts` |
| Real Drive API calls | `packages/agent/src/google/drive.ts` |
| Real Sheets API calls | `packages/agent/src/google/sheets.ts` |
| Microsoft OAuth + token mgmt | `packages/agent/src/microsoft/auth.ts` (`getMicrosoftOAuthUrl`, `exchangeMicrosoftCodeForTokens`, `getMicrosoftAccessToken(doctorId, supabaseClient?)`) |
| Microsoft Graph helper | `packages/agent/src/microsoft/graph.ts` (`graphRequest(accessToken, path, init?)`) |
| Outlook mail calls | `packages/agent/src/microsoft/mail.ts` |
| Outlook calendar calls | `packages/agent/src/microsoft/calendar.ts` |
| OneDrive calls | `packages/agent/src/microsoft/drive.ts` |
| Microsoft tool factories | `packages/agent/src/microsoft/tools/` (mail.ts, calendar.ts, drive.ts) |
| Logger (DB + local file) | `packages/agent/src/logger.ts` |
| Local log output | `logs/local-dev.log` (gitignored) |
| Request trace logger | `apps/web/src/lib/request-trace.ts` → `apps/web/logs/traces/*.log` (gitignored) |
| Request logging (middleware) | `apps/web/src/lib/edge-logger.ts` (`logEdgeRequest`) |
| Server total-capture | `apps/web/src/instrumentation.ts` → `apps/web/src/lib/server-logging.ts` |
| Client error capture | `apps/web/src/components/error-reporter.tsx` |
| Client log ingest API | `apps/web/src/app/api/logs/ingest/route.ts` (POST) |
| Logs API (read) | `apps/web/src/app/api/logs/route.ts` (GET, `level` + `q` filters) |
| Logs UI | `apps/web/src/app/(dashboard)/logs/page.tsx` |
| Test config / env loader | `scripts/lib/config.ts` |
| Node 20 WebSocket polyfill | `scripts/lib/polyfill.ts` |
| Agent tool tests | `scripts/test-agent.ts` (`pnpm test:agent`) |
| API endpoint tests | `scripts/test-api.ts` (`pnpm test:api`) |
| Agent conversation test | `scripts/test-chat.ts` (`pnpm test:chat`) |
| Google connect URL API | `apps/web/src/app/api/settings/google-connect/route.ts` |
| Google OAuth callback | `apps/web/src/app/api/auth/google-callback/route.ts` |
| Google connection API | `apps/web/src/app/api/settings/google-connection/route.ts` |
| Microsoft connect URL API | `apps/web/src/app/api/settings/microsoft-connect/route.ts` |
| Microsoft OAuth callback | `apps/web/src/app/api/auth/microsoft-callback/route.ts` |
| Microsoft connection API | `apps/web/src/app/api/settings/microsoft-connection/route.ts` |
| Trigger.dev config | `apps/worker/trigger.config.ts` |
| Chat stateless loop (server) | `apps/web/src/lib/chat-runner.ts` (`runChatTurn` — manual multi-step loop over `runChatStep`) |
| Durable chat state helpers | `apps/web/src/lib/chat-state.ts` (`load/saveChatState`, `logToolStart/Finish`, `findCrashedToolExecutions`, `resolveToolPart`, `wrapToolOutput`) |
| Chat approval resolve API | `apps/web/src/app/api/chat/approval/route.ts` (authed POST → SSE; executes/rejects the pending sensitive tool then resumes the loop) |
| Tool input rewrite (AI modify) | `packages/agent/src/agent.ts` → `rewriteToolInput({ toolName, input, instruction })` (returns revised input or `null`) |
| Modify tool API route | `apps/web/src/app/api/chat/modify-tool/route.ts` (authed POST → `{ input }`) |
| Tool sensitivity settings API | `apps/web/src/app/api/settings/tool-sensitivity/route.ts` |
| Tool sensitivity settings UI | `apps/web/src/app/(dashboard)/settings/tools/page.tsx` |
| Tool sensitivity loader (agent) | `packages/agent/src/tool-sensitivity.ts` |
| Tool sensitivity migration | `supabase/migrations/00005_tool_sensitivity.sql` |
| Cron scheduler (15-min → Vercel) | `apps/worker/src/trigger/cron.ts` |
| Event poll scheduler (5-min ping → Vercel) | `apps/worker/src/trigger/event-poll.ts` |
| Event webhook forwarder (future push) | `apps/worker/src/trigger/events.ts` |
| Trigger.dev dispatch helpers | `apps/worker/src/dispatch.ts` (`forwardToAutomation`, `dispatchEventItem`, `pingAutomationPoll`) |
| Cron matcher | `apps/worker/src/cron-match.ts` |
| Deterministic event filter | `packages/shared/src/filters.ts` (`doesEventMatchFilter`) |
| Event filter types | `packages/shared/src/types.ts` (`EventFilterRules`, `EventSourceType`) |
| Scheduling recurrence migration | `supabase/migrations/00011_scheduling_recurrence.sql` (`schedule_type` + `scheduled_task_dates`) |
| Cron builders/parser (shared, pure) | `packages/shared/src/cron.ts` (`buildDailyCron`, `buildDaysOfWeekCron`, `buildDaysOfMonthCron`, `buildHourlyCron`, `buildCronFromSchedule`, `isValidCron`, `zonedTimeToUtc`, `parseCron`) |
| Automation run API (agent, secret-protected) | `apps/web/src/app/api/automation/run/route.ts` |
| Automation poll API (event polling, secret-protected) | `apps/web/src/app/api/automation/poll/route.ts` |
| Automation overrides API | `apps/web/src/app/api/automation/overrides/route.ts` |
| Automation shared handler | `apps/web/src/lib/automation-dispatch.ts` (`runAutomationPayload`) |
| Automation runner (cron/event loop) | `apps/web/src/lib/automation-runner.ts` (`runAutomationTurn`, `resumeAutomationTurn`) |
| Scheduling + event-trigger tools | `packages/agent/src/tools/automation.ts` (`createScheduleTaskTool`, `createEventTriggerTool`) |

## Phase conventions
- **Phase 5:** All tools call real Google APIs via `googleapis` (Gmail, Calendar, Drive, Sheets). Use `getGoogleAuth(doctorId, supabaseClient?)` → fetches encrypted refresh token from `google_connections`, creates OAuth2 client, auto-refreshes tokens. Pass the caller's Supabase client when available so it works without `SUPABASE_SERVICE_KEY`.
- **Phase 5 env vars:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_ENCRYPTION_KEY` (must be exactly 32 chars).
- **AI model:** `deepseek-v4-flash` via `createOpenAICompatible({ baseURL: "https://opencode.ai/zen/go/v1" })`, using `OPENAI_API_KEY`. The `getModel()` function in `packages/agent/src/agent.ts` is the single point to swap providers/models.
- **Supabase clients:** `packages/db/src/server.ts` uses `SUPABASE_SERVICE_ROLE_KEY`; `packages/agent/src/google/auth.ts` and the logger use `SUPABASE_SERVICE_KEY`. `.env.local` sets both via `SUPABASE_SERVICE_KEY` (the env used by the running server).

## Session state (compressed — 2026-08-09)
- **Microsoft (Outlook/OneDrive) integration (done, not yet connected):** migration `00004_microsoft_connections.sql` (table + RLS + partial unique index), `packages/agent/src/microsoft/` (auth.ts, graph.ts, mail.ts, calendar.ts, drive.ts) + tool factories in `microsoft/tools/`. Agent now exposes 12 tools (6 Google + 6 Microsoft). New routes: `GET /api/settings/microsoft-connect`, `GET /api/settings/microsoft-connection`, `GET /api/auth/microsoft-callback` (public). Settings page has a Microsoft card + Outlook/OneDrive service rows. Env: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REDIRECT_URI` (placeholders added to `.env.local` — must be filled from Azure portal App Registration). Same `GOOGLE_ENCRYPTION_KEY` encrypts both providers' tokens. Agent + web typechecks pass. TO CONNECT: register an Azure app (redirect URI `http://localhost:3000/api/auth/microsoft-callback`, scopes Mail.ReadWrite, Mail.Send, Calendars.ReadWrite, Files.ReadWrite, User.Read, offline_access), fill env, restart web, click Connect in Settings.
- **IMPORTANT — "doctor" = university professor/lecturer, NOT hospital doctor.** The platform assists academics: teaching (office hours, lectures, grading), research (papers, deadlines, collaboration), admin (emails, calendar, drive files, sheets). Keep this in mind when wording system prompts, tool behavior, and any UI copy.
- **Multi-session chat:** done & verified. `chat_sessions` table + `conversations.session_id` (migration `00002_chat_sessions.sql` applied). API: `GET/POST /api/sessions`, `PATCH/DELETE /api/sessions/[id]`, `GET /api/sessions/[id]/messages`. Chat UI has session sidebar. `test-chat.ts` supports `--session-id`.
- **Model:** `deepseek-v4-flash` (was `mimo-v2.5`) via `getModel()` in `packages/agent/src/agent.ts:16`.
- **Chat latency fixes (done):** chat route returns SSE stream (`{type:"text"}` chunks → `{type:"done"}`). `logWithClient` "Processing" is fire-and-forget. New sessions skip history query. Persist = `Promise.all` insert + session touch after stream. Measured TTFB ~3s, total ~3.3s vs old 4.4-5s. Verified tool-calls stream + persistence. `test-chat.ts` parses SSE.
- **Request trace logger (done — chat + sessions routes):** `apps/web/src/lib/request-trace.ts` — `createTrace()` per request, phases + timings + full error stacks. Output: `apps/web/logs/traces/<requestId>.log`, `errors.log`, `index.log`. Dev-only. Instrumented in `POST /api/chat` AND all session routes (`GET/POST /api/sessions`, `PATCH/DELETE /api/sessions/[id]`, `GET /api/sessions/[id]/messages`). Verified live: each session request writes its own `<requestId>.log` with phase timings.
- **Known issue:** user `c403bcf2` hit `getGoogleAuth failed: Unsupported state or unable to authenticate data` at 01:30 (decryptRefreshToken — GOOGLE_ENCRYPTION_KEY mismatch). Resolved by 03:23 (readEmails worked later). Not related to streaming changes.
- **Assistant self-identity:** model answers "I'm Claude" to "what model are you" — acceptable or override in SYSTEM_PROMPT.
- **Dev server:** runs via `setsid bash -c 'npx next dev --port 3000 > /tmp/next-dev8.log 2>&1 < /dev/null &'` from `apps/web/`. Boot ~55s. Use curl for tests, not shell which hangs on `&`.
- **KNOWN ISSUE — stale client bundle after edits (fixed by restarting `next dev`):** `next dev` can keep serving a stale compiled client chunk (`apps/web/.next/static/chunks/app/(dashboard)/chat/page.js`) — the source file has the new UI but the browser still shows the old one (e.g. "Approve with changes" button instead of "Revise input"). This happened on 2026-08-11: the static chunk was still from Aug 10 while the server-side chunk (`apps/web/.next/server/app/(dashboard)/chat/page.js`) recompiled fine. Symptom: user reports "the site still runs the old style" even though the code is modified and they're on localhost. Fix: kill `next dev` and restart it fresh (optionally delete the stale static chunk first). Hot-reload is NOT sufficient for this page. Verify after restart: the static chat chunk must contain the new strings (e.g. `grep -c "Revise input" apps/web/.next/static/chunks/app/(dashboard)/chat/page.js`) and NOT the old ones.
- **Durable stateless chat via Next.js loop (NEW — 2026-08-13):** chat moved OFF Trigger.dev `chat.agent` onto a Next.js API route (`/api/chat`) running a manual stateless loop (`runChatTurn` in `apps/web/src/lib/chat-runner.ts`). Full model context is persisted after every step in `chat_state.messages` (AI SDK `ModelMessage[]`, keyed by `session_id`, overwrite-style) so a reload/crash/new request resumes as a true continuation. Sensitive tools pause by writing `chat_state.status = awaiting_approval` + `pending_approval`, then the doctor resolves via `POST /api/chat/approval`. Crash protection: sensitive executions record `started` → `completed|failed` markers in `tool_execution_log`; on load `GET /api/sessions/[id]/messages` returns `state.crashedToolCalls` and the UI warns instead of auto-retrying. Migration `00007_chat_state.sql`. `cron`/`event`/`approval-handler` on Trigger.dev are UNCHANGED. Deleted: `apps/worker/src/trigger/chat.ts`, `apps/worker/src/chat-persistence.ts`, `apps/web/src/app/actions.ts`, `POST /api/sessions/[id]/submit`, and the `@ai-sdk/react` + `@trigger.dev/sdk` web deps.
- **FIX — chat silent after tool use (2026-08-13):** feeding a raw tool-result output into `streamText` threw `InvalidPromptError` (AI SDK v7 requires `output` to be a `{ type, value }` discriminated union). Added `wrapToolOutput()` and applied it at both tool-result insertion points; also started pushing the assistant's final text back into `chat_state.messages`. Cleaned up the 3 already-corrupted `chat_state` rows in Supabase so those sessions work again.
- **Tool sensitivity + approval (NEW — 2026-08-10):** each of the 12 tools is classified sensitive/non-sensitive per doctor. `packages/shared/src/constants.ts` defines `AGENT_TOOL_NAMES` + `TOOL_SENSITIVITY_DEFAULTS` (sendEmail, sendOutlookEmail, createEvent, createOutlookEvent, searchDrive, searchOneDrive, readSheet, readOneDriveFile = sensitive by default). Stored in `tool_sensitivity_settings` (migration `00005_tool_sensitivity.sql`, PK doctor_id+tool_name, RLS). API: `GET/PUT /api/settings/tool-sensitivity`. UI: `/settings/tools` (toggle switches). In the chat loop, `runChatTurn` loads sensitivity via `loadToolSensitivity` and pauses on sensitive tools (emits `approval` SSE event + writes `chat_state.pending_approval`); non-sensitive tools execute inline. The chat UI renders Approve/Modify/Reject cards and resolves via `POST /api/chat/approval`.
- **Modify = AI rewrite of tool input (NEW — 2026-08-11):** the Modify flow is NOT a direct JSON edit anymore. The doctor types a free-text instruction (Arabic supported), the web UI calls `POST /api/chat/modify-tool` → `rewriteToolInput({ toolName, input, instruction })` (uses `generateText` on the same `deepseek-v4-flash` model), then updates the local approval card's `input` (marked `revised`) and the subsequent Approve sends `{ approved: true, input: revised }` to `POST /api/chat/approval`, which applies the revised input to the pending tool-call before executing it.
- **KNOWN BUG — approval round-trip (RESOLVED by removal):** the old `chat.agent` approval round-trip threw `MissingToolResultsError` on approve (the `approved` flag was dropped from the `tool-approval-response` part in the Trigger.dev wire/merge). This path is GONE — the new stateless loop executes/rejects the tool in `POST /api/chat/approval` directly and feeds the result back as a normal `tool` model message, so there is no SDK approval part to lose.
- **Never run `trigger.dev` from PowerShell** (kills WSL node_modules symlinks). Always: `cd "/mnt/c/DR asis/doctor-ai-platform/apps/worker" && pnpm dev` from WSL. The `trigger.dev` package bin is `trigger` (package.json `"dev": "trigger dev"`).
- **Event polling moved to Vercel (NEW — 2026-08-15):** the 5-min "webhook simulator" no longer polls on Trigger.dev. Trigger.dev is now a THIN SCHEDULER ONLY for both automation types: the 15-min `doctor-scheduled-session` cron checks the DB for due tasks and forwards to Vercel `/api/automation/run`; the 5-min `check-event-triggers` pings Vercel `/api/automation/poll`. `/api/automation/poll` is ONE function that polls ALL users' Gmail/Calendar/Drive in parallel (`Promise.all`), applies the deterministic filter (`doesEventMatchFilter`), and forwards each match to `/api/automation/run` (a separate function with its own 300s budget) which does the semantic filter (`filterMatchesCondition`) + dedupe (`event_trigger_seen`) + agent. Extracted the shared handler `runAutomationPayload` into `apps/web/src/lib/automation-dispatch.ts`; `/api/automation/run` now delegates to it. Added `pingAutomationPoll` to `apps/worker/src/dispatch.ts`. Deleted `apps/worker/src/approval-handler.ts`. Env: `AUTOMATION_SECRET` + `AUTOMATION_BASE_URL` (worker) and `AUTOMATION_SECRET` (Vercel). Vercel cron is NOT used — Hobby cron is capped at once/day, so Trigger.dev remains the clock.
- **Event filter UI + Microsoft sources (NEW — 2026-08-16):** event triggers now support 6 sources — `gmail_new_message`, `calendar_event_soon`, `drive_new_file` (Google) + `outlook_new_message`, `outlook_calendar_soon`, `onedrive_new_file` (Microsoft). The `/tasks` page has a per-source structured filter editor (fields: `from`, `to`, `subjectContains`, `bodyContains`, `hasAttachment`, `attendeeContains`, `locationContains`, `folderId`, `mimeType` — new ones are `locationContains` + `mimeType`). `doesEventMatchFilter` + `EventFilterRules`/`EventSourceType` updated to match. Polled payloads were enriched so every filter field actually has data (Gmail `to`/`hasAttachment`, Drive `parents`, Outlook `toRecipients`/`hasAttachments`, OneDrive `parentReference.id`); Microsoft list fns (`listOutlookMessages`, `listOutlookEvents`, `searchOneDrive`) are now exported from `@repo/agent`. Note: `bodyContains` matches `snippet`/`bodyPreview` (cheap), NOT the full body.
- **Scheduling recurrence — simplified + picker UI (NEW — 2026-08-16):** recurrence is now 4 types in the UI — **Daily** (`0 h m * * *`), **Days of the week** (multi-select Sun–Sat toggle buttons → `0 h m * * 0,2,4`), **Days of the month** (1–31 number grid → `0 h m 1,15 * *`), and **Specific dates** (multi-select `react-day-picker` calendar → `schedule_type='one_off_dates'` + `scheduled_task_dates`). All cron string building/parsing lives in the new pure module `packages/shared/src/cron.ts` (`buildDailyCron`/`buildDaysOfWeekCron`/`buildDaysOfMonthCron`/`buildHourlyCron`/`buildCronFromSchedule`/`isValidCron`/`zonedTimeToUtc`/`parseCron`), imported by BOTH the agent tool and the `/tasks` UI (client-safe — no ai/supabase deps). The agent `scheduleSpec` uses `frequency: "daily" | "days_of_week" | "days_of_month" | "hourly"` (+ raw `cron_expression` and `dates`), where days are multi-select arrays. Migration `00011` (unchanged) provides `schedule_type` + `scheduled_task_dates` (RLS via subquery to the owning task) and nullable `cron_expression`. Worker `cron.ts` splits recurring vs one-off: one-off fires each due unfired date and auto-sets `enabled=false` once all dates fired; `cron-match.ts` already handles list fields. **Disambiguation rule** (SYSTEM_PROMPT rule 8 + tool description): day numbers without "every month" vs "this month" → MUST ask, never guess (days_of_month vs one-off `dates`). No manual typing: DOW/DOM are toggle buttons, dates come from the calendar, time is a native `<input type="time">`. Deps added to `@apps/web`: `react-day-picker` (v10, `mode="multiple"`), `date-fns` (format). `/api/tasks` GET attaches `dates` to one-off tasks; POST accepts `cron_expression` (recurring) or `schedule_type`/`dates`/`time` (one-off).
- **Every N hours from a start time (NEW — 2026-08-16):** new `schedule_type='every_n_hours'` with `interval_hours` + `interval_anchor` columns (migration `00012_every_n_hours.sql`, also widens the schedule_type check constraint). When N divides 24 the schedule is stored as an enumerated cron (`buildEveryNHoursCron(startTime, intervalHours)` → e.g. start 07:00 every 3h = `0 1,4,7,10,13,16,19,22 * * *`) and fired by the existing cron path. When N does NOT divide 24 (e.g. 5, 7, 10…), `cron_expression` is null and the worker's `intervalNextSlot()` computes the fire from `interval_anchor` (the start time on creation day in the task tz) + `interval_hours` + `last_run_at`, fast-forwarding missed slots (fire once, no catch-up storm). Shared helpers `buildEveryNHoursCron`/`intervalAnchorUtc`/`dateStringInTimeZone` live in `packages/shared/src/cron.ts`; the agent tool exposes `frequency:"every_n_hours"` + `intervalHours`, and the `/tasks` UI adds an "Every N hours" option (interval number + the existing Time field).
