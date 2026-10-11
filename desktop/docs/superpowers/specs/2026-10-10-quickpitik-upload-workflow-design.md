# QuickPitik upload workflow in BatchMyPhotos design

Date: 2026-10-10
Status: written spec, awaiting Theo's review (design approved in chat on 2026-10-10)
Scope: BatchMyPhotos Electron desktop app (primary); QuickPitik Spring Boot backend (two auth endpoints, one migration); QuickPitik Next.js website (one page). Brainstorm record: vault `_journal/2026-10-10-desktop-quickpitik-upload-workflow-validation.md`.

## Goal and non-goals

Goal. A photographer drops one whole shoot folder (for example a copy of the camera card: a main folder with several subfolders of up to 9,999 files each) into a new Upload view in BatchMyPhotos, picks a QuickPitik event, confirms once, and the app uploads every uploadable photo to that event, one subfolder at a time, with clear progress, safe retries and no duplicates. The photographer signs in to QuickPitik through their browser; the session is handed back to the app without any token ever appearing in a URL.

Non-goals for version one: moving or copying files on disk; any 500-per-batch rule (the website's 500 is a browser-tab memory guard; the backend has no batch size); Google sign-in inside the app; saving upload state across app restarts; HEIC conversion; uploading RAW or video; changes to the ai-api; a `desktop` client value on the upload endpoints.

## Facts this design rests on (verified in code on 2026-10-10)

- Backend upload is per photo: `POST /me/photographer/events/{eventId}/photos/direct` (begin), then a PUT to a presigned storage URL, then `POST …/photos/direct/commit`. Begin answers `mode: "direct" | "existing" | "multipart"`; `multipart` means `POST …/photos` with the file as multipart. Accepted types are `image/jpeg`, `image/png`, `image/webp`, at most 25 MiB (`storage.direct-upload.max-bytes`). The mobile app omits the `client` field and receives `direct`; the desktop does the same (`PhotoUploadService.kt`).
- Duplicate identity is the SHA-256 of the original bytes per photographer: same event returns the existing photo (a no-op); another event answers 409 `PHOTO_DUPLICATE_DIFFERENT_EVENT`. The pre-flight `POST …/photos/exists` takes up to 500 hashes and answers `new`, `same_event` or `different_event` per hash.
- Event existence, upload window, ownership, photographer approval and watermark gates run server-side on every upload (`PhotoUploadService.gate`, `PhotographerAccessGuard`). The client never decides authorization.
- Rate limits: `photographer-upload` is 600 calls per minute per photographer (begin and commit each count); pending direct uploads are capped per user (32 slots and 800 MiB in the default config; production values may differ).
- Tokens: access 15 minutes, refresh 7 days, rotated on every refresh with revoke-on-reuse; `POST /auth/refresh { refreshToken }` in the body. Responses use the envelope `{ success: true, data }` or `{ success: false, errors: [{ code, message }] }`, with a `Retry-After` header on 429 and 503.
- BatchMyPhotos today reads only the top level of a folder (`scan-folder`), and its own sign-in is a separate Supabase account. Maintenance-mode rules apply: frozen services untouched, owner approval for new IPC, no new dependencies, default-off flags, no version bump.

## User flow

1. Open BatchMyPhotos and sign in as usual. When the QuickPitik upload flag is on, the header shows a Sort | Upload switch. Sort is unchanged.
2. Upload, first time: "Connect your QuickPitik photographer account". Connect opens the browser at quickpitik.com. Sign in there if needed, then press Connect BatchMyPhotos on the confirmation page. The browser bounces back to the app, which now shows "Connected as <email>".
3. Pick an event from the list: public events currently accepting uploads, plus the photographer's own events.
4. Drop a folder or click Choose folder. The app walks it and shows one row per subfolder: uploadable photos, skipped files by reason. Every row is ticked except a folder whose name ends in `_Blurry`.
5. Press "Upload 9,412 photos to Cebu Marathon 2026". Progress shows per subfolder and overall. Cancel is available.
6. Done: uploaded, already there, skipped, failed, with Retry failed and Upload another folder.

## Desktop app

### Feature flag and config (`desktop/src/main/config.js` and `constants.js`)

| Key | Packaged default | Development (`app.isPackaged === false`) |
|---|---|---|
| `features.QUICKPITIK_UPLOAD_ENABLED` | `false` until the release that ships the feature flips it | `envBool('BATCH_QUICKPITIK_UPLOAD_ENABLED', false)` |
| `urls.QUICKPITIK_API_URL` | `https://api.quickpitik.com/api/v1` | `BATCH_QUICKPITIK_API_URL` or `http://localhost:8080/api/v1` |
| `urls.QUICKPITIK_WEB_URL` | `https://quickpitik.com` | `BATCH_QUICKPITIK_WEB_URL` or `http://localhost:3000` |
| `urls.QUICKPITIK_UPLOAD_ORIGIN` | the production storage upload origin: the website's `NEXT_PUBLIC_R2_UPLOAD_ORIGIN` on Vercel production, read per monorepo `docs/testing-cloud-services.md` section 2 at implementation time, never guessed | `BATCH_QUICKPITIK_UPLOAD_ORIGIN` or empty |

Constants, not env-overridable: `QP_UPLOAD_CONCURRENCY = 4`, `QP_HASH_CONCURRENCY = 4`, `QP_EXISTS_CHUNK = 500`, `QP_MAX_FILE_BYTES = 26214400`, `QP_WALK_MAX_DEPTH = 6`, `QP_API_TIMEOUT_MS = 30000`, `QP_COMMIT_TIMEOUT_MS = 120000`, `QP_PUT_STALL_MS = 120000`, `QP_PUT_DEADLINE_MS = 900000`, `QP_COMMIT_BUSY_WINDOW_MS = 600000`, `QP_MAX_RETRIES_PER_PHASE = 3`, `QP_CONNECT_PENDING_TTL_MS = 600000`, `QP_PROGRESS_INTERVAL_MS = 250`.

No new npm dependency. Node `crypto`, `fs` and `https` plus Electron `net` cover everything.

### Renderer

- `App.jsx` gains a `view` state, `'sort' | 'upload'`, default `'sort'`. The header shows a two-option segmented control only when the new `getQuickPitikUploadEnabled()` call resolves true (same pattern as `get-blur-detection-enabled`). Switching is disabled while Sort is executing or Upload is uploading. Sort's code paths do not change; the Upload view mounts in place of Sort's main content.
- New `src/hooks/useQuickPitikUpload.js` owns the Upload state machine and every `window.electronAPI.qp*` call. States: `disconnected`, `connecting`, `ready`, `scanning`, `reviewing`, `uploading`, `done`, `error`. It holds `session { email, name }`, `events`, `scan`, `selection`, `progress` and `result`.
- New `src/components/Upload/`: `UploadView.jsx` (switchboard on state), `ConnectCard.jsx`, `EventPicker.jsx` (reuses `CustomSelect`), `FolderDrop.jsx` (reuses the DropZone drop handling plus `registerDroppedFolder` and `selectFolder`), `ReviewTable.jsx`, `UploadProgress.jsx`, `UploadSummary.jsx`, and `Upload.css`. Finish Line tokens from `variables.css` only; no new fonts or colours. Follow the vault `Agent Skills/Frontend Design.md` and the renderer conventions (hooks, no Redux, `STRINGS`).
- The renderer never receives tokens. It receives `{ connected, email, name }` only.

### Main process: `src/main/quickpitikAuthService.js`

- `startConnect()`: `state = base64url(randomBytes(32))`, `verifier = base64url(randomBytes(32))`, `challenge = base64url(sha256(verifier))`. Keep `{ state, verifier, createdAt }` in a module variable; one pending request at a time, a new start replaces the old one. Open `${QUICKPITIK_WEB_URL}/connect/desktop?state=${state}&challenge=${challenge}` with `shell.openExternal`. Return `{ success: true }`.
- `completeConnect(code, state)`, called by the deep-link branch. Refuse, log, and send `qp-connect-result { success: false, error }` when there is no pending request, the pending request is older than `QP_CONNECT_PENDING_TTL_MS`, `state !== pending.state`, or `code` or `state` fail `^[A-Za-z0-9_-]{43}$`. Otherwise `POST ${QUICKPITIK_API_URL}/auth/desktop/exchange { code, codeVerifier }` with no bearer and `QP_API_TIMEOUT_MS`. On success save the session, clear the pending request, send `qp-connect-result { success: true, email, name }`, restore and focus the window. On failure send `{ success: false, error }` using the server message when present and "This connect link has expired. Try again from BatchMyPhotos." for a 401.
- Session store: `new SecureStore({ name: 'quickpitik-session' })` with keys `access_token`, `refresh_token`, `user_profile` (`{ id, email, name, role }`). Never the existing `auth-session` blob.
- `getStatus()` returns `{ connected, email, name }`.
- `refreshAccessToken()` is single-flight through a module `_refreshPromise`, the same shape as `authService.js`. It calls `POST /auth/refresh { refreshToken }`; on success it writes both new tokens to the store before resolving; on 401 or `INVALID_REFRESH_TOKEN` it clears the store and resolves `{ refreshed: false, authRejected: true }`; on a network error it resolves `{ refreshed: false, networkError: true }`.
- `authorizedFetch(path, init)` adds the bearer header and `QP_API_TIMEOUT_MS` unless `init.timeoutMs` is given; on 401 it calls `refreshAccessToken()` once and retries once; it throws `QpAuthError` when the refresh is rejected. It parses the envelope into `{ data }` or throws `QpApiError { status, code, message, retryAfterSeconds }`.
- `disconnect()` makes a best-effort `POST /auth/logout { refreshToken }`, then clears the store.

### Main process: `src/main/quickpitikUploadService.js`

- `listEvents()`: `GET /events?limit=200` (public catalog, no bearer) filtered to events whose date satisfies `date <= today <= date + 3 days` in Asia/Manila, the same rule as `canUploadToEvent` in `website/src/lib/event-catalog.ts`; plus `GET /me/photographer/events?limit=200` through `authorizedFetch` (covered and owned events), keeping owned events while `today <= date + 1 month`. Return `[{ id, name, date, location, ownedByMe, state }]` deduplicated by id, owned events first. The server still decides per upload.
- `scanFolder(rootPath)`: `isPathAllowedAsync(rootPath)` first, else `{ success: false, error }`. An iterative walk with `fs.promises.readdir(…, { withFileTypes: true })` to depth `QP_WALK_MAX_DEPTH`, skipping names that start with `.` and the ignored-file names `batchEngine` uses, never following symbolic links. Each regular file is classified by its lower-cased extension: uploadable `jpg jpeg png webp`; skipped `raw` (the RAW extensions in `batchEngine`), `video` (its video extensions), `heic` (`heic heif`), `oversize` (an uploadable type whose `stat` size exceeds `QP_MAX_FILE_BYTES`), `other`. Output: `{ success, root, folders: [{ relPath, name, uploadable: { count, bytes }, skipped: { raw, video, heic, oversize, other }, defaultSelected }], totals }`, where `defaultSelected` is false for a folder whose name ends with `_Blurry`. File lists are not kept and do not cross IPC; `stat` runs with `STAT_CONCURRENCY`.
- `startUpload({ rootPath, eventId, folders })`: one upload at a time per process, refused while one is running. For each selected `relPath` in order: list that folder's uploadable files again; hash them (streaming SHA-256 hex, lower case, pool `QP_HASH_CONCURRENCY`); pre-flight `POST …/photos/exists` in chunks of `QP_EXISTS_CHUNK` (if the pre-flight still fails after retries, treat every file as `new`; the server dedups anyway); upload the `new` files through a pool of `QP_UPLOAD_CONCURRENCY` `uploadOne` calls; count `same_event` as `alreadyThere` and `different_event` as terminal `failed`. Then the next folder. Progress events are throttled to `QP_PROGRESS_INTERVAL_MS`.
- `uploadOne(file)` mirrors `uploadPhotographerPhoto` in `website/src/lib/api-photographer.ts` without the persisted checkpoint:
  1. `requestId = randomUUID()`.
  2. Begin: `POST …/photos/direct { contentHash, contentType, sizeBytes, originalFilename, requestId }` with no `client`. `existing` ends the file as `alreadyThere`; `multipart` goes to step 5; `direct` checks `new URL(uploadUrl).protocol === 'https:'` and `new URL(uploadUrl).origin === QUICKPITIK_UPLOAD_ORIGIN` (terminal `UPLOAD_LINK_REJECTED` otherwise), then step 3.
  3. Transfer: Node `https.request(uploadUrl, { method: 'PUT', headers: { ...uploadHeaders, 'Content-Length': sizeBytes } })` with `fs.createReadStream(filePath)` piped in; byte progress from the read stream; stall timeout `QP_PUT_STALL_MS`; absolute deadline `min(expiresAt, now + QP_PUT_DEADLINE_MS)`. Node `https` is used rather than `net.fetch` because streaming request bodies are not guaranteed in Electron 28 and the stream gives byte progress for free.
  4. Commit: `POST …/photos/direct/commit { photoId, key, contentHash, sizeBytes, contentType }` with `QP_COMMIT_TIMEOUT_MS`.
  5. Multipart: `net.fetch` `POST …/photos` with a `FormData` whose `file` is a `Blob` of the file bytes (bounded by 25 MiB times four in flight), `QP_COMMIT_TIMEOUT_MS`.
  Retry rules are in "Upload protocol rules".
- `cancelUpload()`: a cooperative flag checked before each file and each phase; in-flight PUT requests are destroyed; the folder loop stops; the final summary reports what finished.

### Deep-link branch (`desktop/main.js`, inside `handleDeepLink`)

Before the existing guard `if (parsed.hostname !== 'auth' || parsed.pathname !== '/callback')`, add:

```js
if (parsed.hostname === 'quickpitik' && parsed.pathname === '/callback') {
  await quickpitikAuthService.completeConnect(parsed.searchParams.get('code'), parsed.searchParams.get('state'));
  return;
}
```

The Supabase branch and its `verifySession(token, { allowRefresh: false })` protection stay exactly as they are. Nothing else in `main.js` changes. The existing `second-instance` and cold-start wiring already deliver any `batchmyphotos://` URL to `handleDeepLink`.

### IPC surface (approved by the owner on 2026-10-10 as part of the design)

Every channel is registered through the existing `handle()` wrapper in `ipcHandlers.js` (rate-limited) and exposed in `preload.js`.

| `electronAPI` method | Channel | Payload and result |
|---|---|---|
| `getQuickPitikUploadEnabled()` | `get-quickpitik-upload-enabled` | returns the flag, same pattern as `get-blur-detection-enabled` |
| `qpConnectStart()` | `qp-connect-start` | returns `{ success }` |
| `qpSessionStatus()` | `qp-session-status` | returns `{ connected, email, name }` |
| `qpDisconnect()` | `qp-disconnect` | returns `{ success }` |
| `qpListEvents()` | `qp-list-events` | returns `{ success, events }` or `{ success: false, error, authRejected }` |
| `qpScanFolder(path)` | `qp-scan-folder` | path validated by `securityManager`; returns the scan summary |
| `qpUploadStart({ rootPath, eventId, folders })` | `qp-upload-start` | returns `{ success }` at once; results arrive as progress events |
| `qpUploadCancel()` | `qp-upload-cancel` | returns `{ success }` |
| `onQpConnectResult(cb)` | event `qp-connect-result` | `{ success, email?, name?, error? }` |
| `onQpUploadProgress(cb)` | event `qp-upload-progress` | see below |

Progress event shape: `{ phase: 'hashing' | 'checking' | 'uploading' | 'waiting' | 'folder-done' | 'done' | 'cancelled' | 'error', folder: { relPath, index, count }, file?: { name, percent }, counts: { uploaded, alreadyThere, skipped, failed, total }, bytes: { sent, total }, failures?: [{ relPath, name, code, message, retryable }], error?: { code, message } }`.

### Memory and responsiveness

Only names and sizes are held for the folder being uploaded; files are hashed and sent as streams; at most four files are in flight; the multipart fallback buffers at most four files of 25 MiB; the walk is iterative and yields between directories; progress is throttled; the renderer holds the summary, never file lists.

## Sign-in hand-off

1. App to browser: `GET {QUICKPITIK_WEB_URL}/connect/desktop?state=S&challenge=C`.
2. Website: `<ProtectedRoute>` sends a signed-out user to `/login?redirect=/connect/desktop?state=S&challenge=C` (preserved by `buildLoginRedirect`; `isSafeRedirect` accepts a same-origin path) and back after login. The page validates `S` and `C` against `^[A-Za-z0-9_-]{43}$`. An account that is not a photographer sees "Connecting needs a photographer account" with a sign-out link.
3. Connect: the website calls `POST /api/v1/auth/desktop/codes { codeChallenge: C }` and receives `{ code, expiresInSeconds }`.
4. The website runs `window.location.assign('batchmyphotos://quickpitik/callback?code=' + encodeURIComponent(code) + '&state=' + encodeURIComponent(S))` and shows "Back to BatchMyPhotos" with Try again (mints a fresh code) and a hint for when the app did not open.
5. App: `completeConnect(code, S)` calls `POST /api/v1/auth/desktop/exchange { code, codeVerifier: V }` and receives the normal `{ accessToken, refreshToken, user }`, stored in `quickpitik-session`.

Properties: tokens never travel in a URL; a forged callback fails the `state` check; another program registered for `batchmyphotos://` cannot redeem a code without the verifier held in the app's memory; codes are hashed at rest, single-use and live two minutes; the exchange endpoint shares the login rate limit.

## Backend (monorepo `backend/`)

Migration `V85__desktop_auth_codes.sql`:

```sql
CREATE TABLE desktop_auth_codes (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    code_hash      VARCHAR(255) NOT NULL UNIQUE,
    code_challenge VARCHAR(255) NOT NULL,
    expires_at     TIMESTAMPTZ  NOT NULL,
    used_at        TIMESTAMPTZ,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_desktop_auth_codes_user_id ON desktop_auth_codes (user_id);
```

- `entity/DesktopAuthCode.kt` mirrors `PasswordResetToken` and has `isUsable(now)`. `repository/DesktopAuthCodeRepository.kt` has `findByCodeHash` and a `@Modifying` `markUsed(id, now)` that updates only `WHERE used_at IS NULL` and returns the row count, so a racing redeem succeeds once.
- `service/auth/DesktopAuthService.kt`:
  - `mint(userId, codeChallenge)`: the challenge must match `^[A-Za-z0-9_-]{43}$` (400 `VALIDATION_ERROR`); the user must exist and not be suspended (401 `ACCOUNT_SUSPENDED`, as login does); `code = OpaqueTokens.generate()`; store `OpaqueTokens.hash(code)`, the challenge and `expiresAt = now + 2 minutes`; return `DesktopCodeResponse(code, expiresInSeconds = 120)`.
  - `exchange(code, codeVerifier)`: the verifier must match `^[A-Za-z0-9_-]{43,128}$`; the row found by `hash(code)` must exist and be usable; `base64url(sha256(verifier))` must equal the stored challenge; `markUsed` must return 1. Any of those failing answers 401 `INVALID_TOKEN` "This connect code is invalid or has expired." with one message for every cause. The user must exist, not be suspended and have the role `PHOTOGRAPHER`. Return `authService.buildAuthResponse(user)`. `@Transactional`.
- `AuthController`: `POST /desktop/codes` with `@PreAuthorize("hasRole('PHOTOGRAPHER')")` and `Cache-Control: no-store`; `POST /desktop/exchange` public, `rateLimiter.acquireOrThrow(POLICY_AUTH_LOGIN, clientIp(request))` and `Cache-Control: no-store`. DTOs `DesktopCodeRequest(codeChallenge)`, `DesktopCodeResponse(code, expiresInSeconds)` and `DesktopExchangeRequest(code, codeVerifier)` in `dto/auth/`.
- `SecurityConfig.kt`: add `/api/v1/auth/desktop/exchange` to the `permitAll` list. The `backend-origin-protection` lane also edits this file; coordinate on the board before touching it.
- No purge job for `desktop_auth_codes` in version one: rows are tiny and connects are rare. Mark it with a `ponytail:` comment naming the cleanup as the upgrade path.
- Documentation in the same commit: a new monorepo `docs/desktop-upload-integration-guide.md` (hand-off sequence, both endpoints with request and response shapes, the deep-link URL shape, and pointers to the upload contract in `PhotoUploadService.kt` and the website client), plus rows in the vault `backend/api-surface.md`.

## Website (monorepo `website/`)

- `ROUTES.CONNECT_DESKTOP = "/connect/desktop"` in `lib/constants.ts`.
- `app/connect/desktop/page.tsx`: a server wrapper with `metadata` (`title`, `robots: { index: false }`) rendering the client component.
- `components/auth/connect-desktop.tsx` inside `<ProtectedRoute>` and the `AuthShell` layout. It reads `state` and `challenge` from `useSearchParams`; invalid values show "This connect link is not valid. Start again from BatchMyPhotos." It reads the signed-in user from the same store `ProtectedRoute` uses; a role other than `PHOTOGRAPHER` shows the message and a sign-out link. Otherwise: kicker "BatchMyPhotos", heading "Connect BatchMyPhotos to this account?", the account email, a `BTN_PRIMARY` Connect button and a `BTN_GHOST` Not now link to `/dashboard`. Connect calls `mintDesktopAuthCode(challenge)` and assigns the deep link, then shows the "Back to BatchMyPhotos" state with Try again and the hint. API errors show inline; `RATE_LIMITED` reads "Too many attempts. Wait a minute and try again."
- `lib/api-account.ts`: `mintDesktopAuthCode(codeChallenge): Promise<{ code: string; expiresInSeconds: number }>` calling `api.post('/auth/desktop/codes', { codeChallenge })`.
- Styling follows the vault `website/notes/design-system.md` (Archivo, bone, ink, one fresh element, `text-surface` on green fills). Browser pass at 375, md and lg.

## Upload protocol rules for the desktop client

| Situation | Class | Action |
|---|---|---|
| Network error, 5xx, `UPLOAD_STORAGE_UNAVAILABLE`, 429 or 503 with `Retry-After` | retryable | wait `1000 × 2^attempt × jitter(0.8 to 1.2)` ms, at least `Retry-After`; at most `QP_MAX_RETRIES_PER_PHASE` per phase (begin, transfer, commit) |
| PUT failed or its reply was lost | retryable | try commit first; `UPLOAD_OBJECT_MISSING` with an unexpired grant means PUT again; an expired grant means a new `requestId` and begin again |
| Commit answers `UPLOAD_IN_PROGRESS` or 429 | wait | retry with capped backoff (15 s max) inside `QP_COMMIT_BUSY_WINDOW_MS`; not counted as a failure |
| 401 | session | one shared refresh, retry once; a rejected refresh pauses the upload with `error { code: 'SESSION_EXPIRED' }` and the renderer offers Reconnect |
| `UNSUPPORTED_MEDIA_TYPE`, `PAYLOAD_TOO_LARGE`, `UPLOAD_CHECKSUM_MISMATCH`, `UPLOAD_KEY_MISMATCH`, `UPLOAD_REQUEST_CONFLICT`, `PHOTO_DUPLICATE_DIFFERENT_EVENT`, `UPLOAD_LINK_REJECTED` | terminal per file | record in `failures`, continue with the next file |
| `EVENT_NOT_UPLOADABLE`, `EVENT_NOT_FOUND`, `PHOTOGRAPHER_NOT_VERIFIED`, `ACCOUNT_SUSPENDED`, `WATERMARK_MISSING` | terminal per upload | stop everything; `error` carries the server message; the renderer shows it with a "Fix this on quickpitik.com" link |
| Offline (`net.isOnline()` false, `ENOTFOUND`, `ECONNREFUSED`) | pause | phase `waiting` with "Waiting for connection"; retry every 10 s; resumes by itself |

## Failures and copy

- Review screen: "412 photos ready. 88 RAW files and 2 videos skipped." Oversize: "3 JPEGs over 25 MB skipped."
- Session expired mid-upload: "Your QuickPitik sign-in expired. Reconnect to continue. Finished photos are kept; dropping the folder again skips them."
- Event closed: the server message, for example "Upload window for this event has closed."
- Done: "9,391 uploaded. 18 already there. 90 skipped. 3 failed."
- The Upload view never moves, copies, renames or deletes anything on disk.

## Testing

Desktop, `desktop/tests/` with vitest and the `Module._load` electron stub used by `authService.test.js`:

- `quickpitikUploadService.test.js`: the walk on a temp tree (nested folders, a hidden folder, a `_Blurry` folder unticked, RAW, video, HEIC, oversize and other files counted, the depth cap, a symbolic link skipped); hashing equals a known SHA-256; pre-flight mapping; `uploadOne` sequencing for `direct`, `existing` and `multipart` against mocked `net.fetch` and `https`; the retry and busy-wait rules; a terminal-per-upload error stops the loop; cancel between files; an upload URL on the wrong origin is rejected.
- `quickpitikAuthService.test.js`: PKCE pair shape; `completeConnect` refuses a missing, expired or mismatched state and a malformed code, and stores tokens on success; `refreshAccessToken` is single-flight, writes both tokens before resolving and clears the store on rejection; `authorizedFetch` retries once after a refresh.
- `quickpitikUploadUI.test.js`: review-table counts and default ticks, the confirm button label, and state transitions on progress events, in the style of `blurFeedbackUI.test.js`.
- `npm test` green and `npm run lint` with zero errors before any commit.

Backend, `./gradlew test`:

- `DesktopAuthServiceTest`: mint stores a hash and not the code; exchange happy path; expired; already used; wrong verifier; malformed inputs; suspended user; a runner account refused; two concurrent redeems succeed once.
- A security test in the style of `SecurityConfigGuestOrderTest`: `/auth/desktop/exchange` is reachable without a token; `/auth/desktop/codes` needs a photographer.

Website, vitest:

- `connect-desktop.test.tsx`: the invalid-params view; the non-photographer view; Connect calls `mintDesktopAuthCode` and assigns the deep link with both values URL-encoded; Try again mints again; an API error is shown.
- Browser pass at 375, 768 and 1024 on `/connect/desktop` signed out, signed in as a runner, and signed in as a photographer.

End to end:

1. Local: backend with `AI_API_ENABLED=false` and local storage (begin answers `multipart`), website on `localhost:3000`, desktop `npm start` with `BATCH_QUICKPITIK_UPLOAD_ENABLED=true`, `BATCH_QUICKPITIK_API_URL` and `BATCH_QUICKPITIK_WEB_URL`. Connect, pick an event, drop a two-subfolder test tree with JPG and RAW pairs and one oversize JPEG, upload, drop it again and see everything skipped as already there, cancel mid-way, disconnect.
2. Staging, after reading `docs/testing-cloud-services.md` in full: Railway staging backend, Vercel preview website, the R2 dev bucket (begin answers `direct`), `BATCH_QUICKPITIK_UPLOAD_ORIGIN` set to the staging upload origin. Same script; also cut the network mid-upload and watch it pause and resume; let a session run past 15 minutes to see the refresh.

## Rollout, documentation and vault

Order of work: backend (a push to `dev-main` that changes `backend/**` deploys staging and runs V85; the hand-off must say so), then the website page (Vercel preview), then the desktop behind the default-off flag. A desktop release that turns the flag on is a separate, owner-approved step; no `version` bump as part of this work.

Documentation in the same commits: `docs/desktop-upload-integration-guide.md` (new, canonical contract), `docs/project-vision.md` (Journey 2 step 6, the feature-matrix row "Manual photo upload", the desktop scope sentence), `desktop/AGENTS.md` (the desktop now also calls the Spring Boot backend as a signed-in photographer), and BatchMyPhotos `desktop/docs/ARCHITECTURE.md` where it lists services.

Vault: an ADR in `_project/decisions.md` for the boundary change and the hand-off design, and one in `desktop/decisions.md`; `backend/api-surface.md`; `desktop/notes/ipc-surface.md` and `desktop/notes/config-and-flags.md` for the new channels and flags; `_project/architecture/module-boundaries.md` for the desktop-to-backend arrow; tasks in `desktop/tasks.md`, `backend/tasks.md` and `website/tasks.md`; the `ACTIVE.md` block `desktop-quickpitik-upload` kept current.

## Follow-ups, not in version one

Google sign-in inside the app; a type-the-code fallback on the connect page using the same endpoints; saving upload state across restarts; an "Upload the folder I just sorted" shortcut on Sort's Done card; a `desktop` client value for upload metrics; HEIC conversion through `sharp`; a purge job for `desktop_auth_codes`.

## Decisions log from the brainstorm on 2026-10-10

1. The input is one whole shoot folder with subfolders, not pre-sorted batches.
2. Upload only; no disk changes; no 500 rule.
3. Browser sign-in hand-off instead of an in-app password form.
4. One-time code with PKCE exchange (A) over tokens in the URL (B, rejected: a shared refresh token logs one side out) and type-a-code (C, a follow-up).
5. Defaults accepted: a subfolder checklist with `_Blurry` unticked; skip and count files QuickPitik cannot take; no persistence across restarts; one subfolder at a time with four files in flight.
6. Design sections 1 to 5 approved as presented in chat.
