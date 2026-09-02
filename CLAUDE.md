# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **MANDATORY — read the QuickPitik vault `desktop/` folder before any non-trivial work here.** BatchMyPhotos is the desktop product of the QuickPitik ecosystem; its working memory, decisions, and feature context live in the vault, not this repo. See [Companion Vault — Read First (MANDATORY)](#companion-vault--read-first-mandatory) at the bottom of this file.

## Project Overview

BatchMyPhotos is a desktop utility for photographers to batch-split image folders into sized batches. Architecture (since 2026-08-31): Electron desktop app + Next.js marketing/dashboard website (Vercel) + **Supabase as the entire backend** (Postgres RLS + SECURITY DEFINER RPCs, GoTrue auth, Edge Functions for PayMongo/email, pg_cron). The old Express backend (`backend/`) is retired — kept only until Railway is decommissioned; do not add code to it.

## Common Commands

### Desktop App (Electron + React)
- `npm start` - Dev mode: runs Vite dev server + Electron concurrently
- `npm run dev` - Vite dev server only (port 5173)
- `npm run build` - Production Vite build to `/dist`
- `npm run dist` - Build + package installers (NSIS + AppX) to `/release`
- `npm run dist:appx` - Build AppX only (Microsoft Store)

### Supabase (backend)
- `npx supabase start` - Local stack (applies `supabase/migrations/`)
- `npx supabase functions serve` - Run Edge Functions locally
- `npx supabase db push` - Apply new migrations to the linked prod project

### Website (Next.js)
- `npm run dev --prefix website` - Next dev server (port 3000)
- `npm run build --prefix website` - Production build (`.next/`)
- Deployed on Vercel; env vars in `website/.env.example`

### Testing
- `npm test` - Run all tests (vitest)
- `npm run test:watch` - Watch mode
- `npx vitest run tests/batchEngine.test.js` - Run a single test file
- Tests live in `tests/` and use Node environment with 10s timeout

### Linting & Formatting
- `npm run lint` / `npm run lint:fix` - ESLint (5 rule sets: main process CJS, renderer ESM, shared utils, tests, config)
- `npm run format` - Prettier

## Architecture

### Repo Layout

```
/desktop/           Electron desktop app
  main.js           Electron main process entry
  preload.js        Context bridge (IPC API exposed to renderer)
  src/main/         Main process services (Node.js, CommonJS)
  src/              React renderer (ESM, JSX)
/supabase/          The backend: migrations (full schema + RPCs) + Edge Functions
/website/           Marketing site + dashboard (Next.js 15 App Router + React 19 + Tailwind v4)
/backend/           RETIRED Express server — pending decommission, do not extend
```

### Desktop App - Main Process (`src/main/`)

The main process is service-oriented. Key services:

- **ipcHandlers.js** - Central IPC dispatcher (~2000 lines), organized into 8 groups: auth, subscription, device, folder, core, filesystem, preferences, batch management. All calls from renderer go through `preload.js` -> IPC -> here.
- **batchEngine.js** - Core algorithm: groups files by basename (JPG+RAW pairing), then bin-packs with First-Fit-Decreasing. Supports 50+ image formats.
- **batchExecutor.js** - Executes file move/copy operations with concurrency limits. Detects same-drive for instant moves vs cross-drive copies.
- **authService.js** - JWT + refresh token auth via deep links (`batchmyphotos://auth/callback`). Offline session recovery.
- **subscriptionService.js** - Enforces subscription gating (batch processing is unlimited for all users as of 2026-09-02; offline batching stays Pro-only). Offline enforcement with 3-day cache grace. Clock-tampering detection via monotonic high-water mark.
- **rollbackManager.js** - Persists encrypted operation manifests for full undo capability (max 20 history entries).
- **progressManager.js** - Tracks file operation progress with interrupt recovery (resume/discard).
- **securityManager.js** - Path whitelist validation, prevents directory traversal.
- **deviceService.js** - Hardware ID binding via node-machine-id. Pro: 2 devices, Pro+: 5. 5-minute heartbeat.
- **blurDetectionService.js** - AI blur detection (feature-flagged, currently disabled). Batch API with polling + exponential backoff.
- **secureStore.js** - Wraps electron-store with OS-level encryption (Windows DPAPI / macOS Keychain).
- **config.js** - Feature flags controlled by `BATCH_*` env vars (rollback, encryption, blur detection, HWID binding, etc.).
- **constants.js** - Performance tuning: thread pool sizes, concurrency limits, chunk sizes, timeouts.

### Desktop App - Renderer (`src/`)

React 18 with hooks-based state management (no Redux). Key patterns:
- `src/App.jsx` - Main orchestrator with extensive state
- `src/hooks/` - Custom hooks for each feature domain (useBatchExecution, useBlurDetection, useFolderSelection, useRollback, useSettings)
- `src/constants/appStates.js` - State machine: IDLE -> SCANNING -> READY -> EXECUTING -> COMPLETE/ERROR
- `src/utils/batchNaming.js` - Shared CJS module (used by both main and renderer via Vite commonjsOptions)
- All IPC calls go through `window.electronAPI.*` (defined in `preload.js`)

### Backend (`supabase/`)

Supabase is the entire backend — there is no app server.
- **Data + business logic**: Postgres with RLS; SECURITY DEFINER RPCs derive the
  user from `auth.uid()` and return jsonb bodies with `code` fields for business
  failures (`supabase/migrations/20260831000004_client_rpcs.sql`). Clients call
  them via PostgREST (`/rest/v1/rpc/*`); the desktop uses plain `net.fetch`
  (`desktop/src/main/supabaseApi.js`), the website uses supabase-js.
- **Auth**: GoTrue (password, Google OAuth, OTP). Desktop refresh goes straight
  to `/auth/v1/token?grant_type=refresh_token`.
- **Payments**: Edge Functions `checkout` / `verify-payment` / `paymongo-webhook`
  (HMAC-verified). Secrets live in Supabase function config, never in clients.
- **Email**: Resend via the `send-email` Edge Function; RPCs trigger it through
  `pg_net` (`_send_email()`); expiry reminders via `pg_cron` with a dedupe column.
- **Never** grant client roles EXECUTE on the legacy server-trusted RPCs
  (`track_batch_usage`, `check_and_bind_device`, …) — they trust their arguments.

### Website (`website/`)

Next.js 15 App Router + React 19 + Tailwind v4 + Framer Motion. Route wrappers in
`app/`, page components in `src/pages/`, all client components. Uses supabase-js
for auth + data. `app/api/version/route.js` serves the desktop update banner
(same shape as the old Express endpoint).

## Deployment

- **Website**: Vercel (auto-detected Next.js). Env: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `LATEST_APP_VERSION`, `APP_DOWNLOAD_URL`,
  `APP_RELEASE_DATE`, `MS_STORE_URL` (version-route changes need a redeploy).
- **Backend**: `npx supabase db push` for migrations, `npx supabase functions deploy`
  for Edge Functions. PayMongo webhook points at the `paymongo-webhook` function URL.
- **Railway is being decommissioned** — `railway.toml` + `backend/` go away once
  old desktop clients have drained (watch Railway logs).

## Key Conventions

- Main process files use **CommonJS** (`require`/`module.exports`); renderer uses **ESM** (`import`/`export`)
- `batchNaming.js` is a shared CJS module imported by both sides
- Prettier: semicolons, single quotes, trailing comma es5, 120 char width
- Path alias: `@/*` maps to `src/*` (jsconfig.json)
- Desktop app uses deep link protocol: `batchmyphotos://`
- Feature flags in `config.js` are toggled via `BATCH_*` environment variables

## QuickPitik Ecosystem Rules

BatchMyPhotos is the **desktop product** in the QuickPitik ecosystem (alongside `ai-api`, the Spring Boot backend, the Next.js website, and the Kotlin mobile app). These rules mirror the monorepo root `CLAUDE.md` and apply here too. The monorepo root lives at `C:\Users\Theo Cedric Chan\documents\Start up project\capstone-project`.

### ai-api / Blur Boundary

- **Blur detection is desktop-only.** BatchMyPhotos is where photographers cull blurry shots before uploading. Web and mobile MUST NOT call any blur endpoint — that boundary is enforced on their side; don't add anything here that assumes otherwise.
- **Desktop is the one client allowed to call `ai-api` directly.** Every other client (web, mobile) goes through the Spring Boot backend. BatchMyPhotos talks to `ai-api` directly via `config.features.BLUR_AI_URL` (default `http://localhost:8000`).
- **Use a restricted, least-privilege key.** Auth is the `X-API-Key` header; the key carries only `blur:read` + `jobs:read` (blur endpoints `/blur/detect`, `/blur/classify` and their batch variants, plus batch-job status polling) — never face or bib scopes. Full contract: monorepo `docs/desktop-blur-detection-integration-guide.md`.
- The legacy local Laplacian path (`BATCH_BLUR_AI_ENABLED=false`) is the fallback when the AI service is down. See vault `desktop/notes/blur-detection.md`.
- **Current state (2026-05-28):** the shipped code posts base64 to `${BLUR_AI_URL}/analyze` with no auth header and defaults to the local Laplacian path. The `X-API-Key` + scoped blur endpoints above are the **target** integration, not yet wired — the vault `desktop/notes/blur-detection.md` drift banner has the specifics.

### Secrets & Configuration

- `.env` files and API keys are gitignored — never commit them.
- Never hardcode URLs, thresholds, or secrets. Read them from `config.js` / `constants.js` or `BATCH_*` env vars.

### Git & Commits

- This repo is its own git remote: `github.com/theo2815/Batch-My-Photos`. It is separate from both the monorepo and the Obsidian vault.
- Create NEW commits; never amend published commits without explicit instruction.
- Never use `--no-verify` or bypass signing unless asked. Never force-push `main`.
- Stage specific files; avoid `git add -A`.
- **Bumping `version` in `package.json` ships an auto-update to every user** — only do it when explicitly cutting a release (see Maintenance-Mode rule 9).

### Custom Skills

- The **Frontend Design** skill applies to all desktop UI/UX work — renderer components in `src/`, the marketing/dashboard site in `website/`, layouts, styling, animation. Read it in full before any UI task: `C:\Users\Theo Cedric Chan\Documents\Obsidian Vault\QuickPitik Vault\Claude Skills\Frontend Design.md`. It overrides default styling approaches.

## Engineering Discipline — Apply Before Coding (MANDATORY)

These rules govern **how** to write code in this repo, and they apply **before the first line of code is written** — not as an after-the-fact review. Before implementing anything non-trivial, satisfy points 1–5 below. They complement the Maintenance-Mode Rules in the next section (which add this repo's hard, product-specific constraints).

**Tradeoff:** These guidelines bias toward caution over speed. For genuinely trivial tasks (typo, single-line edit, lookup), use judgment.

### 1. Confirm Alignment Before Acting

**If a prompt is unclear or you are not fully confident you understood it, ask a clarifying question first — every time. Never guess and proceed.**

- Before starting work, restate your understanding of the request in one or two sentences and confirm it matches the user's intent.
- If anything is ambiguous, underspecified, or open to more than one interpretation, stop and ask before writing code or making changes — do not assume the most likely meaning.
- Ask focused, specific questions (not "what do you want?"). Surface the exact point of confusion and, where helpful, offer the interpretations you're choosing between.
- Only skip this check for genuinely trivial, unambiguous requests (typo fix, single-line edit, direct lookup).
- Better to ask one extra question than to build the wrong thing.

### 2. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 3. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 4. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

### 5. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Maintenance-Mode Rules

BatchMyPhotos is a **shipped product** (currently `v1.0.5`, distributed via Microsoft Store + GitHub Releases auto-update). Users in the wild have saved presets, in-flight batch progress, persistent rollback history, active JWT/refresh sessions, and HWID-bound devices that the app must not break across an update. Treat this repo as **maintenance + targeted feature work, not a greenfield codebase**.

**Hard rules:**

1. **No unsolicited refactors.** Do not restructure services, rename files, "modernize" patterns, or reorganize folders unless the user explicitly asks. The three-tier layout, service-oriented main process, and hook-based renderer are intentional — consistency across the shipped surface matters more than micro-improvements.

2. **Critical shipped services are off-limits without explicit request.** These handle production state, revenue, or device trust. Do **not** modify them unprompted; if a task touches them, confirm with the user first and keep the change scoped:
   - `authService.js` — sessions, JWT refresh, `batchmyphotos://auth/callback` deep link
   - `subscriptionService.js` — batch-limit enforcement, 3-day offline grace, monotonic clock-tampering detection
   - `deviceService.js` — HWID generation, 5-minute heartbeat, device-bind API
   - `rollbackManager.js` — AES-256-GCM encrypted manifests on disk; format breakage = user undo history lost
   - `progressManager.js` — encrypted batch_progress.json; format breakage = resume fails
   - `secureStore.js` — DPAPI/Keychain wrapper; wrong serialization corrupts every encrypted cache
   - `securityManager.js` — path whitelist; relaxing this is a security regression
   - `batchEngine.js` / `batchExecutor.js` — core algorithm, well-tested, perf-tuned

3. **Active feature work is blur detection** (`blurDetectionService.js`, `useBlurDetection.js`, the AI API integration, and the `BlurSensitivityModal` + PreviewPanel touchpoints). This is the one area where ongoing improvement is expected — work freely there, but keep refactors **inside the feature's boundary**. Do not let blur-detection work leak into the shipped services above. Preserve `BATCH_BLUR_DETECTION_ENABLED=false` as the default so users without the AI service running are unaffected.

4. **Never break on-disk formats.** `secureStore` JSON blobs, `batch-history/*.manifest`, `batch_progress.json`, `rollback_progress.json`, presets, and recent-folders entries are read by older installs immediately after auto-update. If a schema must change, ship a migration that handles the legacy shape — never silently fail or wipe user data.

5. **Don't widen the renderer's privileged surface without good reason.** `preload.js` is the trust boundary; every new IPC method widens both the attack surface and the upgrade-compatibility contract. Add an `electronAPI.*` method only when no existing channel fits.

6. **Never bypass `securityManager.allowedPaths`.** All filesystem operations on user folders must validate paths through `securityManager`. Do not add code that reads or writes outside the whitelist, and do not persist the whitelist across sessions — the in-memory-only design is intentional (see the comment in `securityManager.js`).

7. **No new runtime dependencies without justification.** The dep list is intentionally small (`electron`, `sharp`, `exifr`, `electron-store`, `electron-updater`, `node-machine-id`, `lucide-react`, React). Each new dep increases install size, AppX cert review surface, and supply-chain risk. Prefer reusing what's already pulled in.

8. **Tests are the safety net.** Before shipping changes to `batchEngine.js`, `batchExecutor.js`, or any service with disk persistence, run `npm test` and confirm the vitest suite still passes. Do not skip or disable tests to make a change land.

9. **Bumping `version` in `package.json` ships an auto-update to every user.** Do not bump the version as part of a routine edit — only when the user is explicitly cutting a release.

## Companion Vault — Read First (MANDATORY)

This app's **second brain** is the Obsidian vault — the same one the QuickPitik monorepo uses:

```
C:\Users\Theo Cedric Chan\Documents\Obsidian Vault\QuickPitik Vault\
```

Before any non-trivial work in this repo, run this ritual (skip only for a typo / single-line fix / direct lookup):

1. Read the vault's `CLAUDE.md` and `VAULT-INDEX.md` (vault rules + status dashboard).
2. Read the `desktop/` module folder: `desktop/index.md`, `desktop/decisions.md`, and the relevant note under `desktop/notes/` — especially `maintenance-mode.md` (why the shipped services are off-limits) and `blur-detection.md` (the active feature + ai-api integration).
3. Confirm back the current desktop phase and the safe edges of whatever you're about to touch before estimating work.
4. **Codebase is the source of truth.** If a vault claim disagrees with the code, the code wins — fix the vault before acting on the claim.

When you make an architecture decision or learn something non-obvious, write it back to the vault (`desktop/decisions.md` for ADRs, `desktop/notes/` for learnings) per the vault's own sync rules. The vault explains the *why* and the safe edges; this file is the hard rules.
