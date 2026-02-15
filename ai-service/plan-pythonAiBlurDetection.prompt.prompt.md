## Plan: Python AI Blur Detection via RunPod Serverless

**TL;DR** — Replace the current Laplacian-based blur detection with a fine-tuned MobileNetV3 CNN deployed on RunPod Serverless. The Electron app sends images through your Express backend (which holds the RunPod API key securely), receives batch predictions, and disables blur detection entirely when the service is unavailable. A new `ai-service/` folder at the project root contains the Python inference code and Dockerfile for RunPod. Dataset collection is needed before fine-tuning — we'll start with a pretrained ImageNet model and build a training pipeline.

**Steps**

### Phase 1: AI Service (Python — `ai-service/`)

1. **Create `ai-service/` folder** at the project root with this structure:
   - `ai-service/handler.py` — RunPod Serverless handler. Receives a batch of base64-encoded images, runs inference, returns `{ baseName: { score, isBlurry, confidence } }` per image
   - `ai-service/model.py` — Model loading and inference logic. Loads a MobileNetV3-Small fine-tuned for binary classification (blurry vs. sharp). Uses PyTorch + torchvision
   - `ai-service/requirements.txt` — `torch`, `torchvision`, `Pillow`, `runpod`
   - `ai-service/Dockerfile` — RunPod Serverless container. Base image `runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel`. Installs deps, copies handler
   - `ai-service/README.md` — Setup, training, and deployment instructions

2. **RunPod handler contract** (`handler.py`):
   - **Input:** `{ "input": { "images": [{ "baseName": "IMG_001", "data": "<base64>" }, ...] } }`
   - **Output:** `{ "results": { "IMG_001": { "score": 0.92, "isBlurry": true, "confidence": 0.92 }, ... } }`
   - Batch size: up to 20 images per request. Images resized to 224×224 internally (MobileNetV3 input size)
   - GPU inference: all images batched into a single tensor for one forward pass

3. **Model architecture** (`model.py`):
   - `torchvision.models.mobilenet_v3_small(weights='IMAGENET1K_V1')` — pretrained backbone
   - Replace final classifier head: `nn.Linear(576, 2)` (blurry / sharp)
   - Export to TorchScript (`.pt`) for fast loading on RunPod cold starts
   - Initially ship with the pretrained model + random classifier head (accuracy won't be great until fine-tuned — blur detection stays disabled for free users until trained)

### Phase 2: Dataset Collection & Training Pipeline

4. **Create `ai-service/training/` subfolder:**
   - `ai-service/training/prepare_dataset.py` — Script to organize training data into `data/train/blurry/`, `data/train/sharp/`, `data/val/blurry/`, `data/val/sharp/`
   - `ai-service/training/train.py` — Fine-tuning script: loads MobileNetV3, freezes backbone, trains classifier head for 10 epochs, then unfreezes and trains end-to-end for 20 more epochs. Uses standard augmentations (random crops, flips, color jitter). Outputs `best_model.pt`
   - `ai-service/training/evaluate.py` — Evaluation script: runs model on val set, prints accuracy, precision, recall, F1, confusion matrix
   - `ai-service/training/generate_synthetic.py` — Bootstrap dataset generator: takes sharp images and applies Gaussian blur / motion blur / defocus blur at varying strengths to create blurry samples. This lets you start training immediately with the photos you already have

5. **Dataset strategy:**
   - **Synthetic first:** Use `generate_synthetic.py` on 500-1000 sharp photos → generates matching blurry versions → instant training set
   - **Real data later:** Collect real blurry/sharp labels from your existing Laplacian results (export confirmed blurry images with `score < 50` as "blurry", `score > 200` as "sharp"), plus manual labeling
   - **Target:** 2000+ images per class for reliable fine-tuning

### Phase 3: Express Backend Proxy Route

6. **Create `backend/routes/blur.js`** — New Express route following the same pattern as `backend/routes/paymongo.js`:
   - `POST /api/blur/analyze` — Authenticated endpoint (uses existing `authenticateUser` middleware from `backend/server.js`)
   - Receives: `{ images: [{ baseName, data }] }` (base64 images, max 20 per request)
   - Proxies to RunPod Serverless API: `POST https://api.runpod.ai/v2/{endpoint_id}/runsync`
   - RunPod API key stored in backend `.env` as `RUNPOD_API_KEY` and `RUNPOD_ENDPOINT_ID` — never exposed to the client
   - Returns parsed results to the Electron app
   - Rate limiting: Inherit the existing 100 req/15 min, or add a tighter blur-specific limit

7. **Mount route in `backend/server.js`:**
   - `const blurRoutes = require('./routes/blur')`
   - `app.use('/api', blurRoutes)` — alongside existing PayMongo routes

### Phase 4: Electron App Integration

8. **Add new config flag** in `src/main/config.js`:
   - `BLUR_AI_ENABLED: envBool('BATCH_BLUR_AI_ENABLED', true)` — toggles between AI and disabled
   - `BLUR_AI_API_URL: process.env.BATCH_BLUR_AI_URL || 'https://your-backend.com'` — backend URL

9. **Modify `blurDetectionService.js`** — Replace the core `analyzeBlur()` function:
   - Read each analyzable image, convert to base64
   - Split into batches of 20 images
   - For each batch: POST to your Express backend `/api/blur/analyze` via `net.fetch` (Electron's built-in fetch, bypasses CORS)
   - Report progress after each batch completes: `onProgress({ current: batchesDone * 20, total })`
   - Map response back to the existing shape: `{ baseName: { score, isBlurry, analyzedFile, confidence } }`
   - **If API call fails → blur detection is disabled for that session** (per your preference — no fallback to Laplacian)
   - Remove Sharp-based `computeBlurScore()` and Laplacian logic (or keep in a separate file for reference)

10. **Update IPC handler** in `src/main/ipcHandlers.js` (around line 486):
    - The `analyze-blur` handler calls the updated `blurDetectionService.analyzeBlur()` — interface stays the same
    - Add error handling: if the AI service is unavailable, return `{ success: false, error: 'AI service unavailable' }`
    - No changes needed to `blur-progress` IPC event — same shape

11. **Update `useBlurDetection` hook** in `src/hooks/useBlurDetection.js`:
    - Handle the new `success: false` case — set an `aiUnavailable` state
    - When `aiUnavailable` is true, display a message in the UI (e.g., "Blur detection is temporarily unavailable")
    - ETA calculation may need adjustment since batch-based API calls have different timing than per-image local processing

12. **Update UI** in `src/components/PreviewPanel/SettingsPanel.jsx`:
    - Remove sensitivity selector (strict/moderate/lenient) — the CNN makes its own decision at a single confidence threshold
    - Or: repurpose sensitivity as confidence threshold: strict = 0.6, moderate = 0.75, lenient = 0.9

### Phase 5: Auth & Security

13. **Supabase auth integration:**
    - The Electron app already has Supabase auth (implied by your payment flow)
    - Pass the user's Supabase JWT token in the `Authorization` header when calling `/api/blur/analyze`
    - The Express backend validates the token using the existing `authenticateUser` middleware
    - Optionally: check subscription tier (free vs. Pro) before allowing blur analysis

14. **Add to backend `.env`:**
    - `RUNPOD_API_KEY=rp_xxxxxxxx`
    - `RUNPOD_ENDPOINT_ID=xxxxxxxx`

### Phase 6: Preload & IPC Updates

15. **No changes to `preload.js`** — the existing `analyzeBlur` and `onBlurProgress` channels remain unchanged. The migration is transparent to the renderer.

16. **Update `constants.js`** — Remove or deprecate `BLUR_THRESHOLDS`, `BLUR_EDGE_THRESHOLDS`, `BLUR_EDGE_PIXEL_THRESHOLD`, `BLUR_RESIZE_WIDTH`. Keep `BLUR_CONCURRENCY` (now controls batch upload concurrency instead of Sharp workers). Add:
    - `BLUR_AI_BATCH_SIZE = 20`
    - `BLUR_AI_TIMEOUT_MS = 60000` (60s timeout per batch, accounting for cold starts)

---

## Verification

- **Unit tests:** Add tests in `tests/blurDetectionService.test.js` — mock the HTTP call to the backend, verify correct batching, progress reporting, error handling (service down → disabled)
- **Integration test:** Run `ai-service/` locally with `runpod` test mode, send sample images, verify response shape
- **Training validation:** Run `evaluate.py` on held-out val set — target >90% accuracy, >85% precision (fewer false positives) before shipping
- **End-to-end:** Toggle blur detection on in the Electron app, select a folder with known blurry images, verify correct flagging and `_Blurry` folder creation
- **Failure mode:** Kill the backend → verify blur detection shows "unavailable" message, doesn't crash, batch execution continues without blur separation

---

## Decisions

- **RunPod Serverless** over always-on pod — pay-per-second, auto-scales to zero when idle
- **Proxy through Express backend** over direct Electron→RunPod — keeps API key secure, enables auth/rate limiting
- **MobileNetV3-Small** over larger models — fast inference (~5ms/image on GPU), small model file (~10MB), sufficient accuracy for binary blur classification
- **Synthetic dataset first** — lets you start training immediately without manual labeling; real data added incrementally
- **Batch processing (20 images/request)** over single — reduces cold start overhead and total API calls
- **Disable on failure** over Laplacian fallback — you explicitly don't want users to get inaccurate results
- **Sensitivity remapped to confidence threshold** — CNN outputs a probability, threshold determines how aggressive flagging is
