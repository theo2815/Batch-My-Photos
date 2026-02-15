"""
Dataset Preparation Script

Organizes raw labeled images into a train/val directory structure
suitable for PyTorch's ImageFolder loader.

Expected input structure:
    input_dir/
    ├── blurry/     # blurry images
    └── sharp/      # sharp images

Output structure:
    output_dir/
    ├── train/
    │   ├── blurry/
    │   └── sharp/
    └── val/
        ├── blurry/
        └── sharp/

Usage:
    python prepare_dataset.py --input /path/to/labeled --output ../data
    python prepare_dataset.py --input /path/to/labeled --output ../data --split 0.8
"""

import argparse
import os
import random
import shutil
import sys

SUPPORTED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.bmp'}


def find_images(directory: str) -> list[str]:
    """Find all supported image files in a directory."""
    images = []
    for filename in os.listdir(directory):
        ext = os.path.splitext(filename)[1].lower()
        if ext in SUPPORTED_EXTENSIONS:
            images.append(os.path.join(directory, filename))
    return sorted(images)


def prepare_dataset(input_dir: str, output_dir: str, split_ratio: float = 0.8):
    """
    Split labeled images into train/val sets.

    Args:
        input_dir: Root with blurry/ and sharp/ subdirectories
        output_dir: Output root for train/val splits
        split_ratio: Fraction of images for training (default: 0.8)
    """
    blurry_dir = os.path.join(input_dir, 'blurry')
    sharp_dir = os.path.join(input_dir, 'sharp')

    if not os.path.isdir(blurry_dir):
        print(f'❌ Missing directory: {blurry_dir}')
        sys.exit(1)
    if not os.path.isdir(sharp_dir):
        print(f'❌ Missing directory: {sharp_dir}')
        sys.exit(1)

    blurry_images = find_images(blurry_dir)
    sharp_images = find_images(sharp_dir)

    print(f'📁 Found {len(blurry_images)} blurry, {len(sharp_images)} sharp images')

    if not blurry_images or not sharp_images:
        print('❌ Both blurry/ and sharp/ must contain images')
        sys.exit(1)

    # Create output directories
    dirs = {}
    for split in ['train', 'val']:
        for label in ['blurry', 'sharp']:
            key = f'{split}_{label}'
            dirs[key] = os.path.join(output_dir, split, label)
            os.makedirs(dirs[key], exist_ok=True)

    # Shuffle and split each class independently
    for label, images in [('blurry', blurry_images), ('sharp', sharp_images)]:
        random.shuffle(images)
        split_idx = int(len(images) * split_ratio)

        train_set = images[:split_idx]
        val_set = images[split_idx:]

        # Copy to train
        for img_path in train_set:
            dest = os.path.join(dirs[f'train_{label}'], os.path.basename(img_path))
            shutil.copy2(img_path, dest)

        # Copy to val
        for img_path in val_set:
            dest = os.path.join(dirs[f'val_{label}'], os.path.basename(img_path))
            shutil.copy2(img_path, dest)

        print(f'  {label}: {len(train_set)} train, {len(val_set)} val')

    print(f'\n✅ Dataset prepared at {output_dir}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Prepare labeled images into train/val splits'
    )
    parser.add_argument(
        '--input', required=True,
        help='Path to directory with blurry/ and sharp/ subdirectories'
    )
    parser.add_argument(
        '--output', default=os.path.join(os.path.dirname(__file__), '..', 'data'),
        help='Output directory (default: ../data)'
    )
    parser.add_argument(
        '--split', type=float, default=0.8,
        help='Train/val split ratio (default: 0.8)'
    )
    parser.add_argument(
        '--seed', type=int, default=42,
        help='Random seed for reproducibility'
    )

    args = parser.parse_args()
    random.seed(args.seed)
    prepare_dataset(args.input, args.output, args.split)
