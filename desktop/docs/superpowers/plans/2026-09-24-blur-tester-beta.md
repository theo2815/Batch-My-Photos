# Blur Tester Beta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give invited BatchMyPhotos desktop testers advisory blur suggestions from the isolated staging API and an explicit way to submit selected, labeled examples.

**Architecture:** Keep inference in the Electron main process and reuse its existing blur stream and preview. A beta-only package config enables the feature for direct-installer testers; a private Supabase bucket and RLS-protected table hold only examples testers choose to submit. The public desktop build, automatic batch placement, and QuickPitik web/mobile paths remain unchanged.

**Tech Stack:** Electron 28, React 18, Sharp, Vitest, electron-builder 26, Supabase Postgres/Storage, Railway-hosted ai-api.

**Spec:** `../specs/2026-09-24-blur-tester-beta-design.md`

## Global Constraints

- First wave: invited direct-installer users only; Railway blur **staging** at **2 CPU / 2 GB**. Keep the existing `batchmyphotos://` sign-in identity; do not send Store installs this installer.
- Keep `BATCH_BLUR_DETECTION_ENABLED=false` and `BATCH_BLUR_AI_ENABLED=false` as normal defaults. Do not bump the public `package.json` version or publish a GitHub Release or Store package in implementation tasks.
- Beta results are advisory: no model-derived `blurryGroups` or `excludeGroups` may reach batch preview or execution. Normal batching works if AI analysis or feedback submission fails.
- The beta package has no embedded API key. Each tester gets a revocable staging key scoped only to `blur:read` and `jobs:read`; store it with existing `SecureStore` and never echo it back to the renderer or logs.
- Only a separate **Submit this example** click uploads a chosen resized JPEG and binary human label. Do not send paths, EXIF, original files, or background samples. Delete submitted examples within 30 days or sooner on request.
- Existing auth, settings, batch, rollback, and subscription disk formats stay compatible. No new runtime dependency; no production ai-api change; Task 12's independent quality gate remains open.

## Review Focus

1. A stream with all image rows but no valid `complete=true` summary must fail or retry as uncommitted work, never show success (Task 1 transport test).
2. A 503, upload `ReadError`, or timeout during a chunk must use one bounded retry without double-counted progress or a per-image request storm (Task 1 transport test).
3. A renderer-supplied path, symlink, RAW companion, or stale folder must not cause feedback upload (Task 5 path tests).
4. A second signed-in tester must not read, overwrite, or delete the first tester’s feedback row or private image (Task 4 RLS and Task 7 Storage HTTP checks).
5. A beta installer must neither fetch a public update nor lose the tester’s existing sign-in/batch history during install and rollback (Tasks 3 and 7 package checks).

## File map

| File | Responsibility |
|---|---|
| `desktop/src/main/blurDetectionService.js`, `desktop/src/main/constants.js` | Stream completion, bounded retry, beta request limits, cached prediction lookup. |
| `desktop/src/App.jsx`, `desktop/src/hooks/useBlurDetection.js`, `desktop/src/components/PreviewPanel/BatchPreview.jsx`, `desktop/src/components/Modals/ImagePreviewModal.jsx` | Advisory-only preview, manual analysis, selected photo labeling and consent. |
| `desktop/src/main/config.js`, `desktop/src/main/blurBetaKeyStore.js`, `desktop/src/main/updateManager.js`, `desktop/src/main/ipcHandlers.js`, `desktop/preload.js` | Beta package config, encrypted key setup, updater isolation, two narrow IPC operations. |
| `desktop/scripts/write-blur-beta-config.cjs`, `desktop/electron-builder.blur-beta.cjs`, `desktop/package.json`, `.gitignore` | Nonsecret beta manifest and private NSIS artifact; no public version edit. |
| `supabase/migrations/20260924000000_blur_beta_feedback.sql`, `supabase/tests/blur_beta_feedback.test.sql` | Private bucket, feedback table, RLS and ownership tests. |
| `desktop/src/main/blurFeedbackService.js`, `desktop/tests/blurFeedbackService.test.js` | File validation, resized upload, metadata insert, cleanup and auth retry. |
| `desktop/tests/blurStream.test.js`, `desktop/tests/blurAdvisory.test.js`, `desktop/tests/blurBetaConfig.test.js` | Actual client and beta safety checks; do not extend mirror-only parser tests. |
| `desktop/docs/blur-detection.md`, `desktop/docs/superpowers/plans/2026-09-24-blur-tester-beta.md` | Correct client configuration docs and release checklist/results. |

---

### Task 1: Make the real blur stream fail closed

**Files:** Modify `desktop/src/main/blurDetectionService.js`, `desktop/src/main/constants.js`; create `desktop/tests/blurStream.test.js`.

**Interfaces:** Preserve `analyzeBlur(fileGroups, folderPath, threshold, categories, onProgress): Promise<blurMap>`. Later tasks use `getCachedBlurResult(folderPath, fileName): blurResult | null`, exported here; it returns only the result for the exact image sent to ai-api.

- [ ] **Step 1: Write failing real-client tests.** Stub Electron `net.fetch` through the same `Module._load` pattern as `supabaseApi.test.js`; create one small JPEG with Sharp in a temp directory. Drive `analyzeBlur()` itself, not a reimplementation. Include cases for missing, `complete:false`, duplicate and mismatched summaries; a valid summary; 503 and rejected upload with one retry; retry exhaustion. Assert one progress tick per final image and zero per invalid attempt. Define `ndjsonResponse()` as a mock `Response` whose body emits one JSON object per line.

```js
const SHARP = { predicted_class: 'sharp', confidence: 0.9,
  probabilities: { sharp: 0.9, motion_blurred: 0.1 } };
it.each([[], [{ _summary: true, total: 1, successful: 1, errors: 0, complete: false }]])(
  'rejects an uncommitted stream: %j', async (tail) => {
    fetchMock.mockResolvedValue(ndjsonResponse([{ index: 0, filename: '0', ...SHARP }, ...tail]));
    await expect(blur.analyzeBlur({ IMG: ['IMG.jpg'] }, folder, 'moderate'))
      .rejects.toThrow(/AI service.*incomplete/i);
  },
);
```

- [ ] **Step 2: Confirm red.** Run `npm test -- --run tests/blurStream.test.js` from `desktop/`; current code accepts a row-only stream, so the missing-summary case fails.
- [ ] **Step 3: Implement the smallest transport fix.** Buffer rows by index until exactly one summary with `complete === true`, `total === chunk.length`, and `successful + errors === total` arrives. Commit rows and progress only then; retry an uncommitted chunk at most once after 503/429, network rejection, or deadline, with a 2-second delay. Do not retry 401/403 or malformed images. For a valid complete summary with missing row indices, recover only those indices via the existing single-image path. Use beta limits of 100 images, one in-flight stream, and a 210-second client deadline (staging request timeout is 180 seconds). Add `folderPath` to the in-memory blur cache and export `getCachedBlurResult()` that returns only an analyzed image result when both folder and filename match; never return RAW companions or stale-folder results.

```js
if (summaryCount !== 1 || summary.complete !== true || summary.total !== chunk.length ||
    summary.successful + summary.errors !== chunk.length) {
  throw new Error('AI service incomplete stream');
}
for (const [index, row] of pendingRows) {
  const item = chunk[index];
  onOne(item.baseName, streamLineToResult(row, threshold, categoriesFilter, item.analyzableFile));
}
```

- [ ] **Step 4: Confirm green and regressions.** Run `npm test -- --run tests/blurStream.test.js tests/blurDetection.test.js`; also confirm a two-image real JPEG stream maps out-of-order indices correctly. Update the existing mirror test’s stale summary expectations only where they contradict the real contract.
- [ ] **Step 5: Commit.** Stage only these three files and commit with a plain-English subject/body describing why incomplete streams no longer look successful.

### Task 2: Keep every beta photo in ordinary batches

**Files:** Modify `desktop/src/App.jsx`, `desktop/src/main/config.js`, `desktop/src/main/ipcHandlers.js`, `desktop/src/components/PreviewPanel/BatchPreview.jsx`, `desktop/src/hooks/useBlurDetection.js`; create `desktop/tests/blurAdvisory.test.js`.

**Interfaces:** `blurResults` and `blurryGroups` still feed preview display. `previewBatches(..., excludeGroups)` and `executeBatch(..., blurryGroups)` receive `null` from the advisory UI; the main `execute-batch` handler ignores any renderer-supplied blur group when `config.features.BLUR_BETA_ENABLED` is true. This task adds that flag with a false default and a source-run `BATCH_BLUR_BETA_ENABLED` override; Task 3 connects it to the packaged manifest. Blur is disabled in public builds, so the enabled renderer flow is advisory/manual until a separate release changes it.

- [ ] **Step 1: Write a failing safety check.** Register the real `execute-batch` handler with a fake `ipcMain`, pass a fixture folder containing `IMG.jpg` and `blurryGroups: ['IMG']`, and assert `blurryFileCount === 0` and that no `_Blurry` output folder is produced when beta config is on. Add a manual preview check for the same folder because renderer DOM testing is not installed.

```js
const handlers = new Map();
const ipcMain = { handle: (name, fn) => handlers.set(name, fn) };
registerIpcHandlers(ipcMain, storeStub, () => windowStub, appStateStub);
const event = { sender: { send() {} } };
const result = await handlers.get('execute-batch')(event, {
  folderPath: fixtureFolder, maxFilesPerBatch: 10, outputPrefix: 'Beta',
  mode: 'copy', outputDir: fixtureOutput, blurryGroups: ['IMG'],
});
expect(result.blurryFileCount).toBe(0);
expect(existsSync(join(fixtureOutput, 'Beta_Blurry'))).toBe(false);
```

- [ ] **Step 2: Confirm red.** Run `npm test -- --run tests/blurAdvisory.test.js`; current handler separates the supplied group.
- [ ] **Step 3: Remove model routing.** Add `BLUR_BETA_ENABLED: envBool('BATCH_BLUR_BETA_ENABLED', false)` to `config.js`. Pass `null` for `excludeGroups` in `refreshPreview()` and `blurryGroups` in `onConfirmExecute()`. Gate `execute-batch` in main as a second safety check. Keep normal batching code intact. In `BatchPreview`, replace “Will be placed in …_Blurry” and “Restore” copy with advisory language, and show that no group moves automatically. In beta, do not auto-run analysis just because folder or sensitivity changed; require Start Analysis after the notice each time.

```js
const blurryGroupSet = new Set(config.features.BLUR_BETA_ENABLED
  ? [] : Array.isArray(blurryGroups) ? blurryGroups.slice(0, MAX_BLURRY_GROUPS) : []);
```

- [ ] **Step 4: Confirm green.** Run the new safety check and `npm test`; manually preview a sharp and flagged JPEG in both themes, confirm the same normal batch counts before and after analysis, then run copy-mode batching and inspect folders.
- [ ] **Step 5: Commit.** Stage only Task 2 files; describe advisory routing and batch safety.

### Task 3: Package a private beta without embedding its key

**Files:** Modify `desktop/src/main/config.js`, `desktop/src/main/updateManager.js`, `desktop/src/main/ipcHandlers.js`, `desktop/src/main/blurDetectionService.js`, `desktop/preload.js`, `desktop/package.json`, `.gitignore`; create `desktop/src/main/blurBetaKeyStore.js`, `desktop/scripts/write-blur-beta-config.cjs`, `desktop/electron-builder.blur-beta.cjs`, `desktop/tests/blurBetaConfig.test.js`.

**Interfaces:** `config.features.BLUR_BETA_ENABLED: boolean`, `config.features.BLUR_AI_URL: string`, `blurBetaKeyStore.get(): string`, `blurBetaKeyStore.set(key: string): void`, and one IPC method `blurBetaKey(key?: string): Promise<{ enabled: boolean, configured: boolean }>`; calling it without a key queries status and never returns the secret.

- [ ] **Step 1: Write failing config/key tests.** With a mocked packaged Electron app, assert absent or malformed `blur-beta.json` leaves blur disabled; a valid manifest enables the staging UI; `blurBetaKey()` never returns key bytes, rejects whitespace/oversized input, and persists via `SecureStore`. Assert `check-app-version` and `updateManager` make no public network call when `BLUR_BETA_ENABLED` is true.

```js
// Test A: packaged app, resources directory without blur-beta.json.
expect(config.features.BLUR_BETA_ENABLED).toBe(false);
// Test B: reload config with a valid blur-beta.json in a fresh module cache.
expect(configWithManifest.features.BLUR_BETA_ENABLED).toBe(true);
const keyHandler = handlers.get('blur-beta-key');
expect(await keyHandler({}, { key: 'sk_test_key_for_stub' }))
  .toEqual({ enabled: true, configured: true });
expect(await keyHandler({}, {})).toEqual({ enabled: true, configured: true });
expect(JSON.stringify(await keyHandler({}, {}))).not.toContain('sk_test_key_for_stub');
```

- [ ] **Step 2: Confirm red.** Run `npm test -- --run tests/blurBetaConfig.test.js`.
- [ ] **Step 3: Implement fail-closed config and key setup.** Read the nonsecret manifest from `process.resourcesPath` only for packaged builds, validate an HTTPS staging base URL, and keep current env behavior for source runs. In a packaged app, only a valid manifest may turn on `BLUR_BETA_ENABLED`, `BLUR_DETECTION_ENABLED`, and `BLUR_AI_ENABLED`; a public package or malformed manifest leaves all three off even if process environment variables are set. Add the narrow `blur-beta-key` IPC through `preload.js`; use a dedicated `SecureStore` name and have `blurDetectionService` read its key lazily. Disable GitHub auto-update, manual update handlers, and the separate `/api/version` banner in beta. Add a beta-only build script that requires `BATCH_BLUR_AI_URL` and `BATCH_BETA_VERSION`, writes an ignored manifest, and invokes electron-builder with a beta config that keeps the current app/protocol identity, targets NSIS only, sets beta-only package metadata, and uses `--publish never`. The build does not read `BATCH_BLUR_AI_API_KEY`.

```js
function readValidatedBetaManifest(file) {
  try {
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    const url = new URL(manifest.blurApiUrl);
    if (url.protocol !== 'https:' || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) return null;
    return manifest;
  } catch { return null; }
}
const manifestPath = path.join(process.resourcesPath, 'blur-beta.json');
const beta = app.isPackaged ? readValidatedBetaManifest(manifestPath) : null;
const getBlurKey = () => config.isDevelopment
  ? process.env.BATCH_BLUR_AI_API_KEY || '' : beta ? blurBetaKeyStore.get() : '';
```

- [ ] **Step 4: Confirm green and inspect artifact.** Run focused tests, `npm run lint`, `npm run build`, then build an unpacked beta with a test staging URL and beta version. Inspect `resources/blur-beta.json` for URL and absence of key; confirm `package.json` and public build config did not change version or publish destination. Leave installer creation and tester delivery for the release task.
- [ ] **Step 5: Commit.** Stage specific Task 3 files; never stage generated manifest, installer, or key.

### Task 4: Add private feedback storage with ownership enforced in Supabase

**Files:** Create `supabase/migrations/20260924000000_blur_beta_feedback.sql`, `supabase/tests/blur_beta_feedback.test.sql`.

**Interfaces:** `public.blur_beta_feedback(id, user_id, object_name, predicted_class, score, human_label, beta_version, source_environment, created_at)`; private Storage bucket `blur-beta-feedback`. A signed-in user can insert/select/delete only own records and objects; `is_admin()` grants review reads. The desktop writes via existing Supabase REST/Storage APIs.

- [ ] **Step 1: Write failing pgTAP checks.** Assert the table/bucket exist, RLS is on, an authenticated user sees only own rows, a second user cannot read/delete them, and invalid labels/score/environment are rejected. Use two temporary `auth.users` rows and set `request.jwt.claim.sub` under `authenticated`; keep tests transactional.

```sql
BEGIN;
SELECT plan(6);
SELECT has_table('public', 'blur_beta_feedback');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.blur_beta_feedback'::regclass), 'RLS enabled');
SELECT is((SELECT public FROM storage.buckets WHERE id = 'blur-beta-feedback'), false, 'private bucket');
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password)
VALUES ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'beta-a@example.test', 'test'),
       ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'beta-b@example.test', 'test');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
INSERT INTO public.blur_beta_feedback (object_name, predicted_class, score, human_label, beta_version, source_environment)
VALUES ('00000000-0000-0000-0000-000000000011/example.jpg', 'sharp', 0.1, 'blurry', 'beta.1', 'staging');
SELECT is((SELECT count(*) FROM public.blur_beta_feedback), 1::bigint, 'owner reads own row');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000022', true);
SELECT is((SELECT count(*) FROM public.blur_beta_feedback), 0::bigint, 'other user cannot read row');
DELETE FROM public.blur_beta_feedback;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
SELECT is((SELECT count(*) FROM public.blur_beta_feedback), 1::bigint, 'other user could not delete row');
SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Confirm red.** Run `npx supabase start`, then `npx supabase test db supabase/tests/blur_beta_feedback.test.sql`; the table/bucket checks fail before migration.
- [ ] **Step 3: Add the migration.** Create the table with `user_id DEFAULT auth.uid()`, unique `object_name`, check constraints, RLS policies for owner insert/select/delete and admin select. Both table inserts and Storage object inserts require the object name's first folder to equal `auth.uid()::text`. Create the private bucket with a 2 MB JPEG-only limit. Storage object policies also require the correct bucket and `owner_id = auth.uid()::text` for insert/select/delete; no update or public-read policy. Supabase [assigns `owner_id` from the JWT](https://supabase.com/docs/guides/storage/security/ownership); use its [Storage access policies](https://supabase.com/docs/guides/storage/security/access-control). Use Storage HTTP API for object deletion, never SQL deletes from `storage.objects`.

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('blur-beta-feedback', 'blur-beta-feedback', false, 2097152, ARRAY['image/jpeg']);
CREATE POLICY blur_beta_owner_read ON public.blur_beta_feedback
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
```

- [ ] **Step 4: Confirm green.** Run `npx supabase db reset --local` and the pgTAP file. Verify Storage API upload/read/delete with two local signed-in test users before applying any migration to the live BatchMyPhotos Supabase project.
- [ ] **Step 5: Commit.** Stage only migration and test; record that production migration is a later release action.

### Task 5: Submit one validated, already-analyzed image

**Files:** Create `desktop/src/main/blurFeedbackService.js`, `desktop/tests/blurFeedbackService.test.js`; modify `desktop/src/main/blurDetectionService.js`, `desktop/src/main/ipcHandlers.js`, `desktop/preload.js`.

**Interfaces:** `submitBlurExample({ folderPath, fileName, label }): Promise<{ success: boolean, error?: string }>` is the second and last new beta IPC method. It reads `getCachedBlurResult(folderPath, fileName)` from Task 1; prediction and score are never accepted from renderer input.

- [ ] **Step 1: Write failing service tests.** Use temp JPEG plus a fake Electron `net.fetch`. Test no request for `../secret.jpg`, a symlink outside the registered folder, a RAW companion, stale analysis, invalid label, or an image exceeding the 2 MB upload bound. Test that a successful submit makes exactly one Storage POST and one metadata POST, with no path/EXIF in the request; a metadata failure issues Storage DELETE; a 401 refreshes once and retries without creating a second object.

```js
await expect(submitBlurExample({ folderPath: folder, fileName: '../secret.jpg', label: 'sharp' }))
  .rejects.toThrow(/selected image/i);
expect(fetchMock).not.toHaveBeenCalled();
```

- [ ] **Step 2: Confirm red.** Run `npm test -- --run tests/blurFeedbackService.test.js`.
- [ ] **Step 3: Implement one-file submission.** In the main process, check beta flag, exact basename, `isPathAllowedAsync()` on the real file, and the cached analysis result for that same folder/image. Reuse the Sharp inference resize/re-encode path (export that helper rather than copy its logic), enforce output ≤2 MB, and generate a random object name. Use current Supabase JWT and anon key in main for Storage POST then PostgREST metadata POST; let Supabase set `user_id` from the verified JWT. On metadata failure, call Storage DELETE for that object. On 401, call existing `authService.refreshAccessToken()` and retry once. Send only `{ success, error }` through IPC, never tokens, paths, or key values.

```js
const result = blurDetectionService.getCachedBlurResult(folderPath, fileName);
if (!result || result.score < 0) throw new Error('Select an analyzed image');
const objectName = `${jwtSub}/${crypto.randomUUID()}.jpg`;
// Supabase RLS validates jwtSub and ownership; do not trust the parsed sub alone.
```

- [ ] **Step 4: Confirm green.** Run focused tests, `npm run lint`, and one local Supabase Storage + REST submission; confirm a failed insert leaves no object. Do not write to production Supabase yet.
- [ ] **Step 5: Commit.** Stage only Task 5 source and test files.

### Task 6: Add explicit labeling and consent to the existing preview

**Files:** Modify `desktop/src/components/Modals/ImagePreviewModal.jsx`, `desktop/src/components/PreviewPanel/BatchPreview.jsx`, `desktop/src/components/PreviewPanel/SettingsPanel.jsx`, `desktop/src/App.jsx`, `desktop/src/hooks/useBlurDetection.js`, and their existing CSS files only where needed.

**Interfaces:** `window.electronAPI.blurBetaKey(key?)` and `submitBlurExample({folderPath,fileName,label})` from Tasks 3 and 5. The UI keeps a local `Map<fileName, 'sharp'|'blurry'>` for the current analysis; it does not upload on selection.

- [ ] **Step 1: Record a failing manual interaction check.** With a dev beta config, select a folder, inspect a model-flagged photo and a model-sharp photo, choose a label for each, close/reopen the preview, and confirm zero feedback network calls until **Submit this example** is clicked. Record the failure and expected screens in the vault journal; this is a manual UI gate because this repo has no DOM test dependency.
- [ ] **Step 2: Confirm red.** Run `npm start` from `desktop/`; current UI cannot label a missed blur or submit a chosen example.
- [ ] **Step 3: Add minimal controls inside existing components.** Show a one-time key setup field only for the beta, a concise notice before Start Analysis that resized photos go to staging, and advisory wording in the preview. Map `blurResults[baseName].analyzedFile` to both suggested-blurry and normal-batch thumbnails so the existing image modal can label a model-sharp miss as well as a false blur flag. Offer Sharp/Blurry choices only for an analyzed image and a separate submit button. Show the exact selected photo, purpose, privacy/30-day deletion notice, submission progress, and retryable error. Clear labels on folder change/re-analysis. Match current Finish Line tokens and keyboard/focus behavior; do not add a new modal, dependency, or broad settings system.

```jsx
<button type="button" disabled={!label || submitting}
  onClick={() => window.electronAPI.submitBlurExample({ folderPath, fileName: currentFile, label })}>
  Submit this example
</button>
```

- [ ] **Step 4: Confirm green.** Repeat Step 1 in light/dark themes, including keyboard navigation, offline AI, feedback 401, and upload failure. Run `npm test`, `npm run lint`, and `npm run build`; inspect normal batch preview and execution again.
- [ ] **Step 5: Commit.** Stage only the UI files changed for this flow.

### Task 7: Verify a private package candidate without production writes

**Files:** Modify `desktop/docs/blur-detection.md`; record observed results in the vault journal. No release artifact or service configuration is committed.

**Interfaces:** Consumes Tasks 1–6. Produces a reviewed beta installer candidate and evidence for a later, separately authorized tester release; it does not publish or apply a production Supabase migration.

- [ ] **Step 1: Correct the desktop blur guide.** Document that `BATCH_BLUR_AI_URL` is a host base URL without `/api/v1`, explain the beta-only config and per-tester key, and state advisory behavior and explicit feedback retention. Remove stale polling/sidecar claims only where this touched guide is wrong.
- [ ] **Step 2: Run automated gates.** From `desktop/`: `npm test`, `npm run lint`, `npm run build`; from repo root: `npx supabase test db supabase/tests/blur_beta_feedback.test.sql`. Save counts and command outcomes in the vault journal.
- [ ] **Step 3: Run packaged Windows smoke.** Build a private NSIS candidate with a test-only staging key entered after install. On a clean Windows VM and an existing direct-installer test profile: verify sign-in, existing settings/rollback history, updater/banner disabled, HTTPS staging host, no key/path in logs or renderer, offline ordinary batching, and reinstall of the current public installer without data loss. Test feedback upload and cross-account denial against local Supabase in the development app; the packaged app still targets production Supabase, whose migration has not been applied. Do not test an unapproved candidate on Store-installed clients.
- [ ] **Step 4: Review and stop at the release boundary.** Inspect the final diff, beta artifact, local feedback results, rollback evidence, and privacy purge procedure. Ask for final authorization before applying the production Supabase migration, issuing real tester keys, or distributing the installer. Do not mark Task 12 complete from beta examples.

### Task 8: Run the authorized small tester wave

**Files:** No application edits unless Task 7 exposed a bug; record deployment and tester results in the vault journal. This task starts only after the owner approves the reviewed artifact and production Supabase migration.

**Interfaces:** Consumes the tested beta installer, migration, and rollback procedure from Tasks 3–7. Produces observed pilot evidence, not a general-availability verdict.

- [ ] **Step 1: Apply the reviewed feedback migration.** Verify the linked Supabase project is the intended BatchMyPhotos production project, review the SQL diff, then run `npx supabase db push`. Check the bucket is private and RLS tests pass against a disposable test account; do not expose its service-role key in desktop code.
- [ ] **Step 2: Issue distinct staging keys and invite direct-installer testers.** Give each only `blur:read` and `jobs:read`; do not bundle keys. Keep the staging model deployment fixed for this wave and record its deployment ID.
- [ ] **Step 3: Verify actual packaged feedback and load.** With at least two signed-in tester sessions and a representative desktop batch, record photo count, summaries, retries, elapsed time, staging CPU/RAM peak, upload success, and cross-account Storage denial. Verify selected JPEG only, no automatic separation, and normal batching on API failure. Do not assert an SLO that was never agreed.
- [ ] **Step 4: Verify reversal and privacy cleanup.** Revoke one test key and confirm only that tester loses blur access; ordinary batching still works. Reinstall the public app on a test machine and confirm auth/history remain. Delete a submitted example through Storage API plus its metadata row, verify it is gone, and schedule the remaining 30-day purge.
- [ ] **Step 5: Record the beta verdict.** Log observed defects and labeled examples as diagnostic evidence; keep the independent Task 12 holdout and quality limits open. Broader rollout or automatic separation needs a new reviewed release decision.
