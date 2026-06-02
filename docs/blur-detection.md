# Blur Detection Feature

## Overview

Blur Detection is an AI-powered feature that analyzes photos for blur before batching, allowing users to automatically separate blurry images from sharp ones. When enabled, detected blurry photos are excluded from normal batches and placed into a dedicated "Blurry" folder.

The feature is currently **feature-flagged off** (`BATCH_BLUR_DETECTION_ENABLED=false`) and under active development.

## Blur Types

Users select one of three blur detection modes depending on their use case:

### 1. Portrait/Object Out-of-Focus

Detects images where the primary subject (person, object) is not in sharp focus, while the background may or may not be blurred. This mode is designed for portrait and product photography where the subject itself must be tack-sharp.

**Use cases:**
- Portrait sessions where the subject's face/eyes must be sharp
- Product photography where the item must be in crisp focus
- Any scenario where shallow depth-of-field is intentional but mis-focus is not

**Behavior:** Analyzes the detected subject region for sharpness. A photo with an intentionally blurred background but a sharp subject passes; a photo where focus landed on the background instead of the subject is flagged.

### 2. General Out-of-Focus

Detects images that are globally soft or out-of-focus across the entire frame. This is the broadest mode and catches photos where the camera missed focus entirely or where lens softness/diffraction produced an unusable result.

**Use cases:**
- Landscape photography where the entire frame should be sharp
- Architecture and real estate photos
- General-purpose batch culling across mixed shooting scenarios

**Behavior:** Evaluates overall image sharpness across the full frame. Photos that are uniformly soft are flagged. Intentional shallow depth-of-field (sharp subject, blurred background) is not penalized.

### 3. Motion Blur

Detects images affected by camera shake or subject movement during exposure, producing directional streaking or smearing. This mode specifically targets blur caused by motion rather than focus errors.

**Use cases:**
- Sports and action photography where shutter speed was too slow
- Event photography with moving subjects under low light
- Handheld shooting at slow shutter speeds

**Behavior:** Analyzes the image for directional blur patterns characteristic of motion (as opposed to the uniform softness of defocus). A photo with intentional motion blur (e.g., panning) may still be flagged; users can manually un-flag such images.

## Architecture

### Components

```
Desktop App (Electron)
  src/main/blurDetectionService.js   -- AI API client (upload, poll, cache)
  src/main/config.js                 -- Feature flag + API URL/key config
  src/main/constants.js              -- Batch size, timeouts, poll intervals
  src/main/ipcHandlers.js            -- IPC: analyzeBlur, onBlurProgress
  src/hooks/useBlurDetection.js      -- React hook: state, progress, ETA, un-flagging
  src/components/Modals/BlurSensitivityModal.jsx  -- Sensitivity selection UI
  src/components/PreviewPanel/       -- Blur badges, stats, preview integration

External AI Service (CNN Classifier)
  POST /api/v1/blur/classify/batch   -- Up to 50 images (job_id + polling)
  POST /api/v1/blur/classify/mega    -- Up to 500 images (auto-splits, job_id + polling)
  GET  /api/v1/jobs/{job_id}         -- Poll job status/results
  GET  /api/v1/health/ready          -- Health check (authenticated)
```

### Data Flow

```
User toggles "Detect Blurry Photos" ON
  --> BlurSensitivityModal opens (select sensitivity + blur type)
  --> User clicks "Start Analysis"
  --> useBlurDetection.runBlurAnalysis()
  --> IPC: analyzeBlur(folderPath, sensitivity)
  --> blurDetectionService.analyzeBlur()
      1. Check in-memory cache (SHA-256 key from folder + groups)
      2. Pick analyzable file per group (first JPEG/PNG/WebP; skip RAW)
      3. Health check: GET /health/ready
      4. Chunk into batches of 20
      5. For each batch:
         - 1 file  --> POST /blur/detect (synchronous result)
         - 2+ files --> POST /blur/detect/batch --> poll GET /jobs/{job_id}
      6. Map API results to blurMap: { baseName: { score, isBlurry, confidence, metrics } }
      7. Cache results in memory
  --> Renderer receives blurMap
  --> blurryGroups derived (excluding user-unflagged groups)
  --> Blurry groups excluded from normal batches during execution
  --> Blurry files placed in dedicated "Blurry" output folder
```

### API Contract

**Request:** Multipart form-data with `X-API-Key` header.

**Response envelope:**
```json
{
  "success": true,
  "data": {
    "is_blurry": true,
    "confidence": 0.87,
    "blur_type": "motion",
    "metrics": { ... }
  }
}
```

**Batch response (poll result):**
```json
{
  "success": true,
  "data": {
    "job_id": "abc-123",
    "status": "completed",
    "progress": 1.0,
    "results": [
      { "filename": "IMG_001.jpg", "is_blurry": false, "confidence": 0.12, "blur_type": null, "metrics": {} },
      { "filename": "IMG_002.jpg", "is_blurry": true, "confidence": 0.91, "blur_type": "motion", "metrics": {} }
    ]
  }
}
```

Job statuses: `pending` -> `processing` -> `completed` | `failed`

### Analyzable File Types

Only raster web-friendly formats are sent to the API. RAW files are skipped because the JPEG/PNG companion from the same file group provides the same blur information and is significantly smaller to upload.

Supported: `jpg`, `jpeg`, `png`, `webp`, `tiff`, `tif`, `bmp`, `gif`, `heic`, `heif`

## Sensitivity Levels

Sensitivity controls how aggressively the AI flags images as blurry. The selected level is passed to the API as a parameter.

| Level      | Behavior                 | Best for                                   |
|------------|--------------------------|--------------------------------------------|
| **Strict** | Catches subtle blur      | Critical shoots (weddings, commercial)      |
| **Moderate** | Balanced detection     | General-purpose culling                     |
| **Lenient** | Obvious blur only       | Quick pass, keeping borderline-sharp images |

## User Interaction

### Enabling

1. In the Settings Panel, toggle **"Detect Blurry Photos"** ON
2. The BlurSensitivityModal appears prompting blur type and sensitivity selection
3. Click **"Start Analysis"** to begin
4. Dismissing the modal (Cancel / ESC / click outside) reverts the toggle to OFF

### During Analysis

- A progress indicator shows `current / total` with an ETA (displayed after 5% completion to avoid unreliable early estimates)
- Progress events stream from the main process via `onBlurProgress` IPC channel
- Concurrent analysis runs are prevented (ref-based guard)

### After Analysis

- Blurry groups are highlighted in the batch preview with a blur badge
- The StatsGrid shows the count of detected blurry images
- Users can **un-flag** individual groups they want to keep (e.g., intentional motion blur)
- Un-flagged groups return to normal batches
- Re-flagging is also supported (toggle behavior)

### During Batch Execution

- Blurry groups (minus user-unflagged ones) are passed to `executeBatch` as the `blurryGroups` parameter
- These files are separated into a dedicated output folder instead of being distributed across normal batches

## Configuration

### Feature Flag

```
BATCH_BLUR_DETECTION_ENABLED=true   # Enable the feature (default: false)
```

### API Connection

```
BATCH_BLUR_AI_URL=http://localhost:8000/api/v1   # AI service base URL
BATCH_BLUR_AI_API_KEY=sk_...                      # API key (X-API-Key header)
```

### Performance Tuning (constants.js)

| Constant                    | Default  | Description                                      |
|-----------------------------|----------|--------------------------------------------------|
| `BLUR_AI_MEGA_BATCH_SIZE`   | 500      | Max images per /classify/mega request             |
| `BLUR_AI_MEGA_TIMEOUT_MS`   | 300,000  | Timeout for mega classify requests (ms)           |
| `BLUR_AI_BATCH_SIZE`        | 50       | Max images per /classify/batch request            |
| `BLUR_AI_BATCH_CONCURRENCY` | 3        | Concurrent classify requests                      |
| `BLUR_AI_MAX_DIMENSION`     | 1,600    | Max image dimension (px) before upload            |
| `BLUR_AI_JPEG_QUALITY`      | 80       | JPEG quality for resized uploads                  |
| `BLUR_AI_POLL_INITIAL_MS`   | 300      | Initial polling interval (ms)                     |
| `BLUR_AI_POLL_MAX_MS`       | 3,000    | Max polling interval after backoff (ms)           |

## Classification vs Detection

The app uses the **CNN classifier** (`/classify`), not the Laplacian detector (`/detect`):

- `/detect` computes a global sharpness score (Laplacian variance). It misses spatially-varying blur like portrait defocus where the subject is blurry but background elements are sharp.
- `/classify` uses a CNN that classifies into four categories: `sharp`, `defocused_object_portrait`, `defocused_blurred`, `motion_blurred`. It correctly detects out-of-focus subjects.

User blur type selection maps to the classify API's `blur_type` query parameter:
- **portrait** → `blur_type=defocused_object_portrait` (API returns `detected: true/false`)
- **general** → no filter (any `predicted_class !== 'sharp'` is blurry)
- **motion** → `blur_type=motion_blurred`

## Error Handling

- **AI service unavailable:** Health check fails before analysis starts. The `aiUnavailable` flag is set in the UI, and no fallback/local detection is attempted. The user sees a clear error state.
- **Classify job failure:** Polling detects `status: "failed"` and throws with the server-provided reason.
- **Polling timeout:** If a job doesn't complete within `BLUR_AI_MAX_POLL_MS` (5 min), analysis throws a timeout error.
- **File read failure:** Individual unreadable files get `score: -1` and `isBlurry: false` (fail-open per file, not per batch).
- **Network errors during polling:** Transient `AbortError` on individual poll requests logs a warning and retries on the next interval. Non-transient errors propagate immediately.

## Caching

Results are cached in memory keyed by a SHA-256 hash of `folderPath + groupCount + first/last/middle group names`. The cache holds one folder at a time and is invalidated when:

- The folder changes
- The file group list changes
- The user explicitly clicks "Start Analysis" again (clears via `clearAnalysisCache()`)
- The feature is toggled off (`resetBlurState()`)

## Implementation Status

### Existing (built, feature-flagged off)
- AI API client with single/batch endpoints and polling
- In-memory caching with automatic invalidation
- React hook with full state management (progress, ETA, un-flagging)
- BlurSensitivityModal with sensitivity selection
- IPC handlers registered
- Feature flag and config plumbing
- UI integration points in PreviewPanel, StatsGrid, BatchPreview

### To Be Implemented
- Blur type selection UI (Portrait/Object, General, Motion) in BlurSensitivityModal
- Pass selected blur type to the AI API as a request parameter
- AI service endpoint support for blur type parameter
- Blur type display in results (badges, preview indicators)
- Dedicated "Blurry" output folder logic during batch execution
- End-to-end integration testing with live AI service
- Production AI service deployment and URL configuration
