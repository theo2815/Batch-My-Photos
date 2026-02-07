# Feature Implementation Backlog

> This document tracks all proposed features and enhancements for BatchMyPhotos.
> Use this as a living backlog — pick features to implement, update their status, and add notes as you go.

---

## Status Legend

| Status | Meaning |
|--------|---------|
| Backlog | Proposed, not yet started |
| In Progress | Currently being implemented |
| Done | Implemented and tested |
| Deferred | Intentionally postponed |

---

## Round 1 — Product Feature Suggestions

*Focused on long-term product value, new capabilities, and workflow expansion.*

### 1. Multi-Folder Processing Queue

| | |
|---|---|
| **Status** | Backlog |
| **Priority** | P3 |
| **Effort** | Large |
| **Impact** | Medium |

**Problem:** Photographers returning from a shoot often have images spread across multiple cards/folders. Currently, users must process one folder at a time, waiting for each to complete before starting the next.

**Value:** "Set it and forget it" workflow. Queue up 5 memory card imports, hit go, and walk away. Saves significant time on high-volume days (weddings, events).

**Implementation idea:**
- Add a queue data structure in `App.jsx` state (array of `{ folderPath, settingsOverride? }`)
- New `QueuePanel` component showing folder list with drag-to-reorder, per-folder status badges, and "Add Folder" button
- Modify `useBatchExecution` to accept a queue and chain executions sequentially, emitting per-folder and overall progress
- Reuse existing `batchEngine` and `batchExecutor` — they already work on single folders; the queue is orchestration on top
- Extend crash recovery (`progressManager.js`) to track queue position so resume works across folders

**Risks/Trade-offs:**
- Memory pressure if all folders are scanned upfront — mitigate by scanning lazily (scan folder N+1 while executing folder N)
- UX complexity: need clear visual separation between "current" and "queued" items
- Rollback becomes more complex — need per-folder rollback manifests (current `rollbackManager` is session-scoped)

---

### 2. EXIF-Based Smart Grouping (Group by Date/Camera/Lens)

| | |
|---|---|
| **Status** | Backlog |
| **Priority** | P2 |
| **Effort** | Medium |
| **Impact** | Medium |

**Problem:** Many photographers want to organize by logical grouping — "all photos from Monday," "all photos from the 50mm lens," or "all photos from Camera Body A." The current system only batches by count with sorting, but doesn't let you split on a metadata boundary.

**Value:** One-click organization by shooting session, camera body, or lens. Especially valuable for multi-day events or dual-camera setups.

**Implementation idea:**
- Extend `batchEngine.js` with a new `groupingStrategy` parameter: `none` (current), `exif-date` (group by day), `exif-camera`, `exif-lens`
- Leverage the existing `exifService.js` (already extracts and caches EXIF data) — extend to also pull `Make`, `Model`, `LensModel`
- In preview, show grouping boundaries visually (e.g., date headers between batch groups)
- Output folder names could auto-use the grouping key: `2026-02-07_Batch_001`, `Canon_R5_Batch_001`
- Add the option to `SettingsPanel.jsx` as a new dropdown alongside the existing sort options

**Risks/Trade-offs:**
- EXIF data is unreliable — cameras with wrong dates, missing lens info. Need graceful fallback (an "Unknown" group)
- Performance: already have EXIF caching, but extracting additional fields adds minor overhead
- Increases cognitive load in settings — mitigate with good defaults and tooltips

---

### 3. Batch Size by Total File Size (Not Just Count)

| | |
|---|---|
| **Status** | Backlog |
| **Priority** | P0 |
| **Effort** | Medium |
| **Impact** | High |

**Problem:** Photographers frequently batch for upload to services with size limits (e.g., "upload batches under 2GB to Dropbox," "ZIP files under 4GB for delivery"). Batching by file count doesn't account for the huge variance between a 5MB JPEG and a 60MB RAW file.

**Value:** Direct mapping to real-world constraints. "Make each batch fit on a DVD" or "keep batches under the client delivery limit" — no more guessing.

**Implementation idea:**
- Add a `batchSizeMode` setting: `count` (current) or `size`
- New field: `maxBatchSizeBytes` with a human-friendly input (e.g., "2 GB")
- `batchEngine.js` already collects file stats in `collectFileStats()` — extend the bin-packing algorithm to use cumulative size instead of count as the constraint
- The bounded-search bin-packing already works with a numeric limit; swap `maxFilesPerBatch` for `maxBytesPerBatch` in the inner loop
- Preview panel shows batch sizes in human-readable format ("Batch 1: 847 files, 1.8 GB")

**Risks/Trade-offs:**
- File groups (JPG+RAW) can be large — a single group might exceed the size limit. Need a clear warning
- Slightly slower scanning (need `fs.stat` for all files) — but `collectFileStats` already exists
- UI needs to clearly communicate which mode is active

---

### 4. Persistent Operation History with Extended Rollback

| | |
|---|---|
| **Status** | Done |
| **Priority** | P1 |
| **Effort** | Medium |
| **Impact** | High |

**Problem:** Rollback was session-only (lost when the app closes). If a user moved 10,000 photos, closed the app, then realized the next day they used wrong settings, they had no way to undo.

**Value:** Peace of mind. "I can always undo" — dramatically reduces fear of running a batch operation on irreplaceable photos.

**Implementation notes:**
- Manifests persisted to `userData/batch-history/` as individual JSON files
- Summary index stored in `electron-store` for fast history list loading
- New History modal with verify, undo, delete, clear all actions
- History icon in header for quick access from any app state
- Feature flag: `BATCH_HISTORY_ENABLED`, max entries: `BATCH_MAX_HISTORY_ENTRIES` (default 20)
- 159 tests passing, zero regressions

**Files changed:** `config.js`, `rollbackManager.js`, `ipcHandlers.js`, `preload.js`, `useRollback.js`, `HistoryModal.jsx`, `CompleteCard.jsx`, `App.jsx`, `strings.js`, `Modals.css`, `Modals/index.js`, `rollbackManager.test.js`

---

### 5. Recursive Subfolder Scanning

| | |
|---|---|
| **Status** | Backlog |
| **Priority** | P1 |
| **Effort** | Medium |
| **Impact** | High |

**Problem:** Photographers often have nested folder structures from camera imports (e.g., `DCIM/100CANON/`, `DCIM/101CANON/`). Currently, the user must process each subfolder individually.

**Value:** "Point at the top-level folder and it just works." Removes a tedious multi-step workflow for the most common import structure.

**Implementation idea:**
- Add a `scanSubfolders` toggle in `SettingsPanel.jsx` (default: off, to preserve current behavior)
- Modify `batchEngine.js`'s scanning phase to optionally use recursive directory reading
- File grouping stays the same — just the file discovery phase changes
- In preview, show the source subfolder as metadata on each group
- Security: extend `securityManager.js` allowlist to cover child paths of registered folders

**Risks/Trade-offs:**
- Accidental inclusion of unwanted folders (e.g., existing batch output folders). Need an exclusion pattern or depth limit
- Name collisions: `100CANON/IMG_001.jpg` and `101CANON/IMG_001.jpg` would group together. Need to qualify group names with subfolder path or detect/warn
- Performance: deep trees with many files could be slow — add a scanning depth limit (default: 3 levels)

---

### 6. Drag-and-Drop Batch Reordering in Preview

| | |
|---|---|
| **Status** | Backlog |
| **Priority** | P3 |
| **Effort** | Large |
| **Impact** | Medium |

**Problem:** The preview shows the batch plan, but users can't adjust it. If a key sequence of photos got split across two batches, there's no way to fix it without changing global settings and re-previewing.

**Value:** Fine-grained control. "Move these 5 photos from Batch 3 to Batch 2" with a simple drag. Transforms the preview from read-only to interactive.

**Implementation idea:**
- Make `BatchPreview.jsx` interactive: each file group becomes a draggable item, each batch becomes a drop target
- Use a lightweight drag library (e.g., `@dnd-kit/core`)
- When a group is moved, recalculate batch counts/sizes and show warnings if limits are exceeded
- Store custom adjustments as overrides on top of the engine's output
- "Reset to Auto" button to discard manual changes

**Risks/Trade-offs:**
- Performance: drag-and-drop with 10,000+ groups will be sluggish. Need virtualization (`react-window`)
- Complexity: maintaining manual overrides through settings changes — should auto-discard overrides with confirmation
- Scope creep: keep focused on batch reassignment only

---

### 7. Keyboard Shortcuts & Power-User Workflow

| | |
|---|---|
| **Status** | Backlog |
| **Priority** | P0 |
| **Effort** | Small |
| **Impact** | High |

**Problem:** Repetitive workflows (select folder, adjust settings, preview, execute) require many clicks. Professional photographers processing dozens of folders daily want speed.

**Value:** 2x faster workflow for repeat users.

**Implementation idea:**
- Register global shortcuts via Electron's `Menu` accelerators
- Key bindings: `Ctrl+O` (open folder), `Ctrl+Enter` (execute), `Ctrl+Z` (undo), `Ctrl+P` (cycle presets), `Escape` (cancel), `Ctrl+,` (settings)
- Add a `useKeyboardShortcuts` hook that registers/unregisters based on app state
- Show shortcut hints in tooltips
- Optional: shortcut cheat sheet modal (`Ctrl+?`)

**Risks/Trade-offs:**
- `Ctrl+Z` means "undo text" in inputs but "rollback batch" at app level. Scope shortcuts to non-input-focused states
- Cross-platform: use Electron's `CommandOrControl` modifier

---

### 8. Export/Share Presets

| | |
|---|---|
| **Status** | Backlog |
| **Priority** | P2 |
| **Effort** | Small |
| **Impact** | Medium |

**Problem:** Photography studios with multiple editors need consistent batch settings across machines. Presets are local-only.

**Value:** Standardized workflow across a team. Also useful for migrating to a new machine.

**Implementation idea:**
- "Export Preset" button saves a `.bmp-preset` JSON file via `dialog.showSaveDialog`
- "Import Preset" reads and validates the file, adds to local presets
- Validation: schema check + sanitize all string fields (reuse `securityManager.js` patterns)
- Include a `version` field for forward compatibility

**Risks/Trade-offs:**
- Security: imported presets could contain malicious path patterns. Strict validation required
- Low implementation cost, high perceived value

---

## Round 2 — UX & Polish Suggestions

*Focused on user experience gaps, feedback quality, error handling, and accessibility.*

### 9. Pre-Execution Safety Checks (Disk Space + Permissions)

| | |
|---|---|
| **Status** | Done |
| **Priority** | P0 |
| **Effort** | Medium |
| **Impact** | High |
| **Implemented** | 2026-02-07 |
| **Files changed** | `src/main/fileUtils.js`, `src/main/ipcHandlers.js`, `preload.js`, `src/hooks/useBatchExecution.js`, `src/components/Modals/SafetyCheckModal.jsx`, `src/components/Modals/Modals.css`, `src/components/Modals/index.js`, `src/constants/strings.js`, `src/App.jsx`, `tests/fileUtils.test.js` |
| **Tests added** | 23 new tests (formatBytes, calculateTotalSize, space sufficiency, permission handling) |

**Problem:** Users can run a 50GB copy operation and hit "disk full" at 70% completion, or target a read-only share and get a wall of permission errors. No pre-flight validation exists.

**Value:** Prevents the most stressful failure mode: a half-completed operation on irreplaceable photos.

**Implementation idea:**
- After preview, before execution: call a `validate-execution` IPC handler
- In main process: (a) `fs.stat` output drive for free space vs. total file size, (b) test write + delete in output directory for permissions
- Show results in confirmation modal: green checkmarks or red warnings
- The `collectFileStats` function already exists — extend to sum total bytes

**Risks/Trade-offs:**
- Adds ~1-2 seconds to the confirmation step
- Disk space can change between check and execution — still catches 95% of issues
- Network drive stat can be slow — add timeout, show "Could not verify"

---

### 10. Execution Speed + Time Estimate

| | |
|---|---|
| **Status** | Backlog |
| **Priority** | P0 |
| **Effort** | Small |
| **Impact** | High |

**Problem:** Progress bar shows "3,247 of 12,000 files" but gives no sense of time remaining. Creates anxiety during large operations.

**Value:** "ETA: ~4 minutes remaining" transforms the wait from anxious to predictable.

**Implementation idea:**
- In `batchExecutor.js`, track operation start time + running processed count
- Calculate rolling average speed: `filesPerSecond = processedFiles / elapsedSeconds`
- Derive ETA: `remainingFiles / filesPerSecond`
- Send `speed` and `etaSeconds` in existing `batch-progress` IPC event
- In `ExecutingCard.jsx`, show: "847 files/sec — ~3 min remaining"
- Use rolling window (last 30s) for smooth estimates

**Risks/Trade-offs:**
- Same-drive moves are nearly instant — only show ETA when operation takes >10 seconds
- Minimal overhead (a few `Date.now()` calls per chunk)

---

### 11. File Filtering Transparency ("Skipped Files" Report)

| | |
|---|---|
| **Status** | Backlog |
| **Priority** | P1 |
| **Effort** | Small |
| **Impact** | Medium |

**Problem:** Scan says "Found 847 files" but the folder has 900+ items. The engine silently filters system files, non-image files, and hidden files. Users notice the discrepancy and wonder if photos are missing.

**Value:** Eliminates confusion and builds confidence the tool isn't losing track of files.

**Implementation idea:**
- In `batchEngine.js`'s `groupFilesByBaseName`, return skipped count + reasons alongside file groups
- Categorize: "12 system files", "8 non-image files (.txt, .pdf)", "3 hidden files"
- In `scan-folder` IPC response, include `skippedCount` and `skippedSummary`
- In `StatsGrid`, add a "Skipped" stat with tooltip showing the breakdown

**Risks/Trade-offs:**
- Frame as informational, not alarming: "Skipped 12 non-image files"
- Cap detailed list at 50 for very large folders

---

### 12. Toast Notification System

| | |
|---|---|
| **Status** | Backlog |
| **Priority** | P1 |
| **Effort** | Small |
| **Impact** | Medium |

**Problem:** Multiple actions (preset save, history delete, undo complete) happen silently. There's a literal TODO in `SettingsPanel.jsx`: "Optional: Show a small toast or visual feedback here."

**Value:** Every action gets immediate, visible confirmation. Polishes dozens of interactions at once.

**Implementation idea:**
- Create `useToast` hook: `showToast('Preset saved', 'success')`
- Toast component: small bar at bottom, auto-dismiss after 3s, types: `success`, `error`, `info`
- Wire into: preset save/delete, history operations, undo complete, settings reset
- Use React portals, CSS slide-up animation matching design system

**Risks/Trade-offs:**
- Avoid overusing (theme toggle is already visually obvious)
- Must not overlap with modals — use z-index layering

---

### 13. Scan Cancellation + Scan Progress

| | |
|---|---|
| **Status** | Backlog |
| **Priority** | P2 |
| **Effort** | Medium |
| **Impact** | Medium |

**Problem:** `ScanningCard` shows a spinner with no progress and no cancel. For 50,000+ file folders, scanning takes 10-30 seconds. Users think the app is frozen.

**Value:** Users know the scan is alive and can bail if they picked the wrong folder.

**Implementation idea:**
- In `batchEngine.js` grouping phase, emit progress every 1,000 files via callback
- Add `scan-progress` IPC event
- In `ScanningCard.jsx`, show: "Scanning: 3,247 files found..."
- Add cancel button, reuse `appState.batchCancelled` flag
- Only show progress after 500ms delay (small folders scan instantly)

**Risks/Trade-offs:**
- Requires making scan loop cancellation-aware
- No partial state to clean up on cancel (simpler than execution cancel)

---

### 14. Error Recovery: Skip & Continue + Retry Failed

| | |
|---|---|
| **Status** | Backlog |
| **Priority** | P1 |
| **Effort** | Medium |
| **Impact** | High |

**Problem:** During a 10,000-file operation, if 3 files fail (locked, permission denied), the operation is flagged as error. Errors are collected but there's no retry or detailed view.

**Value:** "3 of 10,000 couldn't be moved — here's the list, click to retry." Transforms a scary error into a manageable situation.

**Implementation idea:**
- After execution with errors, show expanded error panel in `CompleteCard`
- List each failed file with reason (already collected in `batchExecutor.js` errors array)
- Add "Retry Failed" button → new `retry-failed-files` IPC handler re-attempts failed operations
- Add "Copy Error Report" button for clipboard export

**Risks/Trade-offs:**
- Retry may fail again — show updated results after retry
- Ensure dest folders still exist before retrying
- Don't overwhelm with details by default — make expandable

---

### 15. Keyboard Shortcuts + Focus Management + Accessibility

| | |
|---|---|
| **Status** | Backlog |
| **Priority** | P2 |
| **Effort** | Large |
| **Impact** | Medium |

**Problem:** App requires mouse for every action. Modals lack focus trapping. No ARIA labels. Drop zone isn't keyboard accessible. No `:focus-visible` styles.

**Value:** Faster workflow for power users. WCAG 2.1 accessibility compliance. Usable for keyboard-only users.

**Implementation idea:**
- `useFocusTrap` hook for all modals
- Global shortcuts: `Ctrl+O`, `Enter`, `Escape`, `Ctrl+Z`
- ARIA labels: `role="button"`, `aria-label`, `aria-live="polite"` for progress, `role="dialog"` for modals
- `:focus-visible` styles throughout
- Drop zone: `tabIndex={0}`, Enter/Space triggers file dialog

**Risks/Trade-offs:**
- `Ctrl+Z` conflicts with text input undo — scope to non-input states
- Moderate effort spread across many components (each change is small)

---

### 16. System Theme Detection + Smooth Theme Transitions

| | |
|---|---|
| **Status** | Backlog |
| **Priority** | P2 |
| **Effort** | Small |
| **Impact** | Low |

**Problem:** App defaults to dark mode, requires manual toggle. No system theme detection. Theme switch is instant and jarring.

**Value:** "It just matches my system." Smooth transitions make the app feel premium.

**Implementation idea:**
- In `useTheme.js`, check `window.matchMedia('(prefers-color-scheme: dark)')` on first load
- Listen for system changes with `matchMedia.addEventListener('change', ...)`
- Add third option: "System" (auto-follow OS)
- Add `transition: background-color 0.3s, color 0.3s` during theme switch
- Add `@media (prefers-reduced-motion: reduce)` to skip transition

**Risks/Trade-offs:**
- "System" option adds a third state — store as `dark`, `light`, or `system`
- Don't transition ALL properties (performance) — just color-related ones

---

## Quick Reference: Priority Matrix

### P0 — Do First (highest ROI)

| # | Feature | Effort | Area |
|---|---------|--------|------|
| 3 | Batch size by file size | Medium | Core feature |
| 7 | Keyboard shortcuts | Small | Power user UX |
| 9 | Pre-execution safety checks | Medium | Data safety (DONE) |
| 10 | Execution speed + time estimate | Small | Anxiety reducer |

### P1 — Do Next (high value)

| # | Feature | Effort | Area |
|---|---------|--------|------|
| 4 | Persistent operation history | Medium | Trust & safety (DONE) |
| 5 | Recursive subfolder scanning | Medium | Common workflow |
| 11 | File filtering transparency | Small | Trust builder |
| 12 | Toast notification system | Small | UX polish |
| 14 | Error recovery: skip & retry | Medium | Error resilience |

### P2 — Planned (important but less urgent)

| # | Feature | Effort | Area |
|---|---------|--------|------|
| 2 | EXIF-based smart grouping | Medium | Power feature |
| 8 | Export/share presets | Small | Team feature |
| 13 | Scan cancellation + progress | Medium | Large folder UX |
| 15 | Keyboard + accessibility | Large | Accessibility |
| 16 | System theme detection | Small | Polish |

### P3 — Future (nice-to-have)

| # | Feature | Effort | Area |
|---|---------|--------|------|
| 1 | Multi-folder queue | Large | Convenience |
| 6 | Drag-and-drop batch reorder | Large | Power feature |

---

## How to Use This Document

1. **Pick a feature** from the priority matrix above
2. **Update its status** to "In Progress"
3. **Implement it** following the implementation idea
4. **Update status** to "Done" and add implementation notes (files changed, tests added)
5. **Move to the next feature**

> Last updated: February 7, 2026
