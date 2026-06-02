/**
 * Tests for the AI blur path in src/main/blurDetectionService.js
 *
 * Covers the pure decision + transport-routing logic of the resize→batch→stream
 * pipeline (POST /api/v1/blur/classify/stream):
 *   - mapClassification(): argmax over non-sharp classes, sensitivity-threshold
 *     gating, category filtering, score = 1 - P(sharp). This decides which
 *     photos get culled, so it's the logic the parity gate cares about.
 *   - streamLineToResult(): an NDJSON error line → un-analyzable marker.
 *   - routeStreamLines(): out-of-order results mapped by `index`, `_summary`
 *     skipped, duplicate/malformed lines ignored, and dropped indices reported
 *     as "missing" (so the caller can recover them per-image).
 *
 * Re-implements the pure logic from blurDetectionService.js to avoid the
 * Electron dependency (same pattern as subscriptionService.test.js and
 * progressManager.test.js). These constants/functions MUST mirror the service.
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// RE-IMPLEMENT PURE LOGIC (must match blurDetectionService.js)
// ============================================================================

const SENSITIVITY_TO_THRESHOLD = { strict: 0.30, moderate: 0.45, lenient: 0.65 };
const SHARP_CLASS = 'sharp';

function mapClassification(data, threshold, categoriesFilter, analyzedFile) {
  const probs = (data && data.probabilities) || {};
  const sharpP = typeof probs[SHARP_CLASS] === 'number' ? probs[SHARP_CLASS] : 0;

  let bestBlurClass = '';
  let bestBlurProbability = 0;
  for (const [cls, p] of Object.entries(probs)) {
    if (cls === SHARP_CLASS) continue;
    if (p > bestBlurProbability) {
      bestBlurProbability = p;
      bestBlurClass = cls;
    }
  }

  const passesThreshold = bestBlurProbability >= threshold;
  const inCategories = !categoriesFilter || categoriesFilter.has(bestBlurClass);

  return {
    score: Number((1 - sharpP).toFixed(4)),
    isBlurry: passesThreshold && inCategories,
    analyzedFile,
    confidence: Number((data.confidence ?? 0).toFixed(4)),
    predictedClass: data.predicted_class || '',
    bestBlurClass,
    bestBlurProbability: Number(bestBlurProbability.toFixed(4)),
  };
}

function streamLineToResult(obj, threshold, categoriesFilter, analyzedFile) {
  if (obj.error) {
    return { score: -1, isBlurry: false, analyzedFile, confidence: 0 };
  }
  return mapClassification(obj, threshold, categoriesFilter, analyzedFile);
}

// Mirrors the result-routing loop inside classifyChunkStream(): map each NDJSON
// line back to its chunk slot by `index`, skip the `_summary` line, ignore
// duplicate/out-of-range/malformed lines, and report indices never returned.
function routeStreamLines(lines, chunkLen) {
  const seen = new Set();
  const results = {};
  for (const line of lines) {
    let obj;
    try { obj = JSON.parse(line); } catch (_e) { continue; }
    if (obj._summary) continue;
    const idx = typeof obj.index === 'number' ? obj.index : parseInt(obj.filename, 10);
    if (!Number.isInteger(idx) || idx < 0 || idx >= chunkLen || seen.has(idx)) continue;
    results[idx] = obj;
    seen.add(idx);
  }
  const missing = [];
  for (let i = 0; i < chunkLen; i++) if (!seen.has(i)) missing.push(i);
  return { results, missing };
}

// Helper: build a probabilities object summing to ~1.
function probs({ sharp = 0, defocused_blurred = 0, defocused_object_portrait = 0, motion_blurred = 0 }) {
  return { sharp, defocused_blurred, defocused_object_portrait, motion_blurred };
}

// ============================================================================
// mapClassification
// ============================================================================

describe('mapClassification', () => {
  const MODERATE = SENSITIVITY_TO_THRESHOLD.moderate; // 0.45

  it('flags a clearly sharp image as not blurry', () => {
    const data = {
      predicted_class: 'sharp',
      confidence: 0.95,
      probabilities: probs({ sharp: 0.95, motion_blurred: 0.03, defocused_blurred: 0.02 }),
    };
    const r = mapClassification(data, MODERATE, null, 'IMG_1.jpg');
    expect(r.isBlurry).toBe(false);
    expect(r.score).toBeCloseTo(0.05, 4); // 1 - P(sharp)
    expect(r.bestBlurClass).toBe('motion_blurred');
  });

  it('flags a dominant motion-blur image as blurry and names the class', () => {
    const data = {
      predicted_class: 'motion_blurred',
      confidence: 0.9,
      probabilities: probs({ sharp: 0.05, motion_blurred: 0.9, defocused_blurred: 0.05 }),
    };
    const r = mapClassification(data, MODERATE, null, 'IMG_2.jpg');
    expect(r.isBlurry).toBe(true);
    expect(r.bestBlurClass).toBe('motion_blurred');
    expect(r.bestBlurProbability).toBeCloseTo(0.9, 4);
    expect(r.score).toBeCloseTo(0.95, 4);
  });

  it('gates on the sensitivity threshold (same image, different sensitivity)', () => {
    // best non-sharp probability = 0.40
    const data = {
      predicted_class: 'sharp',
      confidence: 0.6,
      probabilities: probs({ sharp: 0.6, defocused_blurred: 0.4 }),
    };
    expect(mapClassification(data, SENSITIVITY_TO_THRESHOLD.moderate, null, 'f').isBlurry).toBe(false); // 0.40 < 0.45
    expect(mapClassification(data, SENSITIVITY_TO_THRESHOLD.strict, null, 'f').isBlurry).toBe(true);    // 0.40 >= 0.30
    expect(mapClassification(data, SENSITIVITY_TO_THRESHOLD.lenient, null, 'f').isBlurry).toBe(false);  // 0.40 < 0.65
  });

  it('respects the category filter — passing threshold but wrong class is not flagged', () => {
    const data = {
      predicted_class: 'motion_blurred',
      confidence: 0.8,
      probabilities: probs({ sharp: 0.1, motion_blurred: 0.8, defocused_blurred: 0.1 }),
    };
    const onlyDefocus = new Set(['defocused_blurred']);
    const onlyMotion = new Set(['motion_blurred']);
    expect(mapClassification(data, MODERATE, onlyDefocus, 'f').isBlurry).toBe(false);
    expect(mapClassification(data, MODERATE, onlyMotion, 'f').isBlurry).toBe(true);
  });

  it('treats missing sharp probability as P(sharp)=0 (score 1.0)', () => {
    const data = { predicted_class: 'motion_blurred', confidence: 0.7, probabilities: { motion_blurred: 0.7 } };
    const r = mapClassification(data, MODERATE, null, 'f');
    expect(r.score).toBeCloseTo(1.0, 4);
    expect(r.isBlurry).toBe(true);
  });
});

// ============================================================================
// streamLineToResult
// ============================================================================

describe('streamLineToResult', () => {
  it('maps an error line to an un-analyzable marker (does not abort the chunk)', () => {
    const r = streamLineToResult({ index: 3, filename: '3', error: 'Failed to decode image' }, 0.45, null, 'IMG.jpg');
    expect(r).toEqual({ score: -1, isBlurry: false, analyzedFile: 'IMG.jpg', confidence: 0 });
  });

  it('maps a normal line identically to mapClassification', () => {
    const line = {
      index: 0, filename: '0', predicted_class: 'defocused_blurred', confidence: 0.7,
      probabilities: probs({ sharp: 0.2, defocused_blurred: 0.7, motion_blurred: 0.1 }),
    };
    expect(streamLineToResult(line, 0.45, null, 'a.jpg'))
      .toEqual(mapClassification(line, 0.45, null, 'a.jpg'));
  });
});

// ============================================================================
// routeStreamLines (NDJSON ordering + completeness)
// ============================================================================

describe('routeStreamLines', () => {
  it('maps out-of-order results back to their index and skips the summary line', () => {
    const lines = [
      JSON.stringify({ index: 2, filename: '2', predicted_class: 'sharp' }),
      JSON.stringify({ index: 0, filename: '0', predicted_class: 'motion_blurred' }),
      JSON.stringify({ index: 1, filename: '1', predicted_class: 'sharp' }),
      JSON.stringify({ _summary: true, total: 3, processing_time_ms: 12.3 }),
    ];
    const { results, missing } = routeStreamLines(lines, 3);
    expect(missing).toEqual([]);
    expect(results[0].predicted_class).toBe('motion_blurred');
    expect(results[2].predicted_class).toBe('sharp');
  });

  it('reports indices a truncated stream never returned as missing', () => {
    // 4-image chunk, server died after 2 lines (no summary)
    const lines = [
      JSON.stringify({ index: 0, filename: '0', predicted_class: 'sharp' }),
      JSON.stringify({ index: 1, filename: '1', predicted_class: 'sharp' }),
    ];
    const { missing } = routeStreamLines(lines, 4);
    expect(missing).toEqual([2, 3]);
  });

  it('ignores duplicate, out-of-range, and malformed lines', () => {
    const lines = [
      JSON.stringify({ index: 0, filename: '0', predicted_class: 'sharp' }),
      JSON.stringify({ index: 0, filename: '0', predicted_class: 'motion_blurred' }), // dup → ignored
      JSON.stringify({ index: 9, filename: '9', predicted_class: 'sharp' }),          // out of range
      '{ not valid json',                                                              // malformed
    ];
    const { results, missing } = routeStreamLines(lines, 2);
    expect(results[0].predicted_class).toBe('sharp'); // first wins, dup ignored
    expect(missing).toEqual([1]);
  });
});
