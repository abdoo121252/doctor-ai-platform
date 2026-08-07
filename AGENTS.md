# AGENTS.md — Doctor AI Agent Platform

## Stack
- **Framework:** Next.js 14+ (App Router) with Tailwind CSS + shadcn/ui components
- **Execution:** Trigger.dev v3 (serverless tasks, `wait.createToken` for approvals)
- **Agent:** Mastra (`@mastra/core`) — dynamic agent sessions, no pre-scripted workflows
- **Database:** Supabase (Postgres) with RLS on every `doctor_id`-scoped table
- **Auth:** Supabase Auth (Google OAuth for login — separate from Google API OAuth in Phase 5)
- **Google API tokens:** Stored encrypted in Supabase (Vault or app-level encryption). Single Trigger.dev project for all doctors — each task fetches its doctor's token at runtime.

## Monorepo layout
```
doctor-ai-platform/
├── apps/web/          # Next.js dashboard (App Router)
├── apps/worker/       # Trigger.dev tasks (Mastra agent runs inside)
├── packages/db/       # Supabase client, types, Zod schemas
├── packages/agent/    # Mastra agent + tool definitions
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
| Google OAuth + token mgmt | `packages/agent/src/google/auth.ts` |
| Token encryption | `packages/agent/src/google/encryption.ts` |
| Real Gmail API calls | `packages/agent/src/google/gmail.ts` |
| Real Calendar API calls | `packages/agent/src/google/calendar.ts` |
| Real Drive API calls | `packages/agent/src/google/drive.ts` |
| Real Sheets API calls | `packages/agent/src/google/sheets.ts` |
| Google connect URL API | `apps/web/src/app/api/settings/google-connect/route.ts` |
| Google OAuth callback | `apps/web/src/app/api/auth/google-callback/route.ts` |
| Google connection API | `apps/web/src/app/api/settings/google-connection/route.ts` |
| Trigger.dev config | `apps/worker/trigger.config.ts` |
| Trigger.dev approval handler | `apps/worker/src/approval-handler.ts` |
| Chat task | `apps/worker/src/trigger/chat.ts` |
| Cron task | `apps/worker/src/trigger/cron.ts` |
| Event task | `apps/worker/src/trigger/events.ts` |

## Phase conventions
- **Phase 5:** All tools call real Google APIs via `googleapis` (Gmail, Calendar, Drive, Sheets). Use `getGoogleAuth(doctorId)` → fetches encrypted refresh token from `google_connections`, creates OAuth2 client, auto-refreshes tokens.
- **Phase 5 env vars:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_ENCRYPTION_KEY` (32+ chars).
- **AI model:** Configured via `OPENAI_API_KEY` env var. No hardcoded provider in code. The `getModel()` function in `packages/agent/src/agent.ts` is the single point to swap providers.
