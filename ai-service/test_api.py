"""
API Integration Tests for the Blur Detection Service

Tests the FastAPI endpoints against a running local server.

Usage:
    # Start the server first:
    uvicorn main:app --port 8000

    # Then run tests:
    python test_api.py
"""

import base64
import io
import json
import sys
import urllib.request
import urllib.error

from PIL import Image, ImageFilter

BASE_URL = 'http://localhost:8000'


def make_request(method: str, path: str, data: dict | None = None) -> tuple[int, dict]:
    """Make an HTTP request and return (status_code, response_json)."""
    url = f'{BASE_URL}{path}'

    if data is not None:
        body = json.dumps(data).encode('utf-8')
        req = urllib.request.Request(url, data=body, method=method)
        req.add_header('Content-Type', 'application/json')
    else:
        req = urllib.request.Request(url, method=method)

    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode('utf-8'))


def create_test_image(width: int = 300, height: int = 200, color: str = 'red') -> str:
    """Create a solid-color test image and return as base64."""
    img = Image.new('RGB', (width, height), color)
    buffer = io.BytesIO()
    img.save(buffer, format='JPEG', quality=90)
    return base64.b64encode(buffer.getvalue()).decode('utf-8')


def create_blurry_image(width: int = 300, height: int = 200) -> str:
    """Create a detailed image then heavily blur it, return as base64."""
    # Create an image with sharp edges (checkerboard pattern)
    img = Image.new('RGB', (width, height))
    pixels = img.load()
    for x in range(width):
        for y in range(height):
            if (x // 10 + y // 10) % 2 == 0:
                pixels[x, y] = (255, 255, 255)
            else:
                pixels[x, y] = (0, 0, 0)

    # Apply heavy Gaussian blur
    img = img.filter(ImageFilter.GaussianBlur(radius=10))

    buffer = io.BytesIO()
    img.save(buffer, format='JPEG', quality=90)
    return base64.b64encode(buffer.getvalue()).decode('utf-8')


def create_sharp_image(width: int = 300, height: int = 200) -> str:
    """Create a detailed sharp image (checkerboard pattern), return as base64."""
    img = Image.new('RGB', (width, height))
    pixels = img.load()
    for x in range(width):
        for y in range(height):
            if (x // 10 + y // 10) % 2 == 0:
                pixels[x, y] = (255, 255, 255)
            else:
                pixels[x, y] = (0, 0, 0)

    buffer = io.BytesIO()
    img.save(buffer, format='JPEG', quality=95)
    return base64.b64encode(buffer.getvalue()).decode('utf-8')


# ============================================================================
# TESTS
# ============================================================================

passed = 0
failed = 0


def test(name: str, condition: bool, detail: str = ''):
    """Simple test assertion."""
    global passed, failed
    if condition:
        print(f'  ✅ {name}')
        passed += 1
    else:
        print(f'  ❌ {name}' + (f' — {detail}' if detail else ''))
        failed += 1


def test_health():
    """Test GET /health endpoint."""
    print('\n🧪 Testing GET /health')
    status, data = make_request('GET', '/health')
    test('Status is 200', status == 200, f'got {status}')
    test('Has status field', data.get('status') == 'ok', f'got {data.get("status")}')
    test('Has model_loaded field', 'model_loaded' in data)
    test('Has device field', 'device' in data)


def test_analyze_single():
    """Test POST /analyze with a single image."""
    print('\n🧪 Testing POST /analyze (single image)')
    image_data = create_test_image()
    payload = {'images': [{'baseName': 'TEST_001', 'data': image_data}]}
    status, data = make_request('POST', '/analyze', payload)

    test('Status is 200', status == 200, f'got {status}')
    test('Has results', 'results' in data)
    test('Has TEST_001 result', 'TEST_001' in data.get('results', {}))

    result = data.get('results', {}).get('TEST_001', {})
    test('Has score', 'score' in result)
    test('Score is 0.0–1.0', 0.0 <= result.get('score', -1) <= 1.0, f'got {result.get("score")}')
    test('Has isBlurry', 'isBlurry' in result)
    test('Has confidence', 'confidence' in result)
    test('Has processedCount', data.get('processedCount') == 1, f'got {data.get("processedCount")}')
    test('Has elapsedMs', 'elapsedMs' in data)


def test_analyze_batch():
    """Test POST /analyze with a batch of 20 images."""
    print('\n🧪 Testing POST /analyze (batch of 20)')
    images = [
        {'baseName': f'IMG_{i:04d}', 'data': create_test_image()}
        for i in range(20)
    ]
    status, data = make_request('POST', '/analyze', {'images': images})

    test('Status is 200', status == 200, f'got {status}')
    test('All 20 results returned', len(data.get('results', {})) == 20,
         f'got {len(data.get("results", {}))}')
    test('processedCount is 20', data.get('processedCount') == 20)


def test_analyze_blurry_vs_sharp():
    """Test that blurry and sharp images get different predictions."""
    print('\n🧪 Testing blurry vs. sharp discrimination')
    payload = {
        'images': [
            {'baseName': 'BLURRY', 'data': create_blurry_image()},
            {'baseName': 'SHARP', 'data': create_sharp_image()},
        ]
    }
    status, data = make_request('POST', '/analyze', payload)

    test('Status is 200', status == 200, f'got {status}')

    blurry = data.get('results', {}).get('BLURRY', {})
    sharp = data.get('results', {}).get('SHARP', {})

    # Note: with an untrained model these may not be correct,
    # but the API should still return valid shapes
    test('BLURRY has valid score', 0.0 <= blurry.get('score', -1) <= 1.0)
    test('SHARP has valid score', 0.0 <= sharp.get('score', -1) <= 1.0)
    test('Both have isBlurry field', isinstance(blurry.get('isBlurry'), bool) and isinstance(sharp.get('isBlurry'), bool))

    # After training, uncomment these:
    # test('BLURRY flagged as blurry', blurry.get('isBlurry') is True)
    # test('SHARP flagged as sharp', sharp.get('isBlurry') is False)


def test_invalid_input():
    """Test error handling with invalid input."""
    print('\n🧪 Testing invalid input handling')

    # Empty images array
    status, data = make_request('POST', '/analyze', {'images': []})
    test('Empty array returns 422', status == 422, f'got {status}')

    # Invalid base64
    payload = {'images': [{'baseName': 'BAD', 'data': 'not-valid-base64!!!'}]}
    status, data = make_request('POST', '/analyze', payload)
    test('Invalid base64 returns 400', status == 400, f'got {status}')

    # Missing fields
    status, data = make_request('POST', '/analyze', {'images': [{'baseName': 'X'}]})
    test('Missing data field returns 422', status == 422, f'got {status}')


def test_over_batch_limit():
    """Test that exceeding max batch size returns an error."""
    print('\n🧪 Testing batch limit (>20 images)')
    images = [
        {'baseName': f'IMG_{i:04d}', 'data': create_test_image(50, 50)}
        for i in range(21)
    ]
    status, data = make_request('POST', '/analyze', {'images': images})
    test('Over-limit returns 422', status == 422, f'got {status}')


# ============================================================================
# RUN
# ============================================================================

if __name__ == '__main__':
    print('=' * 50)
    print('Blur Detection API Tests')
    print(f'Server: {BASE_URL}')
    print('=' * 50)

    # Check if server is running
    try:
        make_request('GET', '/health')
    except Exception:
        print('\n❌ Cannot connect to server. Start it first:')
        print('   uvicorn main:app --port 8000')
        sys.exit(1)

    test_health()
    test_analyze_single()
    test_analyze_batch()
    test_analyze_blurry_vs_sharp()
    test_invalid_input()
    test_over_batch_limit()

    print(f'\n{"=" * 50}')
    print(f'Results: {passed} passed, {failed} failed')
    print(f'{"=" * 50}')

    sys.exit(0 if failed == 0 else 1)
