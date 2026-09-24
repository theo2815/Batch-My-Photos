# Blur Detection

Blur suggestions are experimental. The private tester beta is **advisory only**: suggested blurry photos remain in ordinary batches. It never automatically deletes photos or sends them to a Blurry output folder. The normal public package keeps blur features disabled.

## Private beta configuration

Build from `desktop/` using the existing private scripts:

```powershell
$env:BATCH_BLUR_AI_URL = 'https://your-authorized-staging-host.example'
$env:BATCH_BETA_VERSION = '1.0.6-beta.1'
npm run dist:blur-beta
```

`BATCH_BLUR_AI_URL` is the **host base URL, without `/api/v1`**. The main process appends `/api/v1/blur/classify/stream` or `/api/v1/blur/classify`. Private builds require HTTPS without credentials, a path, query, or fragment. Use the authorized staging host, never production inference.

The ignored `blur-beta.json` contains only `environment: "staging"` and `blurApiUrl`. A packaged app enables all three blur flags only when this manifest is valid. A public package or missing/malformed manifest disables blur even if environment flags are set. Packaged apps ignore blur API keys in environment variables.

The beta build sets its own prerelease package metadata, retains the existing app/protocol identity, targets NSIS, and uses `--publish never`. It leaves the public version in `package.json` unchanged. GitHub auto-update, manual updater actions, and the separate public version banner are disabled in beta. This build command creates a private candidate; it does not authorize distribution.

Each invited tester enters their own staging key in the **Blur beta key** field after installation. Use restricted `blur:read` and `jobs:read` scopes. Do not embed keys in the manifest, installer, renderer bundle, or documentation. The main process saves the key in a dedicated `blur-beta-key` SecureStore using OS encryption; status requests return only enabled/configured booleans. Saving fails if OS encryption is unavailable.

Source runs retain environment configuration. For an advisory AI development run:

```powershell
$env:BATCH_BLUR_DETECTION_ENABLED = 'true'
$env:BATCH_BLUR_BETA_ENABLED = 'true'
$env:BATCH_BLUR_AI_ENABLED = 'true'
$env:BATCH_BLUR_AI_URL = 'http://localhost:8000'
# Supply BATCH_BLUR_AI_API_KEY privately if the development service requires it.
npm start
```

Source-only legacy local analysis is selected by `BATCH_BLUR_AI_ENABLED=false`. An AI outage does not automatically switch to that implementation.

## Analysis and review

1. Select a folder and enable blur suggestions.
2. Set sensitivity and blur categories, review the advisory notice, then choose **Start Analysis**. Folder, preset, sensitivity, and category changes do not start a beta analysis automatically.
3. Review suggestions in the existing preview. They do not change batch routing.
4. Optionally label a selected analyzed image **Sharp** or **Blurry**. A label alone uploads nothing.
5. Read the retention disclosure and choose **Submit this example** as a separate affirmative action.

Sensitivity and selected categories filter model probabilities in the main process. The four model classes are `sharp`, `defocused_object_portrait`, `defocused_blurred`, and `motion_blurred`. Suggested blur uses the highest non-sharp class probability and selected category; the reported blur score is `1 - P(sharp)`. The authoritative thresholds live in `SENSITIVITY_TO_THRESHOLD` in `src/main/blurDetectionService.js`.

## Current AI transport

The Electron main process calls the external ai-api directly with `X-API-Key`. No local inference sidecar is started.

- Choose the first supported raster companion in each file group; RAW-only groups are not analyzed. Supported extensions are defined by `ANALYZABLE_EXTENSIONS`; actual decoding depends on the installed Sharp codec support.
- Prepare an auto-rotated, resized JPEG through Sharp without retaining EXIF metadata. Resize dimensions, JPEG quality, concurrency, batch size, and timeouts are defined in `src/main/constants.js`.
- Send multipart images to `POST /api/v1/blur/classify/stream` and parse NDJSON rows. Success requires a valid terminal summary with consistent requested/success/error counts. Rows before a truncated stream are not committed as a successful result.
- Recover omitted rows through `POST /api/v1/blur/classify` only after a valid summary. HTTP 404/405 from the stream endpoint switches to per-image classification. There is no job polling or Celery path in this desktop client.
- Retry a retryable stream failure once. Unavailable service, authentication/rate-limit failures, malformed results, or incomplete streams fail analysis visibly. Unreadable/undecodable individual images are marked unanalyzable, not classified as sharp.

Results are held in memory for one folder. The cache discriminator includes folder/group sampling, mode, sensitivity, and categories. Explicit analysis clears the cache; beta feedback additionally matches the exact analyzed filename and a hash of its prepared JPEG, rejecting changed content. The main process retains those hashes; they are not sent to the renderer.

Key implementation files: `src/main/blurDetectionService.js`, `src/hooks/useBlurDetection.js`, `src/main/blurFeedbackService.js`, `src/main/blurBetaKeyStore.js`, `src/main/config.js`, and the existing preview/settings modals.

## Explicit feedback and privacy

Normal analysis sends resized images to staging inference. **Retaining a feedback example is a separate opt-in action.** Only the selected analyzed JPEG is submitted, with model class/score, the tester's Sharp/Blurry label, app version, and staging environment. Folder paths, original filenames, RAW companions, and EXIF are not included in feedback metadata. An opaque UUID object name sits under the signed-in user's UUID.

Feedback is used to evaluate and improve blur detection. It is private to the submitter and authorized research reviewers. The coordinator must delete examples **within 30 days, or sooner on request**. This is a manual operational commitment; the migration does not install an automatic purge job.

The desktop uses its existing Supabase session for the private `blur-beta-feedback` Storage bucket and `public.blur_beta_feedback` metadata. Owner policies permit insert/read/delete, with no overwrite; admins have review reads only. JPEG uploads are limited to 2 MB. If saving fails, the client attempts Storage HTTP cleanup; a cleanup failure tells the tester to contact the coordinator.

Coordinator purge procedure:

1. Identify the owner's requested examples, or records due for deletion, retaining their exact object names until byte deletion is confirmed. Include orphaned objects from failed submissions when reviewing the bucket.
2. Delete bytes through the **Supabase Storage API** using the owner session or an authorized server-side operational credential. Admin review access alone cannot delete another user's object. Never delete directly from `storage.objects` with SQL, and never place an operational credential in the desktop.
3. Confirm each object is no longer readable, then delete its `public.blur_beta_feedback` row. Retry and escalate failed byte deletion before discarding its metadata reference.
4. Confirm row absence and record date, count, and outcome in the private release journal without image content, personal paths, or credentials. Schedule the remaining 30-day purge before inviting testers.

## Verification and release boundary

Run `npm test`, `npm run lint`, and `npm run build` in `desktop/`. From the repo root, run `npx supabase test db supabase/tests/blur_beta_feedback.test.sql` against local Supabase. Verify real Storage upload/read/deletion and cross-account denial locally as well as SQL policies.

A packaged candidate still uses production Supabase for sign-in and feedback; packaged environment overrides cannot redirect it. Until the feedback migration is separately authorized and applied there, verify feedback only through a development app/service configured for local Supabase. Do not claim packaged feedback works from local evidence.

Before distribution, test the candidate on a clean Windows VM and a dedicated existing **direct-installer** profile: sign-in, settings and rollback history, disabled updates, staging analysis with a test-only key entered after install, key/path redaction, ordinary offline batching under existing subscription rules, and reinstalling the current public installer without data loss. Never use an unapproved candidate on a Store-installed client.

Applying the production migration, issuing real tester keys, and distributing the installer require separate final authorization. Beta examples alone do not complete the held-out model evaluation task.
