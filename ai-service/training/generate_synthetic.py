"""
Advanced Blur Dataset Generator for Portrait Photography

Generates a training dataset from your sharp portrait photos that teaches the model to
distinguish between:
  ✅ GOOD: Sharp subject with bokeh background (your portraits) — labeled "sharp"
  ❌ BAD:  Out-of-focus subject (subject blurry, background sharp) — labeled "blurry"
  ❌ BAD:  Entire image blur (global Gaussian/defocus) — labeled "blurry"
  ❌ BAD:  Motion blur (camera shake / subject movement) — labeled "blurry"

Blur types applied:
  1. gaussian     — full-image Gaussian blur (camera out of focus)
  2. motion       — directional blur (camera shake / subject movement)
  3. defocus      — full-image disk/bokeh blur (lens defocus)
  4. subject_blur — blurs only the center/subject region, keeps background
                    (simulates focusing on background instead of subject)

Usage:
    python generate_synthetic.py --input "C:\\path\\to\\sharp\\portraits"
    python generate_synthetic.py --input "C:\\path\\to\\photos" --output ../data --blur-per-image 3

With 1,929 photos and 3 blurs per image → ~1,929 sharp + ~5,787 blurry = ~7,716 total
"""

import argparse
import os
import random
import sys
import time

import numpy as np
from PIL import Image, ImageFilter, ImageDraw

# ============================================================================
# BLUR GENERATORS
# ============================================================================

def apply_gaussian_blur(image: Image.Image, strength: str) -> Image.Image:
    """Apply full-image Gaussian blur — simulates entire image out of focus."""
    radius_map = {
        'light': random.uniform(2.0, 4.0),
        'medium': random.uniform(4.0, 8.0),
        'heavy': random.uniform(8.0, 14.0),
    }
    radius = radius_map[strength]
    return image.filter(ImageFilter.GaussianBlur(radius=radius))


def apply_motion_blur(image: Image.Image, strength: str) -> Image.Image:
    """Apply directional motion blur — simulates camera shake or subject movement."""
    size_map = {
        'light': random.randint(5, 10),
        'medium': random.randint(10, 20),
        'heavy': random.randint(20, 40),
    }
    length = size_map[strength]
    angle = random.uniform(0, 180)

    # Create motion blur by shifting and averaging the image
    # This avoids PIL kernel size limitations
    angle_rad = np.radians(angle)
    dx = np.cos(angle_rad)
    dy = np.sin(angle_rad)

    img_array = np.array(image, dtype=np.float64)
    result = np.zeros_like(img_array)
    
    num_steps = length
    for i in range(num_steps):
        offset = i - num_steps // 2
        shift_x = int(round(offset * dx))
        shift_y = int(round(offset * dy))
        shifted = np.roll(np.roll(img_array, shift_x, axis=1), shift_y, axis=0)
        result += shifted
    
    result /= num_steps
    result = np.clip(result, 0, 255).astype(np.uint8)
    return Image.fromarray(result)


def apply_defocus_blur(image: Image.Image, strength: str) -> Image.Image:
    """Apply defocus (disk) blur — simulates lens completely out of focus."""
    radius_map = {
        'light': random.uniform(2.5, 5.0),
        'medium': random.uniform(5.0, 10.0),
        'heavy': random.uniform(10.0, 18.0),
    }
    radius = radius_map[strength]
    return image.filter(ImageFilter.GaussianBlur(radius=radius))


def _create_subject_mask(width: int, height: int, coverage: float = 0.5,
                          offset_x: float = 0.0, offset_y: float = 0.0) -> Image.Image:
    """
    Create a smooth elliptical mask targeting the subject area.

    The mask is white (255) at the center/subject and fades to black (0) at edges.
    This is used to selectively blur just the subject region.

    Args:
        width, height: Image dimensions
        coverage: How much of the image the subject occupies (0.3–0.7)
        offset_x, offset_y: Shift the center (-0.2 to 0.2 range)
    """
    # Create coordinate grids
    y_coords = np.linspace(-1, 1, height)
    x_coords = np.linspace(-1, 1, width)
    xx, yy = np.meshgrid(x_coords, y_coords)

    # Shift center
    xx = xx - offset_x
    yy = yy - offset_y

    # Elliptical distance (subject area)
    # coverage controls the radius — larger = bigger subject area
    rx = coverage * random.uniform(0.8, 1.2)  # slight randomization
    ry = coverage * random.uniform(0.9, 1.3)  # portraits tend to be taller
    dist = (xx / rx) ** 2 + (yy / ry) ** 2

    # Smooth falloff using sigmoid-like function
    # Values close to 0 at center → 1.0 (fully blurred subject)
    # Values far from center → 0.0 (keep background)
    steepness = random.uniform(3.0, 6.0)
    mask = 1.0 / (1.0 + np.exp(steepness * (dist - 1.0)))

    # Convert to PIL grayscale image (0-255)
    mask_uint8 = (mask * 255).astype(np.uint8)
    return Image.fromarray(mask_uint8, mode='L')


def apply_subject_blur(image: Image.Image, strength: str) -> Image.Image:
    """
    Blur only the subject (center) region while keeping the background sharp.

    This simulates the camera focusing on the background instead of the subject —
    the exact opposite of a good portrait. Teaches the model that a blurry subject
    is a BAD photo even if the background is sharp.
    """
    blur_radius_map = {
        'light': random.uniform(3.0, 6.0),
        'medium': random.uniform(6.0, 12.0),
        'heavy': random.uniform(12.0, 20.0),
    }
    blur_radius = blur_radius_map[strength]

    # Subject coverage varies — sometimes tighter, sometimes wider framing
    coverage = random.uniform(0.35, 0.65)

    # Slight random offset to simulate subject not perfectly centered
    offset_x = random.uniform(-0.15, 0.15)
    offset_y = random.uniform(-0.15, 0.15)

    # Create the subject mask
    mask = _create_subject_mask(image.width, image.height, coverage, offset_x, offset_y)

    # Create fully blurred version of the image
    blurred = image.filter(ImageFilter.GaussianBlur(radius=blur_radius))

    # Composite: blend blurred subject with sharp background using mask
    # Where mask is white (subject) → use blurred; where black (background) → use original
    result = Image.composite(blurred, image, mask)

    return result


# All blur types and their generators
BLUR_TYPES = {
    'gaussian': apply_gaussian_blur,
    'motion': apply_motion_blur,
    'defocus': apply_defocus_blur,
    'subject_blur': apply_subject_blur,
}

# Global blur types (applied to entire image)
GLOBAL_BLUR_TYPES = ['gaussian', 'motion', 'defocus']

STRENGTHS = ['light', 'medium', 'heavy']

SUPPORTED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.bmp'}


# ============================================================================
# DATASET GENERATION
# ============================================================================

def find_images(input_dir: str) -> list[str]:
    """Find all supported image files in a directory (recursive)."""
    images = []
    for root, _dirs, files in os.walk(input_dir):
        for filename in files:
            ext = os.path.splitext(filename)[1].lower()
            if ext in SUPPORTED_EXTENSIONS:
                images.append(os.path.join(root, filename))
    return sorted(images)


def generate_dataset(input_dir: str, output_dir: str, blur_per_image: int = 3,
                     target_count: int = 0, ensure_subject_blur: bool = True):
    """
    Generate advanced blur dataset for portrait photography.

    For each sharp image:
    - Copy original to sharp/ (portrait with bokeh = GOOD photo)
    - Generate N blurry versions to blurry/ (global blur + subject blur = BAD photos)

    The model learns:
    - Bokeh background is NORMAL (your portraits are labeled sharp)
    - Blurry subject is BAD (subject_blur creates this)
    - Full-image blur is BAD (gaussian/motion/defocus creates this)

    Args:
        input_dir: Folder containing sharp portrait photos
        output_dir: Output root (creates train/ and val/ subdirectories)
        blur_per_image: Number of blurry variants per image (default: 3)
        target_count: Max total blurry images (0 = no limit)
        ensure_subject_blur: Always include at least 1 subject_blur per image
    """
    image_paths = find_images(input_dir)
    if not image_paths:
        print(f'❌ No supported images found in {input_dir}')
        sys.exit(1)

    print(f'📁 Found {len(image_paths)} images in {input_dir}')
    print(f'🔧 Blur types: {", ".join(BLUR_TYPES.keys())}')
    print(f'🔧 Blurry variants per image: {blur_per_image}')
    print(f'🔧 Ensure subject blur per image: {ensure_subject_blur}')

    expected_sharp = len(image_paths)
    expected_blurry = len(image_paths) * blur_per_image
    print(f'📊 Expected output: ~{expected_sharp} sharp + ~{expected_blurry} blurry = ~{expected_sharp + expected_blurry} total')

    # Create output directories
    dirs = {
        'train_sharp': os.path.join(output_dir, 'train', 'sharp'),
        'train_blurry': os.path.join(output_dir, 'train', 'blurry'),
        'val_sharp': os.path.join(output_dir, 'val', 'sharp'),
        'val_blurry': os.path.join(output_dir, 'val', 'blurry'),
    }
    for d in dirs.values():
        os.makedirs(d, exist_ok=True)

    # 80/20 train/val split
    random.shuffle(image_paths)
    split_idx = int(len(image_paths) * 0.8)
    train_images = image_paths[:split_idx]
    val_images = image_paths[split_idx:]

    print(f'📊 Split: {len(train_images)} train, {len(val_images)} val\n')

    total_generated = 0
    total_skipped = 0
    blur_type_counts = {bt: 0 for bt in BLUR_TYPES}
    start_time = time.time()

    for split_name, split_images in [('train', train_images), ('val', val_images)]:
        sharp_dir = dirs[f'{split_name}_sharp']
        blurry_dir = dirs[f'{split_name}_blurry']

        for i, img_path in enumerate(split_images):
            filename = os.path.basename(img_path)
            name, ext = os.path.splitext(filename)

            try:
                img = Image.open(img_path).convert('RGB')

                # Resize large images to max 1024px on longest side for faster training
                max_dim = max(img.width, img.height)
                if max_dim > 1024:
                    ratio = 1024 / max_dim
                    new_size = (int(img.width * ratio), int(img.height * ratio))
                    img = img.resize(new_size, Image.LANCZOS)

                # Save sharp copy (original portrait = GOOD)
                sharp_path = os.path.join(sharp_dir, filename)
                img.save(sharp_path, quality=95)

                # Select blur types for this image
                blur_selections = _select_blur_types(blur_per_image, ensure_subject_blur)

                # Generate blurry versions
                for blur_type in blur_selections:
                    blur_fn = BLUR_TYPES[blur_type]
                    strength = random.choice(STRENGTHS)

                    blurry_img = blur_fn(img, strength)
                    blurry_filename = f'{name}_{blur_type}_{strength}{ext}'
                    blurry_path = os.path.join(blurry_dir, blurry_filename)
                    blurry_img.save(blurry_path, quality=95)

                    total_generated += 1
                    blur_type_counts[blur_type] += 1

                    if target_count > 0 and total_generated >= target_count:
                        break

                # Progress report every 100 images
                if (i + 1) % 100 == 0 or i == 0:
                    elapsed = time.time() - start_time
                    rate = (total_generated) / max(elapsed, 1)
                    print(f'  [{split_name}] {i + 1}/{len(split_images)} images '
                          f'| {total_generated} blurry generated '
                          f'| {rate:.1f} imgs/sec')

            except Exception as e:
                print(f'  ⚠️ Skipping {filename}: {e}')
                total_skipped += 1
                continue

            if target_count > 0 and total_generated >= target_count:
                break

    # Final stats
    elapsed = time.time() - start_time
    train_sharp_count = len(os.listdir(dirs['train_sharp']))
    train_blurry_count = len(os.listdir(dirs['train_blurry']))
    val_sharp_count = len(os.listdir(dirs['val_sharp']))
    val_blurry_count = len(os.listdir(dirs['val_blurry']))

    print(f'\n{"=" * 55}')
    print(f'✅ Dataset generated in {elapsed:.1f}s')
    print(f'{"=" * 55}')
    print(f'   Train: {train_sharp_count} sharp, {train_blurry_count} blurry')
    print(f'   Val:   {val_sharp_count} sharp, {val_blurry_count} blurry')
    print(f'   Total: {train_sharp_count + val_sharp_count} sharp, '
          f'{train_blurry_count + val_blurry_count} blurry')
    print(f'   Skipped: {total_skipped} images')
    print(f'\n   Blur type distribution:')
    for bt, count in blur_type_counts.items():
        pct = (count / max(total_generated, 1)) * 100
        print(f'     {bt:15s}: {count:5d} ({pct:.1f}%)')
    print(f'\n   Output: {os.path.abspath(output_dir)}')


def _select_blur_types(count: int, ensure_subject: bool) -> list[str]:
    """
    Select which blur types to apply to an image.

    If ensure_subject=True, always include at least one subject_blur.
    Remaining slots are filled randomly from all blur types.
    """
    all_types = list(BLUR_TYPES.keys())

    if ensure_subject and count >= 2:
        # Always include subject_blur, fill rest randomly
        selections = ['subject_blur']
        remaining = [t for t in all_types if t != 'subject_blur']
        for _ in range(count - 1):
            selections.append(random.choice(remaining))
    else:
        # Fully random selection
        selections = [random.choice(all_types) for _ in range(count)]

    return selections


# ============================================================================
# CLI
# ============================================================================

if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Generate advanced blur dataset from portrait photos.\n\n'
                    'Creates training data with 4 blur types:\n'
                    '  - gaussian: full-image Gaussian blur\n'
                    '  - motion: directional camera shake blur\n'
                    '  - defocus: full-image defocus blur\n'
                    '  - subject_blur: blurs subject center, keeps background sharp\n',
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        '--input', required=True,
        help='Path to folder containing sharp photos (scanned recursively)'
    )
    parser.add_argument(
        '--output', default=os.path.join(os.path.dirname(__file__), '..', 'data'),
        help='Output directory for dataset (default: ../data)'
    )
    parser.add_argument(
        '--blur-per-image', type=int, default=3,
        help='Number of blurry variants per sharp image (default: 3). '
             'With 1929 images: 3 → ~5787 blurry, 4 → ~7716 blurry'
    )
    parser.add_argument(
        '--count', type=int, default=0,
        help='Max total blurry images to generate (0 = no limit)'
    )
    parser.add_argument(
        '--no-subject-blur', action='store_true',
        help='Disable guaranteed subject_blur per image (fully random selection)'
    )
    parser.add_argument(
        '--seed', type=int, default=42,
        help='Random seed for reproducibility'
    )

    args = parser.parse_args()

    random.seed(args.seed)
    np.random.seed(args.seed)

    generate_dataset(
        input_dir=args.input,
        output_dir=args.output,
        blur_per_image=args.blur_per_image,
        target_count=args.count,
        ensure_subject_blur=not args.no_subject_blur,
    )
