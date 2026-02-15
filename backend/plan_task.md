## Plan: Local Python AI Blur Detection Service

**TL;DR** — Build a local Python AI blur detection service in a new `ai-service/` folder at the project root. It runs as a FastAPI server on localhost during development. The Electron app calls it via HTTP. Focus is on training a MobileNetV3 model, testing accuracy locally, and integrating with the existing blur detection flow. Deployment (RunPod, backend proxy, auth) is deferred to a later phase.

**Steps**

### Phase 1: AI Service Setup (`ai-service/`)

1. **Create `ai-service/` folder** at the project root with this structure:
   - `ai-service/main.py` — FastAPI server with a `POST /analyze` endpoint. Receives a batch of base64-encoded images, runs inference, returns results. Runs on `localhost:8000`
   - `ai-service/model.py` — Model loading and inference. Loads MobileNetV3-Small fine-tuned for binary classification (blurry vs. sharp). Preprocesses images (resize 224×224, normalize), runs batch inference on GPU if available, falls back to CPU
   - `ai-service/requirements.txt` — `torch`, `torchvision`, `fastapi`, `uvicorn`, `Pillow`, `python-multipart`
   - `ai-service/.gitignore` — Ignore `data/`, `models/*.pt`, `__pycache__/`, `.venv/`
   - `ai-service/README.md` — Setup instructions (create venv, install deps, run server)

2. **FastAPI endpoint contract** (`main.py`):
   - **Input:** `POST /analyze` with JSON body `{ "images": [{ "baseName": "IMG_001", "data": "<base64>" }, ...] }`
   - **Output:** `{ "results": { "IMG_001": { "score": 0.92, "isBlurry": true, "confidence": 0.92 }, ... } }`
   - **Health check:** `GET /health` — returns `{ "status": "ok", "model_loaded": true }`
   - Batch size: up to 20 images per request
   - All images batched into a single tensor for one forward pass

3. **Model architecture** (`model.py`):
   - `torchvision.models.mobilenet_v3_small(weights='IMAGENET1K_V1')` — pretrained backbone
   - Replace final classifier: `nn.Linear(576, 2)` (blurry / sharp)
   - Save as TorchScript `.pt` file in `ai-service/models/`
   - Load model once at startup, keep in memory

### Phase 2: Dataset Collection & Training

4. **Create `ai-service/training/` subfolder:**
   - `ai-service/training/generate_synthetic.py` — Takes a folder of sharp photos, applies Gaussian blur, motion blur, and defocus blur at varying strengths to generate blurry counterparts. Outputs to `ai-service/data/train/blurry/` and `ai-service/data/train/sharp/`
   - `ai-service/training/prepare_dataset.py` — Organizes raw images into `data/train/{blurry,sharp}/` and `data/val/{blurry,sharp}/` with an 80/20 split
   - `ai-service/training/train.py` — Fine-tuning script:
     - Phase 1: Freeze backbone, train classifier head only (10 epochs, lr=1e-3)
     - Phase 2: Unfreeze all layers, train end-to-end (20 epochs, lr=1e-5)
     - Data augmentation: random resized crop, horizontal flip, color jitter, random rotation
     - Saves best model by validation accuracy to `ai-service/models/best_model.pt`
     - Logs training/val loss and accuracy per epoch
   - `ai-service/training/evaluate.py` — Runs model on validation set, prints accuracy, precision, recall, F1 score, and confusion matrix

5. **Dataset strategy:**
   - **Step 1 — Synthetic bootstrap:** Run `generate_synthetic.py` on 500-1000 of your own sharp photos to create matching blurry versions. Gives you an instant training set
   - **Step 2 — Seed from existing results:** Export images your current Laplacian detects with `score < 50` as "blurry" and `score > 200` as "sharp" into the training folders
   - **Step 3 — Manual labeling:** Review and correct edge cases by hand
   - **Target:** 2000+ images per class for reliable fine-tuning

### Phase 3: Electron App Integration (Local Dev)

6. **Add config flags** in `src/main/config.js`:
   - `BLUR_AI_ENABLED: envBool('BATCH_BLUR_AI_ENABLED', false)` — off by default until model is trained
   - `BLUR_AI_URL: process.env.BATCH_BLUR_AI_URL || 'http://localhost:8000'` — local FastAPI URL

7. **Modify `blurDetectionService.js`** — Replace the core logic:
   - Add a new function `analyzeBlurAI(fileGroups, folderPath, onProgress)` that:
     - Reads each analyzable image via `fs.readFile`, converts to base64
     - Splits into batches of 20
     - POSTs each batch to `http://localhost:8000/analyze` via `net.fetch` or Node `fetch`
     - Reports progress after each batch: `onProgress({ current, total })`
     - Maps response to existing shape: `{ baseName: { score, isBlurry, analyzedFile, confidence } }`
   - Update `analyzeBlur()` to check `config.features.BLUR_AI_ENABLED`:
     - If `true` → call `analyzeBlurAI()`, catch errors → return `{ success: false }` if service is down
     - If `false` → blur detection is disabled (return empty results or skip)
   - Remove or keep Laplacian code in a separate file for reference — it will no longer be used at runtime

8. **Update IPC handler** in `src/main/ipcHandlers.js` (~line 486):
   - The `analyze-blur` handler already calls `blurDetectionService.analyzeBlur()` — interface stays the same
   - Add error handling: if AI service is down, return `{ success: false, error: 'AI service unavailable' }`
   - Remove `threshold` parameter validation (strict/moderate/lenient) — CNN doesn't need it, or repurpose as confidence threshold

9. **Update `useBlurDetection` hook** in `src/hooks/useBlurDetection.js`:
   - Handle `success: false` response — set `aiUnavailable` state
   - Show user-friendly message when unavailable: "Blur detection is temporarily unavailable. Make sure the AI service is running."
   - Remove or simplify ETA calculation (batch-based timing is different from per-image)

10. **Update UI components:**
    - `src/components/PreviewPanel/SettingsPanel.jsx` — Remove or repurpose sensitivity selector. Option A: remove entirely (CNN decides). Option B: map to confidence threshold (strict=0.6, moderate=0.75, lenient=0.9)
    - `src/components/Modals/BlurSensitivityModal.jsx` — Simplify or remove if sensitivity is no longer user-configurable
    - `src/components/PreviewPanel/StatsGrid.jsx` — Add "AI-powered" label or indicator when AI blur detection is active

11. **Update constants** in `src/main/constants.js`:
    - Add `BLUR_AI_BATCH_SIZE = 20` and `BLUR_AI_TIMEOUT_MS = 30000` (30s for local, shorter than cloud)
    - Deprecate `BLUR_THRESHOLDS`, `BLUR_EDGE_THRESHOLDS`, `BLUR_EDGE_PIXEL_THRESHOLD`, `BLUR_RESIZE_WIDTH` (keep but mark as legacy)

### Phase 4: Testing & Validation

12. **AI service tests** — Create `ai-service/test_api.py`:
    - Test `/health` endpoint
    - Test `/analyze` with a single sharp image → verify `isBlurry: false`
    - Test `/analyze` with a synthetically blurred image → verify `isBlurry: true`
    - Test batch of 20 images → verify all results returned
    - Test invalid input (no images, corrupted base64) → verify graceful error

13. **Electron integration tests** — Add `tests/blurDetectionService.test.js`:
    - Mock HTTP calls to the FastAPI server
    - Verify correct batching (50 images → 3 batches of 20/20/10)
    - Verify progress reporting after each batch
    - Verify error handling when service is down → returns `{ success: false }`
    - Verify response shape matches what the renderer expects

14. **Model accuracy validation:**
    - Run `evaluate.py` on held-out validation set
    - **Target metrics:** >90% accuracy, >85% precision (minimize false "blurry" flags), >80% recall
    - Compare side-by-side with old Laplacian results on the same images
    - Only enable `BLUR_AI_ENABLED` for users once these targets are met

15. **End-to-end manual test:**
    - Start FastAPI server locally (`uvicorn main:app`)
    - Set `BATCH_BLUR_AI_ENABLED=true` in Electron env
    - Open app, select folder with known blurry/sharp images
    - Verify correct detection, progress bar, `_Blurry` folder creation
    - Kill FastAPI server → verify "unavailable" message, app doesn't crash

### Phase 5: Dev Workflow

16. **Local development flow:**
    - Terminal 1: `cd ai-service && uvicorn main:app --reload` (Python AI server on :8000)
    - Terminal 2: `npm run start` (Electron + Vite)
    - The two run independently — Electron calls `localhost:8000` when blur detection is triggered
    - Hot reload on both sides: `--reload` for FastAPI, Vite HMR for React

17. **When ready to deploy (future — not in this plan):**
    - Add Dockerfile to `ai-service/` for RunPod Serverless
    - Add `backend/routes/blur.js` proxy route with Supabase auth
    - Switch `BLUR_AI_URL` from localhost to production backend URL
    - Add RunPod API key to backend `.env`

---

## Verification

- `ai-service/test_api.py` — API contract tests against local FastAPI
- `tests/blurDetectionService.test.js` — Electron-side unit tests with mocked HTTP
- `ai-service/training/evaluate.py` — Model accuracy on validation set (>90% acc, >85% precision)
- Manual end-to-end: blur toggle → analysis → `_Blurry` folder → service-down graceful handling

---

## Decisions

- **Local-only for now** — no RunPod deployment, no backend proxy, no auth. All deferred until model is validated
- **FastAPI on localhost** — Electron calls `http://localhost:8000` directly during dev via HTTP
- **MobileNetV3-Small** — fast inference (~5ms/image GPU, ~50ms CPU), small file (~10MB), good enough for binary blur classification
- **Synthetic dataset first** — bootstrap training without manual labeling; real data added incrementally
- **Batch processing (20/request)** — efficient tensor batching for inference
- **Disable on failure** — no Laplacian fallback; if AI service is down, blur detection is unavailable
- **Sensitivity → confidence threshold** — repurpose existing UI control to map to CNN confidence cutoff