"""
Model Evaluation Script

Evaluates the trained blur detection model on a validation set and prints
accuracy, precision, recall, F1 score, and confusion matrix.

Usage:
    python evaluate.py --data ../data/val --model ../models/best_model.pt
    python evaluate.py --data ../data/val  # uses default model path
"""

import argparse
import os
import sys

import torch
from torch.utils.data import DataLoader
from torchvision import datasets, transforms
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix,
    classification_report,
)

# Add parent to path for model import
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from model import build_model, INPUT_SIZE, IMAGENET_MEAN, IMAGENET_STD, MODEL_PATH

# ============================================================================
# EVALUATION
# ============================================================================

val_transform = transforms.Compose([
    transforms.Resize((INPUT_SIZE, INPUT_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
])


def evaluate(data_dir: str, model_path: str, batch_size: int = 32):
    """Run evaluation and print metrics."""
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f'🖥️  Device: {device}')

    # Load dataset
    if not os.path.isdir(data_dir):
        print(f'❌ Validation directory not found: {data_dir}')
        sys.exit(1)

    dataset = datasets.ImageFolder(data_dir, transform=val_transform)
    loader = DataLoader(
        dataset, batch_size=batch_size, shuffle=False,
        num_workers=2, pin_memory=True,
    )

    print(f'📊 Classes: {dataset.classes}')
    print(f'📊 Total samples: {len(dataset)}')

    # Load model
    model = build_model()
    if not os.path.exists(model_path):
        print(f'❌ Model file not found: {model_path}')
        sys.exit(1)

    state_dict = torch.load(model_path, map_location=device, weights_only=True)
    model.load_state_dict(state_dict)
    model.to(device)
    model.eval()
    print(f'✅ Loaded model from {model_path}')

    # Run inference
    all_predictions = []
    all_labels = []
    all_probs = []

    with torch.no_grad():
        for images, labels in loader:
            images = images.to(device)
            outputs = model(images)
            probs = torch.softmax(outputs, dim=1)
            _, predicted = outputs.max(1)

            all_predictions.extend(predicted.cpu().numpy())
            all_labels.extend(labels.numpy())
            all_probs.extend(probs[:, 0].cpu().numpy())  # blurry probability

    # Compute metrics
    accuracy = accuracy_score(all_labels, all_predictions)
    precision = precision_score(all_labels, all_predictions, average='binary', pos_label=0)
    recall = recall_score(all_labels, all_predictions, average='binary', pos_label=0)
    f1 = f1_score(all_labels, all_predictions, average='binary', pos_label=0)
    cm = confusion_matrix(all_labels, all_predictions)

    # Print results
    print(f'\n{"=" * 50}')
    print(f'EVALUATION RESULTS')
    print(f'{"=" * 50}')
    print(f'  Accuracy:  {accuracy:.4f}  ({accuracy * 100:.1f}%)')
    print(f'  Precision: {precision:.4f}  (blurry class)')
    print(f'  Recall:    {recall:.4f}  (blurry class)')
    print(f'  F1 Score:  {f1:.4f}')
    print()

    # Confusion matrix
    print('Confusion Matrix:')
    print(f'                    Predicted')
    print(f'                 Blurry  Sharp')
    print(f'  Actual Blurry   {cm[0][0]:5d}  {cm[0][1]:5d}')
    print(f'  Actual Sharp    {cm[1][0]:5d}  {cm[1][1]:5d}')
    print()

    # Full classification report
    print('Classification Report:')
    print(classification_report(
        all_labels, all_predictions,
        target_names=dataset.classes,
    ))

    # Check against targets
    print(f'{"=" * 50}')
    print('TARGET CHECK:')
    targets = {
        'Accuracy': (accuracy, 0.90),
        'Precision': (precision, 0.85),
        'Recall': (recall, 0.80),
    }
    all_pass = True
    for metric_name, (value, threshold) in targets.items():
        status = '✅ PASS' if value >= threshold else '❌ FAIL'
        if value < threshold:
            all_pass = False
        print(f'  {metric_name}: {value:.4f} (target: {threshold:.2f}) {status}')

    print()
    if all_pass:
        print('🎉 All targets met! Model is ready for production.')
    else:
        print('⚠️  Some targets not met. Consider more training data or epochs.')

    return accuracy, precision, recall, f1


# ============================================================================
# CLI
# ============================================================================

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Evaluate blur detection model')
    parser.add_argument(
        '--data', default=os.path.join(os.path.dirname(__file__), '..', 'data', 'val'),
        help='Path to validation data directory'
    )
    parser.add_argument(
        '--model', default=MODEL_PATH,
        help='Path to model weights file (.pt)'
    )
    parser.add_argument('--batch-size', type=int, default=32, help='Batch size')

    args = parser.parse_args()
    evaluate(args.data, args.model, args.batch_size)
