# BatchMyPhotos — Architecture Guide

> Desktop utility for photographers to batch-split image folders into numbered subfolders, keeping file pairs (JPG + RAW) together.

**Stack:** Electron 28 · React 18 · Vite 5 · Sharp · exifr · electron-store

---

## 1. High-Level Overview

BatchMyPhotos is an Electron application with three isolated runtime contexts:

```
┌──────────────────────────────────────────────────────────┐
│  Main Process (Node.js)                                  │
│                                                          │
│  main.js ──► ipcHandlers.js ──► batchEngine.js           │
│              │                   batchExecutor.js         │
│              │                   exifService.js           │
│              │                   fileUtils.js             │
│              │                   securityManager.js       │
│              │                                            │
│              ├── progressManager.js  (crash recovery)     │
│              ├── rollbackManager.js  (undo operations)    │
│              └── config.js / constants.js  (settings)     │
│                                                          │
├─────────────── preload.js (Context Bridge) ──────────────┤
│                                                          │
│  Renderer Process (Chromium + React)                     │
│                                                          │
│  App.jsx ──► DropZone/  PreviewPanel/  StatusCards/       │
│              Modals/    common/                           │
│                                                          │
│  window.electronAPI.*  (only API available to renderer)   │
└──────────────────────────────────────────────────────────┘
```

### Process Responsibilities

| Process | Role | Can Access |
|---------|------|------------|
| **Main** | App lifecycle, filesystem I/O, security enforcement, IPC handlers | Node.js, Electron APIs, filesystem |
| **Preload** | Secure bridge — exposes a whitelist of IPC calls to the renderer via `contextBridge` | `ipcRenderer.invoke`, `ipcRenderer.on` (no `send`) |
| **Renderer** | UI rendering, user interaction, state management | Only `window.electronAPI` (sandboxed, no Node.js) |

---

## 2. Directory Structure

```
BatchMyPhotos/
├── main.js                  # Electron entry point — app lifecycle, protocol, store
├── preload.js               # Context bridge (electronAPI whitelist)
├── progressManager.js       # Crash recovery — encrypted progress persistence
├── rollbackManager.js       # Session-based undo for move operations
├── package.json
├── vite.config.js           # Vite config for React frontend
│
├── src/
│   ├── main/                # ── Main process modules ──
│   │   ├── config.js        # Feature flags, env detection, limits (env overridable)
│   │   ├── constants.js     # Performance tuning numbers (concurrency, chunk sizes)
│   │   ├── ipcHandlers.js   # All IPC handler registration (6 groups)
│   │   ├── batchEngine.js   # Core algorithm: grouping, sorting, bin-packing
│   │   ├── batchExecutor.js # Shared file-move/copy engine (3 strategies)
│   │   ├── exifService.js   # EXIF date extraction with caching
│   │   ├── fileUtils.js     # Drive detection, sync move, dir size calc
│   │   ├── securityManager.js # Path validation, input sanitization, symlink protection
│   │   └── windowManager.js # BrowserWindow creation, CSP headers
│   │
│   ├── utils/               # ── Shared utilities (main + renderer) ──
│   │   ├── batchNaming.js   # Batch folder name generation (CommonJS for both)
│   │   ├── errorSanitizer.js # Maps errors → user-friendly messages
│   │   └── logger.js        # Environment-aware logging (suppressed in prod)
│   │
│   ├── constants/           # ── Renderer-side constants ──
│   │   ├── appStates.js     # State machine enum (IDLE → SCANNING → READY → ...)
│   │   └── strings.js       # Centralized UI strings
│   │
│   ├── components/          # ── React components ──
│   │   ├── common/          # Reusable UI (ErrorBoundary, Tooltip, Spinner, Select)
│   │   ├── DropZone/        # Folder selection via drag-drop or dialog
│   │   ├── PreviewPanel/    # Batch preview, settings, thumbnails, stats
│   │   ├── StatusCards/     # Scanning/executing/complete/error state cards
│   │   └── Modals/          # Confirmation, resume, cancel, undo dialogs
│   │
│   ├── styles/              # CSS variables, base styles, layout
│   ├── images/              # App icon and logos
│   ├── App.jsx              # Root component — state orchestration
│   └── index.jsx            # React entry point with ErrorBoundary
│
└── docs/
    └── ARCHITECTURE.md      # This file
```

---

## 3. Core Flow: Scan → Preview → Execute

This is the primary user journey through the application:

```
User selects folder ──► IDLE
         │
         ▼
   scanFolder(path)  ──────────────────► SCANNING
         │                                  │
         │  ipcHandlers: readdir + stat     │
         │  batchEngine: groupFilesByBaseName│
         │  securityManager: validate path  │
         ▼                                  │
   Preview displayed ◄─────────────────── READY
         │
         │  User adjusts settings
         │  (debounced preview refresh)
         │
         ▼
   executeBatch(...)  ──────────────────► EXECUTING
         │                                  │
         │  ipcHandlers: build operations   │
         │  progressManager: start tracking │
         │  batchExecutor: process files    │
         │    ├── same-drive move (rename)  │
         │    ├── cross-drive move (cp+rm)  │
         │    └── copy mode (cp only)       │
         │                                  │
         │  rollbackManager: save manifest  │
         ▼                                  │
   Result displayed  ◄─────────────────── COMPLETE
         │
         │  (optional) User clicks Undo
         │  rollbackBatch() → moves files back
         │
         ▼
       IDLE
```

### State Machine

Defined in `src/constants/appStates.js`:

| State | Description |
|-------|-------------|
| `IDLE` | Waiting for folder selection (drag-drop or dialog) |
| `SCANNING` | Reading folder contents, building file groups |
| `READY` | Preview displayed, settings adjustable |
| `EXECUTING` | Files being moved/copied with progress bar |
| `COMPLETE` | Results shown, undo available (if move mode) |
| `ERROR` | Error occurred, user can retry |

---

## 4. IPC Channel Map

All IPC communication flows through `preload.js` → `ipcHandlers.js`. The handlers are organized into 6 groups:

### Group 1: Folder Selection & Registration
| Channel | Direction | Purpose |
|---------|-----------|---------|
| `select-folder` | invoke | Open native folder dialog |
| `select-output-folder` | invoke | Open output folder dialog (copy mode) |
| `register-dropped-folder` | invoke | Register a drag-dropped path as allowed |

### Group 2: Core Operations
| Channel | Direction | Purpose |
|---------|-----------|---------|
| `scan-folder` | invoke | Scan folder → file groups + stats |
| `execute-batch` | invoke | Execute batch split (move or copy) |
| `preview-batches` | invoke | Calculate batch preview (no file I/O) |
| `cancel-batch` | invoke | Cancel in-progress operation |
| `batch-progress` | send (main→renderer) | Progress updates during execution |

### Group 3: File System Operations
| Channel | Direction | Purpose |
|---------|-----------|---------|
| `open-folder` | invoke | Open folder in system explorer |
| `get-cache-info` | invoke | Get cache size/path info |
| `clear-cache` | invoke | Delete application cache |
| `cleanup-recent-folders` | invoke | Remove stale entries from recents |

### Group 4: Preferences & Persistence
| Channel | Direction | Purpose |
|---------|-----------|---------|
| `get-recent-folders` | invoke | Read recent folders list |
| `add-recent-folder` | invoke | Add to recents |
| `get-theme` / `set-theme` | invoke | Theme preference |
| `get-presets` | invoke | Read saved presets |
| `save-preset` | invoke | Save preset (validated + capped) |
| `delete-preset` | invoke | Delete a preset |

### Group 5: Batch Recovery
| Channel | Direction | Purpose |
|---------|-----------|---------|
| `check-interrupted-progress` | invoke | Check for crashed session |
| `clear-interrupted-progress` | invoke | Discard interrupted progress |
| `resume-batch` | invoke | Resume from where it stopped |

### Group 6: Rollback
| Channel | Direction | Purpose |
|---------|-----------|---------|
| `check-rollback-available` | invoke | Check if undo is possible |
| `rollback-batch` | invoke | Move files back to original locations |
| `clear-rollback-manifest` | invoke | Dismiss undo option |
| `rollback-progress` | send (main→renderer) | Progress during rollback |
| `get-thumbnails` | invoke | Generate preview thumbnails (Sharp) |

---

## 5. Security Architecture

### Defense in Depth

```
Renderer (sandboxed)
    │
    ▼  contextBridge — only exposes whitelisted IPC calls
Preload
    │
    ▼  ipcMain.handle — validates every input
Main Process
    │
    ├── securityManager.isPathAllowedAsync()
    │   ├── Resolves symlinks via fs.realpath() (prevents junction attacks)
    │   ├── Checks against allowedPaths Set (populated by dialog selection)
    │   └── Case-insensitive path comparison with path.sep awareness
    │
    ├── securityManager.sanitizeOutputPrefix()
    │   ├── Strips path separators (\ / : * ? " < > |)
    │   ├── Removes ".." traversal sequences
    │   └── Caps length at 50 characters
    │
    ├── securityManager.validateMaxFilesPerBatch()
    │   └── Clamps to [1, 10000] from config.limits
    │
    ├── Input validation in each handler
    │   ├── Type checks (typeof, Array.isArray)
    │   ├── Filename sanitization (no / \ .. in file names)
    │   └── Preset whitelist (ALLOWED_SETTINGS_KEYS)
    │
    └── errorSanitizer.sanitizeError()
        ├── Logs full error server-side
        └── Returns only safe user-friendly message to renderer
```

### Key Security Features

- **Renderer sandboxing:** `sandbox: true` in webPreferences — no Node.js access
- **Context isolation:** `contextIsolation: true` — renderer can't touch preload scope
- **Path allowlist:** Only folders selected through `dialog.showOpenDialog` or registered via drag-drop are accessible
- **Symlink protection:** `fs.realpath()` resolves junctions before path comparison
- **CSP headers:** Strict Content-Security-Policy in production, relaxed for Vite HMR in dev
- **Progress encryption:** AES-256-GCM with per-installation HKDF-derived key
- **HMAC integrity:** Progress files include SHA-256 HMAC when encryption is disabled

---

## 6. File Processing Strategies

The `batchExecutor.js` module implements three strategies, selected automatically:

| Strategy | When | How | Characteristics |
|----------|------|-----|-----------------|
| **Same-drive move** | `mode=move`, same drive | `fs.renameSync` in chunks | O(1) per file, synchronous, yields to event loop every `FILE_MOVE_CHUNK_SIZE` files |
| **Cross-drive move** | `mode=move`, different drives | Async worker pool: `copyFile` → verify size → `unlink` | Parallel (up to `MAX_FILE_CONCURRENCY`), verified before delete |
| **Copy** | `mode=copy` | Async worker pool: `copyFile` | Parallel, preserves originals |

All strategies:
- Report progress every 2 seconds via `onProgress` callback
- Persist progress to disk every 2 seconds via `onSaveProgress` callback
- Track processed files via `onProcessedFiles` for crash recovery
- Respect cancellation via `isCancelled()` check

---

## 7. Configuration System

The app has two configuration layers:

### `src/main/constants.js` — Performance Tuning
Pure numeric constants with no Electron dependency. Safe to import before `app` is ready.

| Constant | Default | Purpose |
|----------|---------|---------|
| `UV_THREADPOOL_SIZE` | 64 | libuv thread pool size |
| `MAX_FILE_CONCURRENCY` | 64 | Async file operation parallelism |
| `STAT_CONCURRENCY` | 50 | Parallel fs.stat calls |
| `FOLDER_CONCURRENCY` | 20 | Parallel mkdir calls |
| `FILE_MOVE_CHUNK_SIZE` | 100 | Sync rename chunk size |
| `THUMBNAIL_SIZE` | 40 | Preview thumbnail pixels |
| `THUMBNAIL_CONCURRENCY` | 10 | Parallel Sharp operations |
| `EXIF_CONCURRENCY` | 20 | Parallel EXIF extractions |

### `src/main/config.js` — Feature Flags & Limits
Requires Electron `app` module. Supports `process.env` overrides (prefix: `BATCH_`).

| Flag / Limit | Env Override | Default | Purpose |
|---|---|---|---|
| `features.ROLLBACK_ENABLED` | `BATCH_ROLLBACK_ENABLED` | `true` | Toggle undo feature |
| `features.ENCRYPTION_ENABLED` | `BATCH_ENCRYPTION_ENABLED` | `true` | Toggle progress encryption |
| `features.VERBOSE_LOGGING` | `BATCH_VERBOSE_LOGGING` | `false` | Debug logs in production |
| `features.EXIF_SORTING_ENABLED` | `BATCH_EXIF_SORTING_ENABLED` | `true` | Toggle EXIF sorting |
| `limits.MAX_PRESETS` | `BATCH_MAX_PRESETS` | 20 | Preset storage cap |
| `limits.MAX_FILES_PER_BATCH_CEILING` | — | 10000 | DoS prevention |

All config objects are `Object.freeze()`d to prevent accidental mutation.

---

## 8. Crash Recovery & Rollback

### Progress Persistence (`progressManager.js`)

On batch execution start, a progress file is written to `app.getPath('userData')`:

```
userData/
├── batch_progress.json      # Encrypted (AES-256-GCM) or plaintext + HMAC
└── .integrity_key           # Per-installation random key (never leaves disk)
```

- **In-memory tracking:** `addProcessedFiles()` updates a Set of completed file names (fast, non-blocking)
- **Periodic saves:** `saveProgressToDisk()` writes every 2 seconds using atomic rename pattern (write `.tmp` → rename)
- **On crash:** Next launch calls `checkInterruptedProgress` → user can resume or discard
- **On resume:** `resume-batch` loads stored operations, filters out already-processed files, continues

### Rollback (`rollbackManager.js`)

- **Session-based only** — manifest is in-memory, lost on app restart (by design)
- **Move mode only** — copy mode doesn't need undo (originals are preserved)
- Stores the full operation list with original source/dest paths
- Rollback reverses each operation: move files from batch folders → original location → delete empty batch folders

---

## 9. Adding a New IPC Channel

Follow these steps to add a new IPC channel:

### Step 1: Add the handler in `src/main/ipcHandlers.js`

Place it in the appropriate group function (e.g. `registerCoreHandlers`, `registerPreferenceHandlers`):

```javascript
ipcMain.handle('my-new-channel', async (event, args) => {
  try {
    // Validate inputs
    // Do work
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: sanitizeError(error, 'my-new-channel') };
  }
});
```

### Step 2: Expose in `preload.js`

Add to the `electronAPI` object:

```javascript
myNewChannel: (args) => ipcRenderer.invoke('my-new-channel', args),
```

### Step 3: Call from React

```javascript
const result = await window.electronAPI.myNewChannel(args);
```

### For push-based events (main → renderer):

```javascript
// In handler:
event.sender.send('my-event', data);

// In preload:
onMyEvent: (callback) => {
  const listener = (event, data) => callback(data);
  ipcRenderer.on('my-event', listener);
  return () => ipcRenderer.removeListener('my-event', listener);
},

// In React:
useEffect(() => {
  const cleanup = window.electronAPI.onMyEvent((data) => { ... });
  return cleanup;
}, []);
```

### Security Checklist for New Channels

- [ ] Validate all input types (`typeof`, `Array.isArray`)
- [ ] Use `isPathAllowedAsync()` for any path arguments
- [ ] Sanitize strings (no path separators in file names)
- [ ] Use `sanitizeError()` in catch blocks
- [ ] Cap array/string lengths to prevent DoS
- [ ] Add the channel to this architecture doc

---

## 10. Development Workflow

### Commands

```bash
npm run start    # Launch Vite dev server + Electron (hot reload)
npm run dev      # Vite dev server only
npm run electron # Electron only (needs dist/ or dev server)
npm run build    # Build React frontend to dist/
npm run dist     # Build + package with electron-builder
npm run pack     # Package without installer (for testing)
```

### Environment Variables

Set before launching to override defaults:

```bash
# Windows PowerShell
$env:BATCH_VERBOSE_LOGGING="true"; npm run start

# Windows CMD
set BATCH_VERBOSE_LOGGING=true && npm run start

# macOS/Linux
BATCH_VERBOSE_LOGGING=true npm run start
```

### Key Development Tips

1. **React changes** hot-reload automatically via Vite HMR
2. **Main process changes** require restarting Electron (`Ctrl+C` → `npm run start`)
3. **Preload changes** require restarting Electron (loaded once at window creation)
4. **DevTools** open automatically in development mode
5. **Logs** are printed to the terminal (main process) and DevTools console (renderer)
6. Set `BATCH_VERBOSE_LOGGING=true` to see debug logs in packaged builds
