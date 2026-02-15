"""
MobileNetV3-Small Fine-Tuning for Blur Detection

Two-phase training strategy:
  Phase 1 (Head-only): Freeze backbone, train classifier head (10 epochs, lr=1e-3)
  Phase 2 (End-to-end): Unfreeze all layers, fine-tune (20 epochs, lr=1e-5)

Data augmentation: random resized crop, horizontal flip, color jitter, random rotation.

Usage:
    python train.py --data ../data --epochs 30
    python train.py --data ../data --epochs 30 --batch-size 32 --lr 1e-3
"""

import argparse
import os
import time

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
from torchvision import datasets, transforms

# Add parent to path for model import
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from model import build_model, INPUT_SIZE, IMAGENET_MEAN, IMAGENET_STD, MODEL_DIR

# ============================================================================
# DATA TRANSFORMS
# ============================================================================

train_transform = transforms.Compose([
    transforms.RandomResizedCrop(INPUT_SIZE, scale=(0.7, 1.0)),
    transforms.RandomHorizontalFlip(),
    transforms.RandomRotation(15),
    transforms.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.2, hue=0.1),
    transforms.ToTensor(),
    transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
])

val_transform = transforms.Compose([
    transforms.Resize((INPUT_SIZE, INPUT_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
])


# ============================================================================
# TRAINING
# ============================================================================

def train_one_epoch(model, loader, criterion, optimizer, device) -> tuple[float, float]:
    """Train for one epoch. Returns (avg_loss, accuracy)."""
    model.train()
    running_loss = 0.0
    correct = 0
    total = 0

    for images, labels in loader:
        images, labels = images.to(device), labels.to(device)

        optimizer.zero_grad()
        outputs = model(images)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()

        running_loss += loss.item() * images.size(0)
        _, predicted = outputs.max(1)
        total += labels.size(0)
        correct += predicted.eq(labels).sum().item()

    avg_loss = running_loss / total
    accuracy = correct / total
    return avg_loss, accuracy


def validate(model, loader, criterion, device) -> tuple[float, float]:
    """Validate model. Returns (avg_loss, accuracy)."""
    model.eval()
    running_loss = 0.0
    correct = 0
    total = 0

    with torch.no_grad():
        for images, labels in loader:
            images, labels = images.to(device), labels.to(device)
            outputs = model(images)
            loss = criterion(outputs, labels)

            running_loss += loss.item() * images.size(0)
            _, predicted = outputs.max(1)
            total += labels.size(0)
            correct += predicted.eq(labels).sum().item()

    avg_loss = running_loss / total
    accuracy = correct / total
    return avg_loss, accuracy


def train(data_dir: str, epochs: int, batch_size: int, lr: float, head_epochs: int):
    """
    Train the blur detection model in two phases.

    Phase 1: Freeze backbone, train head only (fast convergence)
    Phase 2: Unfreeze all, fine-tune end-to-end (better accuracy)
    """
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f'🖥️  Device: {device}')

    # ── Data Loading ──────────────────────────────────────────────────────
    train_dir = os.path.join(data_dir, 'train')
    val_dir = os.path.join(data_dir, 'val')

    if not os.path.isdir(train_dir):
        print(f'❌ Training directory not found: {train_dir}')
        sys.exit(1)

    train_dataset = datasets.ImageFolder(train_dir, transform=train_transform)
    val_dataset = datasets.ImageFolder(val_dir, transform=val_transform) if os.path.isdir(val_dir) else None

    print(f'📊 Classes: {train_dataset.classes}')
    print(f'📊 Training samples: {len(train_dataset)}')
    if val_dataset:
        print(f'📊 Validation samples: {len(val_dataset)}')

    # Verify class order matches our expected [blurry=0, sharp=1]
    if train_dataset.classes != ['blurry', 'sharp']:
        print(f'⚠️  Warning: Expected classes [blurry, sharp], got {train_dataset.classes}')
        print('   Make sure your data directory has blurry/ and sharp/ subdirectories')

    # Compute class weights to handle imbalanced dataset (e.g., 3:1 blurry:sharp)
    class_counts = [0] * len(train_dataset.classes)
    for _, label in train_dataset.samples:
        class_counts[label] += 1
    total = sum(class_counts)
    class_weights = torch.tensor(
        [total / (len(class_counts) * c) for c in class_counts],
        dtype=torch.float32
    ).to(device)
    print(f'📊 Class distribution: {dict(zip(train_dataset.classes, class_counts))}')
    print(f'📊 Class weights: {dict(zip(train_dataset.classes, [f"{w:.3f}" for w in class_weights.tolist()]))}')

    # Use num_workers=0 on Windows/CPU to avoid multiprocessing issues
    use_cuda = device.type == 'cuda'
    num_workers = 4 if use_cuda else 0
    val_workers = 2 if use_cuda else 0

    train_loader = DataLoader(
        train_dataset, batch_size=batch_size, shuffle=True,
        num_workers=num_workers, pin_memory=use_cuda,
        persistent_workers=num_workers > 0,
    )
    val_loader = None
    if val_dataset:
        val_loader = DataLoader(
            val_dataset, batch_size=batch_size, shuffle=False,
            num_workers=val_workers, pin_memory=use_cuda,
            persistent_workers=val_workers > 0,
        )

    # ── Model ─────────────────────────────────────────────────────────────
    model = build_model()
    model.to(device)
    criterion = nn.CrossEntropyLoss(weight=class_weights)

    best_val_acc = 0.0
    os.makedirs(MODEL_DIR, exist_ok=True)
    save_path = os.path.join(MODEL_DIR, 'best_model.pt')

    # ── Phase 1: Head-only training ───────────────────────────────────────
    print(f'\n{"=" * 60}')
    print(f'Phase 1: Head-only training ({head_epochs} epochs, lr={lr})')
    print(f'{"=" * 60}')

    # Freeze backbone
    for param in model.features.parameters():
        param.requires_grad = False

    optimizer = optim.Adam(
        filter(lambda p: p.requires_grad, model.parameters()),
        lr=lr, weight_decay=1e-4,
    )

    for epoch in range(1, head_epochs + 1):
        start = time.time()
        train_loss, train_acc = train_one_epoch(model, train_loader, criterion, optimizer, device)
        elapsed = time.time() - start

        log = f'  Epoch {epoch:3d}/{head_epochs} | Loss: {train_loss:.4f} | Acc: {train_acc:.4f} | Time: {elapsed:.1f}s'

        if val_loader:
            val_loss, val_acc = validate(model, val_loader, criterion, device)
            log += f' | Val Loss: {val_loss:.4f} | Val Acc: {val_acc:.4f}'

            if val_acc > best_val_acc:
                best_val_acc = val_acc
                torch.save(model.state_dict(), save_path)
                log += ' ★'
        else:
            # Save latest if no validation set
            torch.save(model.state_dict(), save_path)

        print(log)

    # ── Phase 2: End-to-end fine-tuning ───────────────────────────────────
    e2e_epochs = epochs - head_epochs
    if e2e_epochs <= 0:
        print('\n✅ Training complete (head-only phase only)')
        print(f'   Best val accuracy: {best_val_acc:.4f}')
        print(f'   Model saved to: {save_path}')
        return

    print(f'\n{"=" * 60}')
    print(f'Phase 2: End-to-end fine-tuning ({e2e_epochs} epochs, lr={lr / 100})')
    print(f'{"=" * 60}')

    # Unfreeze all layers
    for param in model.parameters():
        param.requires_grad = True

    optimizer = optim.Adam(model.parameters(), lr=lr / 100, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=e2e_epochs)

    for epoch in range(1, e2e_epochs + 1):
        start = time.time()
        train_loss, train_acc = train_one_epoch(model, train_loader, criterion, optimizer, device)
        scheduler.step()
        elapsed = time.time() - start

        log = f'  Epoch {epoch:3d}/{e2e_epochs} | Loss: {train_loss:.4f} | Acc: {train_acc:.4f} | Time: {elapsed:.1f}s'

        if val_loader:
            val_loss, val_acc = validate(model, val_loader, criterion, device)
            log += f' | Val Loss: {val_loss:.4f} | Val Acc: {val_acc:.4f}'

            if val_acc > best_val_acc:
                best_val_acc = val_acc
                torch.save(model.state_dict(), save_path)
                log += ' ★'
        else:
            torch.save(model.state_dict(), save_path)

        print(log)

    print(f'\n✅ Training complete!')
    print(f'   Best val accuracy: {best_val_acc:.4f}')
    print(f'   Model saved to: {save_path}')


# ============================================================================
# CLI
# ============================================================================

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Train blur detection model')
    parser.add_argument(
        '--data', default=os.path.join(os.path.dirname(__file__), '..', 'data'),
        help='Path to dataset root with train/ and val/ subdirectories'
    )
    parser.add_argument('--epochs', type=int, default=30, help='Total epochs (default: 30)')
    parser.add_argument('--head-epochs', type=int, default=10, help='Head-only epochs (default: 10)')
    parser.add_argument('--batch-size', type=int, default=32, help='Batch size (default: 32)')
    parser.add_argument('--lr', type=float, default=1e-3, help='Initial learning rate (default: 1e-3)')

    args = parser.parse_args()

    train(args.data, args.epochs, args.batch_size, args.lr, args.head_epochs)
