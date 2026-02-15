"""
FastAPI Blur Detection Server

Provides a REST API for batch blur detection using a fine-tuned MobileNetV3-Small CNN.
The Electron app sends base64-encoded images and receives blur predictions.

Endpoints:
    GET  /health   — Health check (model status)
    POST /analyze  — Batch blur analysis (up to 20 images per request)

Run locally:
    uvicorn main:app --reload --host 0.0.0.0 --port 8000
"""

import base64
import io
import time

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from PIL import Image

from model import BlurDetector

# ============================================================================
# APP SETUP
# ============================================================================

app = FastAPI(
    title='BatchMyPhotos AI — Blur Detection',
    version='1.0.0',
    description='Local AI service for blur detection in BatchMyPhotos',
)

# Allow Electron app to call from any origin during local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

# Load model at startup (stays in memory for fast inference)
detector = BlurDetector()

# ============================================================================
# REQUEST / RESPONSE MODELS
# ============================================================================

MAX_BATCH_SIZE = 20


class ImageItem(BaseModel):
    """Single image in a batch request."""
    baseName: str = Field(..., description='File group base name (e.g. "IMG_001")')
    data: str = Field(..., description='Base64-encoded image data')


class AnalyzeRequest(BaseModel):
    """Batch blur analysis request."""
    images: list[ImageItem] = Field(
        ...,
        min_length=1,
        max_length=MAX_BATCH_SIZE,
        description=f'Array of images to analyze (max {MAX_BATCH_SIZE})',
    )


class BlurResult(BaseModel):
    """Blur prediction for a single image."""
    score: float = Field(..., description='Blur probability (0.0–1.0)')
    isBlurry: bool = Field(..., description='True if image is classified as blurry')
    confidence: float = Field(..., description='Classification confidence (0.0–1.0)')


class AnalyzeResponse(BaseModel):
    """Batch blur analysis response."""
    results: dict[str, BlurResult] = Field(
        ..., description='Map of baseName → blur prediction'
    )
    processedCount: int = Field(..., description='Number of images successfully processed')
    elapsedMs: int = Field(..., description='Total inference time in milliseconds')


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    model_loaded: bool
    device: str


# ============================================================================
# ENDPOINTS
# ============================================================================

@app.get('/health', response_model=HealthResponse)
async def health():
    """Health check — returns model status and device info."""
    return HealthResponse(
        status='ok',
        model_loaded=detector.model_loaded,
        device=str(detector.device),
    )


@app.post('/analyze', response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest):
    """
    Analyze a batch of images for blur.

    Accepts up to 20 base64-encoded images. Each image is decoded, resized to
    224×224, and run through the MobileNetV3-Small CNN. Returns blur probability,
    classification, and confidence for each image.
    """
    start_time = time.time()

    # Decode all base64 images to PIL
    pil_images: list[Image.Image] = []
    base_names: list[str] = []
    errors: dict[str, str] = {}

    for item in request.images:
        try:
            image_bytes = base64.b64decode(item.data)
            pil_image = Image.open(io.BytesIO(image_bytes))
            pil_images.append(pil_image)
            base_names.append(item.baseName)
        except Exception as e:
            # Skip invalid images, record error
            errors[item.baseName] = str(e)

    if not pil_images:
        raise HTTPException(
            status_code=400,
            detail=f'No valid images could be decoded. Errors: {errors}',
        )

    # Run batch inference
    predictions = detector.predict_batch(pil_images)

    # Build results map
    results: dict[str, BlurResult] = {}
    for i, base_name in enumerate(base_names):
        pred = predictions[i]
        results[base_name] = BlurResult(
            score=pred['score'],
            isBlurry=pred['isBlurry'],
            confidence=pred['confidence'],
        )

    # Include errored images as score -1
    for base_name, error in errors.items():
        results[base_name] = BlurResult(
            score=-1.0,
            isBlurry=False,
            confidence=0.0,
        )

    elapsed_ms = int((time.time() - start_time) * 1000)

    return AnalyzeResponse(
        results=results,
        processedCount=len(pil_images),
        elapsedMs=elapsed_ms,
    )


# ============================================================================
# DEV ENTRY POINT
# ============================================================================

if __name__ == '__main__':
    import uvicorn
    uvicorn.run('main:app', host='0.0.0.0', port=8000, reload=True)
