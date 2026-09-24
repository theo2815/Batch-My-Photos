# BatchMyPhotos blur tester beta design

Date: 2026-09-24
Status: design approved in chat; written spec awaiting review
Scope: BatchMyPhotos Electron desktop and its Supabase backend; QuickPitik blur staging API is an existing dependency

## Goal and release boundary

Invite a small group of real BatchMyPhotos photographers to try blur suggestions on their own photos and optionally submit labeled mistakes for diagnosis. The first wave uses the isolated Railway blur staging API at 2 CPU / 2 GB. Task 12's independent holdout, acceptance limits, and final release gate remain open. Beta feedback is self-selected and cannot establish unbiased over-cull or blur-miss rates.

The beta is advisory only. It must not automatically exclude, move, copy, or separate photos because of a model result. Ordinary batching must work if the blur API fails or the tester never opts in.

## Distribution and configuration

Build one invited-tester Windows installer from dev-main for testers who use the direct installer. Keep the existing app identity and deep-link scheme so sign-in still works. The beta installer temporarily replaces the app on those selected machines, but does not alter existing auth, settings, or rollback schemas. Give only the beta artifact a distinguishable package version; leave the public package.json release version unchanged. Disable both the public GitHub updater and public version banner in the beta artifact; provide a tested installer rollback path before invitations go out. Do not publish the beta artifact to the public GitHub release or Microsoft Store. A Microsoft Store package flight is a separate option for Store-installed testers.

Keep BATCH_BLUR_DETECTION_ENABLED=false and BATCH_BLUR_AI_ENABLED=false as normal defaults. A beta-only, nonsecret packaged configuration turns on the opt-in UI and supplies the staging base URL. Development still uses the existing environment variables. Packaged configuration never contains an API key. A tester receives a distinct staging key with only blur:read and jobs:read scopes through a private setup channel and enters it once in the beta app. A narrow IPC operation passes that input to the main process for storage through the existing SecureStore. The key is revocable per tester; no production ai-api key is used. Do not log it, return it to the renderer, or persist it in renderer state after setup.

## Desktop behavior

Reuse the current analyze-blur IPC, image resizing, streaming classifier, progress signal, and preview components. The tester enables blur analysis for a folder and starts it manually after seeing that resized photos will be sent to the staging API. Show suggestions for flagged photos and provide a way to inspect and label both flagged photos and photos the model called sharp. Match the existing Finish Line UI and accessibility conventions. Labels are binary sharp or blurry; a label alone stays local until the tester separately chooses Submit this example.

For this beta, pass no model-derived blurryGroups or excludeGroups to batch preview or execution. The existing grouping and undo behavior remain unchanged. Make the advisory status visible next to the suggestions and at batch confirmation. A failed or canceled analysis clears incomplete suggestions and presents a retry action while normal batching remains available.

The stream client must require exactly one valid completion summary with complete=true and counts consistent with the received results. Missing, false, malformed, or duplicate summaries cannot be treated as success even if image rows arrived. Retry only unaccounted images after a bounded staging overload, disconnect, or timeout; never count or submit duplicate results. Keep a finite client deadline greater than the staging request timeout, with concurrency low enough for the 2 CPU / 2 GB pilot. Do not silently fall back to the local Laplacian result when AI analysis fails.

## Explicit feedback flow

Add one narrowly scoped feedback IPC operation because the renderer must not receive unrestricted file access. Together with the key-setup operation above, these are the only new IPC methods. The main process validates that the chosen image belongs to the currently registered folder, resizes and re-encodes it to the same bounded JPEG format used for inference, strips metadata, and sends only that chosen image. It sends no original full-resolution file, filesystem path, EXIF, or automatic background samples.

Use the signed-in tester's existing Supabase session to upload the image to a new private BatchMyPhotos Storage bucket and insert a linked feedback record. The record contains the user id, timestamp, app beta version, staging environment, model prediction and score, human label, and storage object id. Do not put feedback or product-user data in ai-api. Enforce authenticated ownership on insert and own-record access; only project administrators may review other users' examples. If either upload or record creation fails, remove the partial object and show a clear retryable error. Submission is never a precondition for batching.

Before submission, show what will be uploaded and ask for a separate affirmative click. Tell testers that selected examples are private, used to evaluate and improve blur detection, and deleted by the beta coordinator within 30 days or sooner on request. Record the purge in the release checklist without personal photo details. No feedback upload occurs from a label change, app crash, or analysis retry.

## Verification and release checks

1. Unit check: complete and incomplete NDJSON streams, duplicate summary, partial results, overload, disconnect, and bounded retry; normal batch preview/execution receives no model-derived separation groups.
2. Local Supabase check: authenticated tester can submit and view only their own feedback; another tester cannot read or overwrite the record or private image; malformed paths and oversized uploads fail.
3. Packaged Windows beta smoke: existing sign-in and data survive installation and rollback, updater disabled, opt-in UI available, staging URL used, key stored securely, no key or local path in renderer/logs, standard batching works with API online and offline. Do not invite Store-installed testers to use the direct installer.
4. Small pilot on 2 CPU / 2 GB staging: at least two invited tester sessions and a representative desktop batch; capture completion, errors, and timings. Scale or reduce request concurrency based on observed behavior; do not claim a latency SLO until one is agreed.
5. Review submitted examples for failure modes. Keep them separate from the untouched Task 12 qualification holdout. Do not enable automatic separation or broaden distribution until that independent gate passes.

## Outside this first wave

No public BatchMyPhotos release, production ai-api change, model retraining, automatic culling, broad telemetry, new desktop subscription flow, or changes to QuickPitik web/mobile blur paths. A Store flight and future staging deployment automation remain separate work.
