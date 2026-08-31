# Functional Specification
## BatchMyPhotos — Desktop Application
### Features: Smart Batch Algorithm & Move/Copy Modes

---

**Document Version:** 1.0  
**Date:** February 21, 2026  
**Status:** Draft for TRA Review  
**Prepared by:** \[Your Name / Team]

---

## Table of Contents

1. [Application Overview](#1-application-overview)
2. [Scope](#2-scope)
3. [Feature 1 — Smart Batch Algorithm](#3-feature-1--smart-batch-algorithm)
   - 3.1 Overview
   - 3.2 User Stories
   - 3.3 Detailed Functional Requirements
   - 3.4 UI Specification
   - 3.5 Business Rules & Constraints
   - 3.6 Error Handling
   - 3.7 Non-Functional Requirements
4. [Feature 2 — Move & Copy Modes](#4-feature-2--move--copy-modes)
   - 4.1 Overview
   - 4.2 User Stories
   - 4.3 Detailed Functional Requirements
   - 4.4 UI Specification
   - 4.5 Business Rules & Constraints
   - 4.6 Error Handling
   - 4.7 Non-Functional Requirements
5. [System-Level Flow (Both Features Combined)](#5-system-level-flow-both-features-combined)
6. [Data Models](#6-data-models)
7. [Out of Scope](#7-out-of-scope)
8. [Glossary](#8-glossary)

---

## 1. Application Overview

**BatchMyPhotos** is a Windows desktop application built for photographers and photography studios that need to organize large volumes of photos into numbered sub-folders (batches). The application is built with Electron (Node.js backend + Chromium frontend) and packaged as a native Windows installer.

### Core Problem Solved

When photographers shoot thousands of photos at events (weddings, graduations, sports), they typically deliver photos in organized batches — for example, "500 photos per folder" for client review or USB delivery. Doing this manually in Windows Explorer is tedious, error-prone, and slow.

BatchMyPhotos automates this: the user selects a folder of photos, sets a maximum number of photos per folder, and the application splits the contents into numbered sub-folders automatically.

### Key Differentiating Behavior

- **Smart file pairing:** When photographers shoot in RAW+JPG mode, cameras produce matched pairs (e.g., `IMG_001.jpg` and `IMG_001.CR2`). BatchMyPhotos keeps each matched pair together in the same batch folder — they are never split across different folders.
- **Non-destructive Copy mode:** Users can copy photos to a new location rather than move them, preserving originals.
- **Rollback / Undo:** After a Move operation, the user can undo the entire batch in one click.
- **Crash recovery:** If the app is closed mid-operation, it can resume where it left off.

### Technology Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 28 |
| Frontend | React 18 + Vite 5 |
| Filesystem | Node.js `fs` / `fs.promises` |
| EXIF reading | `exifr` library |
| Image thumbnails | `sharp` library |
| Settings persistence | `electron-store` |
| Platform | Windows 10/11 (x64) |

---

## 2. Scope

This document covers **two features** only:

| # | Feature | Summary |
|---|---------|---------|
| 1 | **Smart Batch Algorithm** | The algorithm that reads a folder, groups paired files together, sorts them by user preference, and distributes them into evenly filled batches up to a configurable maximum. |
| 2 | **Move & Copy Modes** | The execution engine that physically moves or copies the grouped files into the resulting batch folders, with mode-specific behavior, pre-execution safety checks, and real-time progress reporting. |

**Out of scope for this document:**
- AI-powered blur detection (deferred feature)
- Authentication & subscription management
- Rollback / Undo system (separate feature)
- Crash recovery / resume (separate feature)
- Website / marketing pages

---

## 3. Feature 1 — Smart Batch Algorithm

### 3.1 Overview

The Smart Batch Algorithm is the core engine of BatchMyPhotos. It takes a flat folder of image files as input and produces a logical grouping of those files into batches, where each batch contains at most N files (configurable by the user).

The algorithm runs in two distinct contexts:

1. **Preview mode** — Runs on demand when the user adjusts settings. No files are written to disk. Results are shown in the Batch Preview panel.
2. **Execution mode** — Runs immediately before file operations begin. Produces the final batch assignments that drive Move or Copy operations.

### 3.2 User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|------------|
| US-1 | Photographer | Set a maximum number of photos per batch folder | Each delivery USB has a predictable count |
| US-2 | Photographer shooting RAW+JPG | Keep my JPG and its matching RAW file in the same folder | I don't have mismatched pairs after delivery |
| US-3 | Photographer | Sort my batches by shot date (oldest first) | Batch_001 always contains the earliest photos |
| US-4 | Photographer | Name my batch folders with a custom prefix | The folders match the client's event name |
| US-5 | Photographer | Preview exactly which files go into which folder before anything is moved | I can catch mistakes before they happen |
| US-6 | Studio manager | Use naming patterns like `{year}-{month}_Wedding` | Batch folders are self-documenting |

### 3.3 Detailed Functional Requirements

#### 3.3.1 Phase 1 — File Scanning & Filtering

When the user selects a source folder, the system SHALL:

1. **Read directory contents** — List all files in the folder (non-recursive; sub-folders are ignored).
2. **Filter system files** — Remove OS-generated files that should never be batched:
   - `desktop.ini`, `.DS_Store`, `Thumbs.db`, `.gitkeep`, `.gitignore`, `folder.jpg`, `albumart.jpg`
3. **Filter by allowed extensions** — Only process files with recognized photo/video extensions:

   | Category | Extensions |
   |----------|-----------|
   | Common image formats | `jpg`, `jpeg`, `png`, `gif`, `bmp`, `tiff`, `tif`, `webp`, `heic`, `heif` |
   | Canon RAW | `cr2`, `cr3` |
   | Nikon RAW | `nef`, `nrw` |
   | Sony RAW | `arw`, `srf` |
   | Adobe/Leica DNG | `dng` |
   | Olympus RAW | `orf` |
   | Panasonic RAW | `rw2` |
   | Pentax RAW | `pef` |
   | Fujifilm RAW | `raf` |
   | Samsung RAW | `srw` |
   | Sigma RAW | `x3f` |
   | Generic RAW | `raw` |
   | Video | `mp4`, `mov`, `avi`, `mkv`, `mts`, `m2ts` |

4. **Report results** — Return to the UI:
   - Total recognized file count
   - Total group count (unique base names)
   - Largest group size (max files sharing the same base name)

> **Note:** Extension matching is case-insensitive. Files with no extension, or with extensions not in the list above, are silently skipped.

---

#### 3.3.2 Phase 2 — File Pairing (Grouping by Base Name)

**Purpose:** Ensure that matched file pairs (e.g., `IMG_001.jpg` + `IMG_001.CR2`) are always placed in the same batch folder.

**Rule:** All files that share the same base name (filename without extension) are treated as a single logical group. The entire group is always kept together and is never split across batch folders.

**Example:**

```
Source folder contents:
  IMG_001.jpg     ┐
  IMG_001.CR2     ┘  → Group "IMG_001" (size: 2)
  IMG_002.jpg     ┐
  IMG_002.CR2     ┘  → Group "IMG_002" (size: 2)
  VID_003.mp4        → Group "VID_003" (size: 1)
```

**Implementation details:**
- Base name extraction: strip from the last `.` to end of filename.
- Files with no extension are also supported (base name = full filename).
- Grouping is case-sensitive (e.g., `Photo.jpg` and `photo.jpg` are in different groups).

---

#### 3.3.3 Phase 3 — Sorting

Before distributing files into batches, the system sorts the groups according to the user's selected sort order.

| Sort Option (UI Label) | Internal Key | Behavior |
|------------------------|-------------|---------|
| Name (A–Z) | `name-asc` | Alphabetical ascending, with numeric awareness (e.g., `photo2` before `photo10`) |
| Name (Z–A) | `name-desc` | Alphabetical descending, with numeric awareness |
| Date (Oldest First) | `exif-asc` | Groups sorted by the earliest file modification time within the group, ascending |
| Date (Newest First) | `exif-desc` | Groups sorted by the earliest file modification time within the group, descending |

**Date sort source priority:**
- The system uses the file system's last-modified timestamp (`mtime`) for date sorting.
- For each group, the **earliest** mtime among all files in the group is used as the group's sort key.

> **Note:** EXIF-based date reading is available in the architecture but the sort dropdown labels reference "Date (Oldest/Newest First)" which maps to file modification timestamp sorting in the current implementation.

**Default sort order:** Name (A–Z) if not specified.

---

#### 3.3.4 Phase 4 — Batch Distribution (Bin-Packing)

**Goal:** Distribute the sorted groups into as few batches as possible without exceeding the user-configured maximum files per batch.

**Algorithm:**

```
Input:  sorted list of file groups, maxFilesPerBatch (N)
Output: list of batches (each batch is a list of file names)

For each group (in sorted order):
  1. Search the last BATCH_SEARCH_DEPTH (= 50) existing batches in reverse order.
  2. If a batch has enough remaining capacity to fit the entire group:
       → Add the group to that batch.
       → Stop searching.
  3. If no existing batch has capacity:
       → Create a new batch containing just this group.
```

**Key properties of this algorithm:**

- **Groups are atomic** — A group is never split across batches. If a group has 3 files (JPG + CR2 + XMP) and only 2 slots remain in the current batch, a new batch is created.
- **Bounded search** — Only the last 50 batches are searched (performance optimization for large datasets). This ensures O(N) time complexity overall.
- **Backward search** — Newer (more recent) batches are checked first because they are more likely to have remaining capacity.
- **Efficient packing** — The algorithm attempts to pack groups efficiently before creating new batches, minimizing the total number of folders created.

**Example:**

```
maxFilesPerBatch = 5, Groups: [A(3), B(2), C(4), D(1), E(2)]

Step 1: A(3) → No batches → Create Batch_001 [A,A,A]       counts: [3]
Step 2: B(2) → Batch_001 has 2 slots free → Add B          counts: [5]
Step 3: C(4) → Batch_001 is full → Create Batch_002 [C,C,C,C] counts: [5, 4]
Step 4: D(1) → Batch_002 has 1 slot free → Add D           counts: [5, 5]
Step 5: E(2) → Both batches full → Create Batch_003 [E,E]   counts: [5, 5, 2]

Result: 3 batches
```

---

#### 3.3.5 Phase 5 — Batch Naming

Each batch folder receives a generated name based on the user's naming pattern.

**Naming pattern variables:**

| Variable (case-insensitive) | Replaced with | Example |
|-----------------------------|--------------|---------|
| `{count}` | Zero-padded batch number (1-based) | `001`, `042` |
| `{date}` | Current date in `YYYY-MM-DD` format | `2026-02-21` |
| `{year}` | 4-digit current year | `2026` |
| `{month}` | 2-digit current month | `02` |

**Default suffix behavior:**
- If the user's pattern does not contain `{count}`, the system automatically appends `_{count}`.
- Example: pattern `Wedding` → `Wedding_{count}` → `Wedding_001`, `Wedding_002`, ...

**Auto-padding rules for `{count}`:**
- Minimum 3 digits (e.g., `001`).
- If total batch count requires more digits, padding is increased accordingly.

  | Total Batches | Example Output |
  |--------------|---------------|
  | 1–999 | `001`, `042`, `999` |
  | 1,000–9,999 | `0001`, `0042`, `9999` |
  | 10,000+ | `00001`, ... |

**Pattern examples:**

| User Input | Example Result (Batch 3 of 15) |
|-----------|-------------------------------|
| `Batch` | `Batch_003` |
| `Wedding-{count}` | `Wedding-003` |
| `{year}-{month}_Photos` | `2026-02_Photos_003` |
| `{date}_Set` | `2026-02-21_Set_003` |
| `{count}` | `003` |

**Input sanitization:**
- Characters `\ / : * ? " < > |` are not allowed in folder names (Windows restriction).
- `..` sequences are stripped to prevent directory traversal.
- Maximum pattern length: 50 characters.
- If the pattern becomes empty after sanitization, it defaults to `Batch`.

---

#### 3.3.6 Phase 6 — Preview Calculation

The batch preview is calculated without any file I/O (pure in-memory computation).

**Preview output per batch:**
- Batch folder name (e.g., `Wedding_001`)
- File count in that batch
- Thumbnail images (up to N preview thumbnails generated via Sharp)
- List of filenames assigned to the batch

**Preview is re-calculated automatically when:**
- Max files per batch value changes (debounced: 500ms after last keystroke)
- Sort order changes
- Folder name / pattern changes (debounced)

**Preview panel shows:**
- Total number of batch folders that will be created
- First and last batch folder name
- Per-batch expandable rows showing file count and thumbnails
- A summary note about the selected mode (see Feature 2)

---

### 3.4 UI Specification

#### 3.4.1 Settings Panel

The settings panel is located in the right column of the main window.

```
┌─────────────────────────────────────────────┐
│  ⚙ Settings                                 │
├─────────────────────────────────────────────┤
│  Presets:   [ Select or create preset... ▾] [⚙]  │
├─────────────────────────────────────────────┤
│  Max Photos Per Batch:  [  500           ]  │
│                                             │
│  Folder Name:           [ Wedding        ]  │
│      (hint: use {count}, {date}, etc.)      │
│                                             │
│  ↕ Sort Photos By:      [ Name (A-Z)    ▾]  │
│                                             │
│  Batch Mode:  [⚡ Move (Fast)] [⧉ Copy (Safe)] │
│  ⚡ Files will be moved instantly (same drive).│
│     Close Explorer windows for best speed. │
└─────────────────────────────────────────────┘
```

> [Enter your screenshot here — Settings Panel, Move mode active]

#### 3.4.2 Sort Order Dropdown

The dropdown contains exactly four options:

```
┌─────────────────────┐
│ ✓ Name (A–Z)        │
│   Name (Z–A)        │
│   Date (Oldest First)│
│   Date (Newest First)│
└─────────────────────┘
```

> [Enter your screenshot here — Sort dropdown open]

#### 3.4.3 Batch Preview Panel

The preview panel is located below the settings.

```
┌─────────────────────────────────────────────┐
│  Batch Preview                              │
│  ─────────────────────────────────────────  │
│  11 folders will be created:                │
│  Wedding_001 through Wedding_011            │
│                                             │
│  ▶ Wedding_001  ────────────────── 500 files │
│  ▶ Wedding_002  ────────────────── 500 files │
│  ▶ Wedding_003  ────────────────── 500 files │
│  ▶ Wedding_004  ────────────────── 500 files │
│  ▶ Wedding_005  ────────────────── 432 files │
│    [Show more...]                           │
│                                             │
│  ⚡ Files will be moved instantly            │
│  [  Proceed with Batching  ]               │
└─────────────────────────────────────────────┘
```

Clicking a row expands it to show thumbnail images and individual filenames.

> [Enter your screenshot here — Preview Panel with one row expanded]

#### 3.4.4 Presets

Users can save their settings as a named preset and reload them later.

**Preset saves:**
- Max photos per batch
- Folder name / pattern
- Sort order
- Batch mode (Move or Copy)
- Output directory (Copy mode only)

**Preset actions (via Settings gear menu):**
- New Preset — clears current settings and prompts for a name
- Save as Preset — saves current settings under a new name
- Save Changes — overwrites current preset with current settings
- Delete Preset

> [Enter your screenshot here — Preset dropdown with gear menu open]

---

### 3.5 Business Rules & Constraints

| Rule ID | Rule |
|---------|------|
| BR-1 | Max files per batch must be an integer between 1 and 10,000 (inclusive). |
| BR-2 | Folder name / pattern must not be empty after sanitization. |
| BR-3 | Folder name must not contain: `\ / : * ? " < > |` |
| BR-4 | A file group is never split across two batch folders. |
| BR-5 | Batch numbering is always 1-based (first folder ends in `_001`, never `_000`). |
| BR-6 | The directory is scanned only one level deep (no recursion into sub-folders). |
| BR-7 | Files with extensions not in the allowed list are silently ignored. |
| BR-8 | Batch preview must refresh automatically within 500ms of a settings change. |
| BR-9 | Maximum saved presets per user: 20. |
| BR-10 | Preset names are trimmed of leading/trailing whitespace. |

---

### 3.6 Error Handling

| Scenario | System Behavior |
|----------|---------------|
| User enters 0 or negative number for max files | Input field shows red border; error message: "Max files per batch must be between 1 and 10,000." Proceed button is disabled. |
| User enters >10,000 for max files | Same validation error as above. |
| User leaves folder name empty | Red border + message: "Please enter a folder name for the batch folders." |
| User enters forbidden characters in folder name | Inline warning below the field showing which character is not allowed. |
| Source folder has no recognized image files | Preview panel shows: "No image files found in this folder." |
| Source folder contains only system/hidden files | All files are filtered out; same empty-state message as above. |
| Folder path becomes inaccessible between scan and preview | Error state with message: "Folder is no longer accessible. Please re-select." |

---

### 3.7 Non-Functional Requirements

| ID | Requirement |
|----|------------|
| NFR-1 | Scanning a folder with 10,000 files must complete within 3 seconds on a standard SSD. |
| NFR-2 | Batch calculation for 50,000 file groups must complete within 5 seconds without freezing the UI. |
| NFR-3 | The algorithm yields control to the UI event loop every 1,000 files during grouping and every 500 groups during batch calculation to prevent UI freezes. |
| NFR-4 | Preview thumbnails are generated at 40×40 pixels using the Sharp library with up to 10 concurrent Sharp operations. |
| NFR-5 | Datasets larger than 50,000 groups trigger a performance warning in the internal log. |
| NFR-6 | All file name comparisons for extension detection are case-insensitive. |

---

## 4. Feature 2 — Move & Copy Modes

### 4.1 Overview

Once the batch algorithm has computed the destination for each file, the execution engine physically moves or copies each file from the source folder into its target batch sub-folder. The user selects one of two modes:

| Mode | Icon | Description |
|------|------|------------|
| **Move (Fast)** | ⚡ | Files are relocated into the batch folders within the same source folder. The source folder retains only the batch sub-folders after execution. |
| **Copy (Safe)** | ⧉ | Files are duplicated into batch folders at a user-selected output location. Original files remain untouched in the source folder. |

### 4.2 User Stories

| ID | As a... | I want to... | So that... |
|----|---------|-------------|------------|
| US-7 | Photographer | Move photos directly into batch folders | I don't need extra disk space and it's fast |
| US-8 | Photographer | Copy photos to an external drive in batches | I still have originals on my internal drive |
| US-9 | Photographer | See how much disk space is needed before copying | I'm warned if the destination drive is too full |
| US-10 | Studio operator | Know write access is confirmed before execution starts | I don't get mid-operation errors |
| US-11 | Photographer | Cancel a batch operation in progress | If I made a mistake, I can stop immediately |
| US-12 | Photographer | See real-time progress during execution | I know how long it will take |

### 4.3 Detailed Functional Requirements

#### 4.3.1 Mode Selection

The user selects the mode in the Settings panel via a toggle button group:

- **Move (Fast)** — Default selection on first launch.
- **Copy (Safe)** — Reveals an Output Location selector field when selected.

Mode selection is persisted to the current session. It is also saved and restored as part of a named Preset.

---

#### 4.3.2 Pre-Execution Safety Check

Before any file operations begin, the system runs an automated safety check. This check is displayed to the user in a modal dialog titled **"Pre-Execution Safety Check"**.

The system performs checks in parallel and displays results as a checklist:

**Check 1: Disk Space**

| Condition | Result |
|-----------|--------|
| Move mode (same drive) | ✅ Skipped — "Same-drive move — no extra space needed" |
| Copy mode or cross-drive move | Calculates total size of source files + 10% buffer. Checks available free space on the destination drive. |
| Sufficient free space | ✅ Shows available free space |
| Insufficient free space | ❌ Shows "Not enough disk space" with required vs. available amounts |
| Drive space undetectable | ⚠️ Warning: "Could not verify available disk space. Proceed with caution." |

**Check 2: Write Permissions**

The system attempts to create and delete a test file in the output directory.

| Result | Shown as |
|--------|---------|
| Write successful | ✅ "Write access confirmed" |
| Permission denied | ❌ "Cannot write to this folder — check permissions" |

**Check 3: Network/UNC Path Detection**

If the output path begins with `\\` (UNC path), an advisory warning is shown:  
⚠️ "Network drive detected. Space estimate may be approximate."

**After checks complete:**
- If all checks pass: "Proceed" button is enabled.
- If a critical check fails (disk space or permissions): "Proceed" button is disabled with an explanation.
- User may dismiss with "Cancel" at any time.

> [Enter your screenshot here — Pre-Execution Safety Check modal, all checks passed]

> [Enter your screenshot here — Pre-Execution Safety Check modal, disk space failure]

---

#### 4.3.3 Folder Creation

Before any files are moved/copied, the system creates all required batch sub-folders in a single phase:

1. Computes the complete list of unique destination directories.
2. Creates all directories in parallel (up to 20 concurrent `mkdir` operations).
3. Uses `{ recursive: true }` — existing folders are not considered an error.

---

#### 4.3.4 File Execution Strategies

The execution engine selects one of three strategies automatically based on the mode and drive configuration:

---

**Strategy 1 — Same-Drive Move (Fast)**

*Triggered when:* Mode = Move AND source folder and destination are on the same drive.

| Property | Detail |
|----------|--------|
| Operation | `fs.renameSync` |
| Complexity | O(1) per file — the OS renames the directory entry without copying data |
| Speed | Near-instantaneous even for thousands of files |
| Memory | Minimal — no data is read into memory |
| Safety | Atomic — either the rename succeeds or the original file stays |
| Chunk size | 100 files per synchronous chunk, then yields to the event loop |

Behavior:
- Files are processed in chunks of 100.
- After each chunk, a progress update is sent to the UI.
- Every 2 seconds, progress is persisted to disk (crash recovery).
- Cancellation is checked between chunks.

---

**Strategy 2 — Cross-Drive Move (Safe)**

*Triggered when:* Mode = Move AND source and destination are on different drives (e.g., moving to an external drive).

| Property | Detail |
|----------|--------|
| Operations | `copyFile` → verify size → `unlink` |
| Concurrency | Up to 64 parallel worker operations |
| Safety | Source file is only deleted after copy size is verified |
| Verification | `stat()` is called on both source and destination; sizes must match |

Behavior:
- Source file is NOT deleted if the copy fails or size verification fails.
- Errors on individual files are recorded and reported at the end; they do not stop the overall operation.
- Progress is reported progressively and saved to disk every 2 seconds.

---

**Strategy 3 — Copy Mode**

*Triggered when:* Mode = Copy (regardless of drives).

| Property | Detail |
|----------|--------|
| Operation | `copyFile` only (no delete) |
| Concurrency | Up to 64 parallel worker operations |
| Source files | Always untouched; never deleted |
| Rollback | Not applicable — originals are preserved |

Behavior:
- Identical parallel worker pool as Strategy 2, but without the delete step.
- Per-file errors do not stop the overall operation.

---

#### 4.3.5 Progress Reporting

During execution, the renderer displays a progress panel with:

- A progress bar showing `files processed / total files`
- The current batch folder being written
- Estimated completion (derived from throughput)
- A **Cancel** button

**Progress update frequency:**
- UI receives progress events at most every 2 seconds (to avoid flooding the renderer).
- Progress is also saved to disk every 2 seconds for crash recovery.

**Progress data structure sent to UI per event:**

| Field | Type | Description |
|-------|------|------------|
| `current` | number | Number of batch folders completed |
| `total` | number | Total batch folders |
| `processedFiles` | number | Files processed so far |
| `totalFiles` | number | Total files |

> [Enter your screenshot here — Execution in progress, progress bar visible]

---

#### 4.3.6 Cancellation

The user may click **Cancel** at any time during execution.

| Mode | Cancellation Behavior |
|------|----------------------|
| Move (same-drive) | Stops after the current chunk (≤100 files). Files already moved are NOT restored automatically. User may use the Undo feature. |
| Move (cross-drive) | Stops before the next file. Files already moved (and deleted from source) are NOT automatically restored. |
| Copy | Stops before the next file. Files already copied remain in the destination. Source is untouched. |

---

#### 4.3.7 Post-Execution Results Screen

After execution completes (or is cancelled), the UI transitions to a Results screen showing:

- Status: "Batching Complete!" or "Batching Cancelled"
- Total files processed
- Number of batch folders created
- A scrollable list of created folder names with their file counts
- **Move mode only:** An **Undo** button to roll back the entire operation
- **Copy mode:** Undo button is not shown (originals are untouched)
- **Open Folder** button to open the output directory in Windows Explorer

```
┌─────────────────────────────────────────────┐
│  ✅ Batching Complete!                       │
│  Successfully created 11 batch folders.     │
│  ─────────────────────────────────────────  │
│  Wedding_001  ──────────────── 500 files    │
│  Wedding_002  ──────────────── 500 files    │
│  Wedding_003  ──────────────── 500 files    │
│  Wedding_004  ──────────────── 500 files    │
│  Wedding_005  ──────────────── 432 files    │
│  [Show all 11...]                           │
│  ─────────────────────────────────────────  │
│  [↩ Undo]    [📁 Open Folder]    [✦ New]   │
└─────────────────────────────────────────────┘
```

> [Enter your screenshot here — Results screen after successful Move operation]

> [Enter your screenshot here — Results screen after successful Copy operation (no Undo button)]

---

#### 4.3.8 Rollback Availability (Move Mode Only)

- After a Move operation, a rollback manifest is saved in-session.
- The manifest maps each file's current location (in batch folder) back to its original location (in the source folder).
- The Undo button is available for the duration of the session.
- Rollback is **not available** for Copy mode because the original files are never deleted.

> **Note:** The full specification of the Rollback feature is covered in a separate document.

---

### 4.4 UI Specification

#### 4.4.1 Mode Toggle (in Settings Panel)

```
  Batch Mode:  [⚡ Move (Fast)]  [⧉ Copy (Safe)]
```

- The active mode button has a highlighted/filled style.
- Inactive mode button has a muted/outlined style.
- Clicking a button immediately updates the preview summary note.

**Note displayed below the toggle:**

| Active Mode | Note Shown |
|------------|-----------|
| Move | `⚡ Files will be moved instantly (same drive). Close Explorer windows for best speed.` |
| Copy | `⧉ Files will be copied. Originals will remain untouched.` |

> [Enter your screenshot here — Settings panel with Move mode active]

> [Enter your screenshot here — Settings panel with Copy mode active, Output Location visible]

---

#### 4.4.2 Output Location (Copy Mode Only)

When Copy mode is active, a new field appears below the mode toggle:

```
  Output Location:  [ Photos-Backup ▾ ]  [ Browse... ]
```

- Shows the folder name of the currently selected output directory.
- If no output directory has been selected, shows "Same as source" (which will place batch folders inside the source folder, same as Move mode behavior).
- **Browse...** button opens a native Windows folder picker dialog with the "Create New Folder" option enabled.
- The selected path is stored and restored as part of a Preset.

> [Enter your screenshot here — Settings panel, Copy mode, Output Location showing a selected folder]

---

#### 4.4.3 Pre-Execution Safety Check Modal

```
┌─────────────────────────────────────────────┐
│  🔍 Pre-Execution Safety Check              │
│  ─────────────────────────────────────────  │
│  ✅ 47.3 GB available                       │
│  ✅ Write access confirmed                  │
│  ─────────────────────────────────────────  │
│  Total: 2,432 files  (~18.6 GB)             │
│                                             │
│             [Cancel]   [Proceed ▶]          │
└─────────────────────────────────────────────┘
```

| Element | Behavior |
|---------|---------|
| Disk space row | Hidden if same-drive move. Shows ✅/❌/⚠️ based on check result. |
| Write access row | Always shown. |
| Proceed button | Disabled (grayed) if any ❌ check is present. |
| Cancel button | Always enabled. Dismisses the modal without executing. |

---

#### 4.4.4 Progress Screen

```
┌─────────────────────────────────────────────┐
│  Processing...                              │
│                                             │
│  [████████████████░░░░░░░░░░] 64%           │
│  1,557 / 2,432 files                        │
│  Creating: Wedding_004                      │
│                                             │
│              [✕ Cancel]                     │
└─────────────────────────────────────────────┘
```

> [Enter your screenshot here — Progress screen mid-execution]

---

### 4.5 Business Rules & Constraints

| Rule ID | Rule |
|---------|------|
| BR-11 | Move mode always places batch folders inside the source folder. The output directory selector is hidden and irrelevant. |
| BR-12 | Copy mode requires an output directory to be selected, OR defaults to placing batches inside the source folder if none is selected. |
| BR-13 | Rollback manifests are only saved for Move mode. Copy operations have no rollback. |
| BR-14 | The safety check must complete before execution begins. It cannot be bypassed. |
| BR-15 | If a file cannot be moved or copied due to a per-file error, the error is logged but execution continues with remaining files. |
| BR-16 | The source path and output path must both have been selected via the application's own dialogs (security allowlist). Paths typed directly into the UI are not accepted. |
| BR-17 | A batch cannot be started if another batch operation is currently in progress. |
| BR-18 | Cross-drive Move: source file is deleted only after copy size verification passes (size must exactly match). |
| BR-19 | Same-drive Move: uses `fs.renameSync` which is an atomic OS-level operation. |
| BR-20 | Maximum file concurrency for async copy operations: 64 parallel workers. |

---

### 4.6 Error Handling

| Scenario | System Behavior |
|----------|---------------|
| Output folder is on a full drive | Safety check shows ❌ disk space failure. Proceed is disabled. |
| Output folder has no write permission | Safety check shows ❌ write access failure. Proceed is disabled. |
| A single file fails to move/copy (e.g., file in use) | Error is recorded. Execution continues with remaining files. Final results screen shows count of errors with a list of affected files. |
| User cancels during execution | Operation stops at the next safe checkpoint. Results screen shows partial results. |
| Source folder is deleted or becomes unavailable mid-execution | File operation error recorded per file. Execution terminates early. Results screen shown with error summary. |
| App is force-closed during execution | On next launch, the app detects the interrupted progress file and offers to resume or discard the operation. |
| Network drive disconnected during copy | Per-file copy errors are recorded. Execution stops when errors exceed acceptable threshold or all files attempted. |

---

### 4.7 Non-Functional Requirements

| ID | Requirement |
|----|------------|
| NFR-7 | Same-drive Move: 10,000 files must be moved in under 3 seconds on a standard Windows SSD. |
| NFR-8 | Copy mode: must achieve at minimum 64 concurrent async I/O operations. |
| NFR-9 | Progress updates are sent to the UI at most every 2 seconds to prevent renderer flooding. |
| NFR-10 | Progress state is persisted to disk at most every 2 seconds for crash recovery. |
| NFR-11 | The UI must remain responsive (not freeze) throughout execution. Synchronous rename operations are chunked at 100 files with an event-loop yield between chunks. |
| NFR-12 | Per-file errors must not terminate the entire batch. All operable files must be processed. |
| NFR-13 | The application must not leave partial/corrupt files on the destination drive. If a copy fails mid-write, the incomplete file is left but documented in the error report. |

---

## 5. System-Level Flow (Both Features Combined)

The following sequence diagram describes the complete end-to-end flow of a batch operation incorporating both features:

```
User                    Renderer (React)          Main Process (Node.js)
 │                            │                           │
 │─── Select Folder ──────────►                           │
 │                            │──── scan-folder ─────────►│
 │                            │                           │─ readdir
 │                            │                           │─ groupFilesByBaseName
 │                            │◄─── scan results ─────────│
 │                            │ (totalFiles, totalGroups)  │
 │                            │                           │
 │◄── Preview panel shown ────│                           │
 │                            │                           │
 │─── Adjust settings ────────►                           │
 │ (maxFiles, prefix, sort,   │──── preview-batches ─────►│
 │  batchMode, outputDir)     │                           │─ groupFilesByBaseName
 │                            │                           │─ sortFileGroups
 │                            │                           │─ calculateBatches
 │                            │◄─── preview results ──────│
 │◄── Preview updates ────────│ (batch names, counts)      │
 │                            │                           │
 │─── Click "Proceed" ────────►                           │
 │                            │──── validate-execution ──►│
 │                            │                           │─ disk space check
 │                            │                           │─ write permission check
 │                            │◄─── validation result ────│
 │◄── Safety Check modal ─────│                           │
 │                            │                           │
 │─── Click "Proceed" ────────►                           │
 │                            │──── execute-batch ───────►│
 │                            │                           │─ groupFilesByBaseName
 │                            │                           │─ sortFileGroups
 │                            │                           │─ calculateBatches
 │                            │                           │─ mkdir (all batch folders)
 │                            │                           │─ Strategy 1/2/3:
 │                            │◄══ batch-progress (×N) ═══│   move/copy files
 │◄── Progress bar updates ───│                           │─ saveRollbackManifest
 │                            │◄─── execute result ───────│
 │◄── Results screen ─────────│                           │
 │                            │                           │
 │─── (optional) Undo ────────►                           │
 │                            │──── rollback-batch ──────►│
 │                            │◄══ rollback-progress(×N)══│
 │◄── Undo complete ──────────│                           │
```

---

## 6. Data Models

### 6.1 Settings Object (Persisted per Preset)

```json
{
  "maxFilesPerBatch": 500,
  "outputPrefix": "Wedding",
  "batchMode": "move",
  "sortBy": "exif-asc",
  "outputDir": null,
  "blurDetectionEnabled": false,
  "blurSensitivity": "moderate"
}
```

### 6.2 File Group Map (In-Memory)

```
{
  "IMG_001": ["IMG_001.jpg", "IMG_001.CR2"],
  "IMG_002": ["IMG_002.jpg", "IMG_002.CR2"],
  "VID_003": ["VID_003.mp4"],
  ...
}
```

Key: base name (string). Value: array of file names sharing that base name.

### 6.3 Batch Array (In-Memory, Output of Algorithm)

```
[
  ["IMG_001.jpg", "IMG_001.CR2", "IMG_002.jpg", "IMG_002.CR2", ...],  // Batch 0 (→ Wedding_001)
  ["IMG_251.jpg", "IMG_251.CR2", ...],                                 // Batch 1 (→ Wedding_002)
  ...
]
```

Each entry is a flat array of file names. The batch index maps to a folder name via `generateBatchFolderName(prefix, index, total)`.

### 6.4 File Operation Object

```json
{
  "fileName": "IMG_001.jpg",
  "sourcePath": "C:\\Photos\\IMG_001.jpg",
  "destPath": "C:\\Photos\\Wedding_001\\IMG_001.jpg",
  "batchIndex": 0
}
```

### 6.5 Progress Event Object (Sent from Main → Renderer)

```json
{
  "current": 3,
  "total": 11,
  "processedFiles": 1550,
  "totalFiles": 2432
}
```

### 6.6 Execution Result Object

```json
{
  "success": true,
  "processedFiles": 2432,
  "errors": [],
  "batchCount": 11,
  "batchResults": [
    { "folder": "Wedding_001", "fileCount": 500 },
    { "folder": "Wedding_002", "fileCount": 500 }
  ]
}
```

---

## 7. Out of Scope

The following are explicitly **not** covered by this specification:

| Item | Notes |
|------|-------|
| AI-powered blur detection | Feature deferred. Toggle is visible in UI but disabled ("Coming Soon"). |
| Rollback / Undo system | Separate specification document. |
| Crash recovery / Resume | Separate specification document. |
| Authentication & login | Separate specification document. |
| Subscription & billing | Separate specification document. |
| Website / marketing | Not part of the desktop application. |
| Sub-folder recursion | The algorithm only processes the top-level contents of the selected folder. |
| File renaming | FileNames are preserved exactly as-is during move/copy. |
| Duplicate detection | Files with identical names are overwritten in the destination if collisions occur. |
| macOS / Linux support | Application targets Windows 10/11 only. |

---

## 8. Glossary

| Term | Definition |
|------|-----------|
| **Base name** | The portion of a file name before the last `.` character. `IMG_001.jpg` → base name is `IMG_001`. |
| **File group** | All files sharing the same base name in the source folder. Treated as an atomic unit by the batch algorithm. |
| **Batch** | A destination sub-folder containing up to N files, created by the batch algorithm. |
| **Batch folder** | The physical folder created on disk (e.g., `Wedding_001`). |
| **Bin-packing** | A class of algorithms that pack items of various sizes into bins with a maximum capacity, minimizing the number of bins used. |
| **Same-drive operation** | A file move where source and destination are on the same logical drive (e.g., both on `C:`). The OS can perform this as a rename, which is O(1) and does not copy data. |
| **Cross-drive operation** | A file move where source and destination are on different drives (different drive letters). Requires physical data copy. |
| **EXIF** | Exchangeable Image File Format. Metadata embedded in photo files by cameras, including the date and time the photo was taken. |
| **RAW file** | An unprocessed image file captured directly from a camera sensor. Paired with an in-camera JPEG preview. Common formats: CR2, NEF, ARW, DNG. |
| **Rollback manifest** | An encrypted file saved after a Move operation that maps each file's new location back to its original location, enabling the Undo feature. |
| **TRA** | Technical Review and Assessment. The review process this document is being prepared for. |
| **IPC** | Inter-Process Communication. The mechanism used for the Renderer (React UI) to communicate with the Main Process (Node.js) in Electron. |
| **Context bridge** | Electron security mechanism that exposes a whitelisted set of IPC functions to the Renderer while keeping Node.js APIs inaccessible. |

---

*End of Document*
