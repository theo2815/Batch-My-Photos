"""
Blur Detection Model — MobileNetV3-Small fine-tuned for binary classification.

Loads a pretrained MobileNetV3-Small backbone (ImageNet weights) and replaces
the classifier head for blurry vs. sharp classification.

Usage:
    from model import BlurDetector
    detector = BlurDetector()
    results = detector.predict_batch(pil_images)  # list of PIL Images
"""

import os
import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image

# ============================================================================
# CONSTANTS
# ============================================================================

MODEL_DIR = os.path.join(os.path.dirname(__file__), 'models')
MODEL_PATH = os.path.join(MODEL_DIR, 'best_model.pt')

# MobileNetV3-Small input requirements
INPUT_SIZE = 224
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]

# Class labels
CLASSES = ['blurry', 'sharp']

# ============================================================================
# PREPROCESSING
# ============================================================================

inference_transform = transforms.Compose([
    transforms.Resize((INPUT_SIZE, INPUT_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
])


# ============================================================================
# MODEL
# ============================================================================

def build_model() -> nn.Module:
    """
    Build a MobileNetV3-Small model with a 2-class classifier head.

    The backbone is pretrained on ImageNet. The final classifier is replaced
    with a new Linear layer for binary blur classification.
    """
    model = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.IMAGENET1K_V1)

    # MobileNetV3-Small classifier structure:
    #   classifier = Sequential(
    #     Linear(576, 1024),
    #     Hardswish(),
    #     Dropout(0.2),
    #     Linear(1024, 1000),  ← replace this
    #   )
    in_features = model.classifier[-1].in_features  # 1024
    model.classifier[-1] = nn.Linear(in_features, len(CLASSES))

    return model


class BlurDetector:
    """
    Blur detection inference engine.

    Loads the fine-tuned MobileNetV3-Small model and provides batch prediction.
    Automatically uses GPU if available, otherwise falls back to CPU.
    """

    def __init__(self):
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.model = build_model()
        self.model_loaded = False

        # Try to load fine-tuned weights
        if os.path.exists(MODEL_PATH):
            try:
                state_dict = torch.load(MODEL_PATH, map_location=self.device, weights_only=True)
                self.model.load_state_dict(state_dict)
                self.model_loaded = True
                print(f'✅ [MODEL] Loaded fine-tuned model from {MODEL_PATH}')
            except Exception as e:
                print(f'⚠️ [MODEL] Failed to load {MODEL_PATH}: {e}')
                print('⚠️ [MODEL] Using pretrained backbone with untrained classifier head')
        else:
            print(f'ℹ️ [MODEL] No fine-tuned model found at {MODEL_PATH}')
            print('ℹ️ [MODEL] Using pretrained backbone with untrained classifier head')
            print('ℹ️ [MODEL] Run training/train.py to create a fine-tuned model')

        self.model.to(self.device)
        self.model.eval()

    def predict_batch(self, images: list[Image.Image]) -> list[dict]:
        """
        Run inference on a batch of PIL images.

        Args:
            images: List of PIL Image objects (any size, will be resized)

        Returns:
            List of dicts with keys:
                - score: float (0.0–1.0) — probability of being blurry
                - isBlurry: bool — True if score > 0.5
                - confidence: float (0.0–1.0) — max(blurry_prob, sharp_prob)
        """
        if not images:
            return []

        # Preprocess all images into a single batch tensor
        tensors = []
        for img in images:
            # Convert to RGB if needed (handles RGBA, grayscale, etc.)
            if img.mode != 'RGB':
                img = img.convert('RGB')
            tensors.append(inference_transform(img))

        batch = torch.stack(tensors).to(self.device)

        # Forward pass (no gradient computation)
        with torch.no_grad():
            logits = self.model(batch)
            probabilities = torch.softmax(logits, dim=1)

        # Parse results: index 0 = blurry, index 1 = sharp
        results = []
        for i in range(len(images)):
            blurry_prob = probabilities[i, 0].item()
            sharp_prob = probabilities[i, 1].item()

            results.append({
                'score': round(blurry_prob, 4),
                'isBlurry': blurry_prob > 0.5,
                'confidence': round(max(blurry_prob, sharp_prob), 4),
            })

        return results

    def predict_single(self, image: Image.Image) -> dict:
        """Run inference on a single PIL image. Convenience wrapper."""
        return self.predict_batch([image])[0]
