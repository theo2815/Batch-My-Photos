const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const exifr = require('exifr');
const { EXIF_CONCURRENCY } = require('./constants');
const logger = require('../utils/logger');

/**
 * Service to handle EXIF data extraction efficiently
 */

// ============================================================================
// IN-MEMORY CACHE
// ============================================================================

/**
 * Cache entry: { cacheKey: string, dateMap: Object }
 * Only one folder is cached at a time (the current working folder).
 * Cleared automatically when the folder or file list changes.
 */
let exifCache = { cacheKey: null, dateMap: null };

/**
 * Generate a cache key from folderPath + file list.
 * Uses SHA-256 for security, and avoids sorting (readdir order is
 * deterministic per call — sorting 50k+ names was a perf bottleneck).
 * Instead we include the file count so any add/remove invalidates.
 * 
 * @param {string} folderPath
 * @param {string[]} files
 * @returns {string} Cache key
 */
function buildCacheKey(folderPath, files) {
  const hash = crypto.createHash('sha256');
  hash.update(folderPath);
  hash.update(String(files.length));
  // Hash first, last, and a few samples for fast invalidation without sorting
  if (files.length > 0) hash.update(files[0]);
  if (files.length > 1) hash.update(files[files.length - 1]);
  if (files.length > 10) hash.update(files[Math.floor(files.length / 2)]);
  return hash.digest('hex');
}

/**
 * Clear the EXIF cache (e.g. when switching folders).
 */
function clearCache() {
  exifCache = { cacheKey: null, dateMap: null };
}

/**
 * C-22: exifr treats a file starting 00 00 as HEIF and can loop forever on it, so such files
 * (real HEIC/AVIF included, until EXIF runs in a killable process: H-10) never reach exifr.
 */
async function startsWithZeroZero(filePath) {
  const handle = await fs.open(filePath, 'r');
  const head = await handle.read(Buffer.alloc(2), 0, 2, 0).finally(() => handle.close());
  return head.bytesRead === 2 && head.buffer[0] === 0 && head.buffer[1] === 0;
}

// ============================================================================
// MAIN EXTRACTION
// ============================================================================

/**
 * Extract date taken from files with concurrency control.
 * Results are cached in memory — repeat calls with the same folder and
 * file list return instantly.
 * 
 * Fallback to file creation time if EXIF is missing.
 * 
 * @param {string[]} files - Array of filenames
 * @param {string} folderPath - Base folder path
 * @returns {Promise<Object>} Map of filename -> timestamp (ms)
 */
async function extractExifDates(files, folderPath) {
  // Check cache first
  const cacheKey = buildCacheKey(folderPath, files);
  if (exifCache.cacheKey === cacheKey && exifCache.dateMap) {
    logger.log(`📸 [EXIF] Cache hit — returning ${files.length} cached dates`);
    return exifCache.dateMap;
  }

  const dateMap = {};
  const totalFiles = files.length;
  
  logger.log(`📸 [EXIF] Extracting dates for ${totalFiles} files...`);
  
  // Process files in chunks to limit concurrency
  for (let i = 0; i < totalFiles; i += EXIF_CONCURRENCY) {
    const chunk = files.slice(i, i + EXIF_CONCURRENCY);
    
    await Promise.all(chunk.map(async (fileName) => {
      const filePath = path.join(folderPath, fileName);
      
      try {
        if (await startsWithZeroZero(filePath)) throw new Error('HEIF-like'); // C-22: such files use the file time

        // 1. Try to read EXIF DateTimeOriginal
        // Only read the necessary segment for speed (first few KB usually)
        const output = await exifr.parse(filePath, { 
          pick: ['DateTimeOriginal'], 
          tiff: true,   // Needed for some raw formats
          ifd0: false,  // Skip unnecessary IFDs for speed
          gps: false,
          xmp: false
        });

        if (output && output.DateTimeOriginal) {
          // exifr returns a Date object directly
          dateMap[fileName] = output.DateTimeOriginal.getTime();
          return;
        }
      } catch (_err) {
        // EXIF parsing failed or not supported (png, video, etc) — fall back to file stats
      }

      // 2. Fallback to file creation/modification time
      try {
        const stats = await fs.stat(filePath);
        // "Date" usually implies the earliest moment content existed.
        // On Windows, birthtime resets on copy, while mtime is preserved. 
        // We take the minimum (earliest) to best guess the original creation date.
        const t1 = stats.birthtimeMs || Infinity;
        const t2 = stats.mtimeMs || Infinity;
        const earliestTime = Math.min(t1, t2);
        
        dateMap[fileName] = (earliestTime === Infinity) ? 0 : earliestTime;
      } catch (statErr) {
        logger.warn(`⚠️ [EXIF] Failed to stat file: ${fileName}`, statErr);
        dateMap[fileName] = 0;
      }
    }));
  }
  
  // Store in cache
  exifCache = { cacheKey, dateMap };
  
  logger.log(`📸 [EXIF] Date extraction complete. Results cached.`);
  return dateMap;
}

// ============================================================================
// PHOTO METADATA (preview panel)
// Same fields, precedence and cleanup as QuickPitik's backend PhotoMetadataExtractor.kt.
// ============================================================================

// Formats exifr can read. WebP, BMP and GIF previews get status 'unavailable'.
const METADATA_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.tif', '.tiff'];
const METADATA_BASE_OPTIONS = {
  gps: false, ifd1: false, interop: false, makerNote: false, userComment: false,
  translateValues: false, reviveValues: false, mergeOutput: false,
};
// Two reads: exifr files XMP values under the same keys as EXIF ones, which would hide the EXIF-first order.
const TIFF_OPTIONS = {
  ...METADATA_BASE_OPTIONS, tiff: true, ifd0: true, exif: true,
  xmp: false, iptc: false, icc: false, jfif: false, ihdr: false,
};
const XMP_IPTC_OPTIONS = {
  ...METADATA_BASE_OPTIONS, tiff: false, xmp: true, iptc: true, icc: false, jfif: false, ihdr: false,
};
const TEXT_BUDGET = 7000;

const isSet = (value) => value !== null && value !== undefined;
const nonBlank = (value) => (typeof value === 'string' && value.trim() !== '' ? value : null);
const positive = (n) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null);
const positiveInt = (v) => {
  const n = Array.isArray(v) ? v[0] : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : v;
  return Number.isInteger(n) && n > 0 ? n : null;
};
const inRange = (v, max) => (Number.isInteger(v) && v >= 0 && v <= max ? v : null);
const xmpInt = (v) => (typeof v === 'string' && /^-?\d+$/.test(v.trim()) ? Number(v) : Number.isInteger(v) ? v : null);
const pad2 = (n) => String(n).padStart(2, '0');
// EXIF text ends at its first NUL, as in metadata-extractor ("Jo Smith\0Ed Co" → "Jo Smith").
const exifText = (v) => nonBlank(typeof v === 'string' ? v.split('\0')[0] : v);
// exifr turns number-like XMP text into numbers ("12345" → 12345); turn it back.
// ponytail: "007" comes back as "7" (exifr drops the original text); reading raw XMP would fix it.
const xmpString = (v) => (typeof v === 'number' ? String(v) : v);

/** NFC, drop control and format/bidi characters (B6), trim, cap at `limit` code points. */
function cleanText(value, limit) {
  if (typeof value !== 'string') return null;
  const capped = [...value.normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu, '').trim()].slice(0, limit).join('');
  return capped.trim() === '' ? null : capped;
}

/** exifr decodes IPTC text as Latin-1; like metadata-extractor, use UTF-8 when the bytes are valid UTF-8. */
function iptcText(value) {
  const text = nonBlank(Array.isArray(value) ? value.join(' ') : value); // repeated By-lines, joined like the backend
  if (!text || [...text].some((c) => c.codePointAt(0) > 0xff)) return text;
  const bytes = Buffer.from(text, 'latin1');
  const utf8 = bytes.toString('utf8');
  return Buffer.from(utf8, 'utf8').equals(bytes) ? utf8 : text;
}

const XML_NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** exifr leaves XML escapes in XMP text ("&amp;", "&#169;"); decode them once, as QuickPitik's XMPCore does. */
function xmlDecoded(text) {
  return text.replace(/&(?:#x([0-9a-fA-F]+)|#([0-9]+)|(amp|lt|gt|quot|apos));/g, (match, hex, dec, name) => {
    if (name) return XML_NAMED[name];
    const code = hex ? parseInt(hex, 16) : Number(dec);
    return code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

/** First non-blank value of an XMP text, list, or language list. */
function xmpText(value) {
  const items = Array.isArray(value) ? value : [value];
  for (const item of items) {
    const text = nonBlank(xmpString(item && typeof item === 'object' ? item.value : item));
    if (text) return xmlDecoded(text);
  }
  return null;
}

/** XMP language list: the x-default entry, else the first entry with text. */
function xmpLocalized(value) {
  const items = Array.isArray(value) ? value : [value];
  const fallback = items.find((item) => item && item.lang === 'x-default' && nonBlank(xmpString(item.value)));
  return fallback ? xmlDecoded(xmpString(fallback.value)) : xmpText(value);
}

function rationalText(value) {
  if (typeof value === 'number') return positive(value);
  if (typeof value !== 'string') return null;
  const parts = value.trim().split('/');
  if (parts.length === 1) return positive(Number(parts[0]));
  if (parts.length !== 2 || !/^\d+$/.test(parts[0].trim()) || !/^\d+$/.test(parts[1].trim())) return null;
  return positive(Number(parts[0]) / Number(parts[1]));
}

function seconds(numerator, denominator) {
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const g = gcd(numerator, denominator);
  return denominator / g === 1 ? `${numerator / g} s` : `${numerator / g}/${denominator / g} s`;
}

/** exifr gives EXIF rationals as decimals (0.002); recover the smallest exact fraction ("1/500 s"). */
function exposureFromNumber(value) {
  if (!positive(value)) return null;
  for (let d = 1; d <= 100000; d++) {
    const n = Math.round(value * d);
    if (n > 0 && Math.abs(value * d - n) < 1e-9 * Math.max(1, n)) return seconds(n, d);
  }
  // shortcut: only for denominators over 100000; prints JS number text where the backend prints a BigDecimal.
  return `${value} s`;
}

function exposureFromXmp(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? `${value} s` : null; // "1.50" → 1.5
  if (typeof value !== 'string') return null;
  const parts = value.trim().split('/');
  if (parts.length === 2) {
    if (!/^-?\d+$/.test(parts[0].trim()) || !/^-?\d+$/.test(parts[1].trim())) return null;
    const [n, d] = parts.map(Number);
    return n > 0 && d > 0 ? seconds(n, d) : null;
  }
  const s = Number(value);
  return value.trim() !== '' && Number.isFinite(s) && s > 0 ? `${s} s` : null;
}

/** Wall-clock "YYYY-MM-DDTHH:MM:SS[.fraction]" like Java's LocalDateTime JSON; null for impossible dates. */
function localDateTime(y, mo, d, h, mi, s, fraction) {
  const t = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  const real = t.getUTCFullYear() === +y && t.getUTCMonth() === +mo - 1 && t.getUTCDate() === +d
    && +h < 24 && +mi < 60 && +s < 60;
  if (!real) return null;
  const digits = fraction ? fraction.padEnd(9, '0').replace(/0+$/, '') : '';
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${digits ? `.${digits}` : ''}`;
}

/** "+08:00" / "+0800" / "+08" / "Z" → "+08:00"; zero → "Z" (Java ZoneOffset ids). */
function zoneOffset(value) {
  const m = typeof value === 'string' && /^(?:Z|([+-])(\d{2})(?::?(\d{2}))?)$/.exec(value.trim());
  if (!m) return null;
  if (!m[1]) return 'Z';
  const hours = +m[2];
  const minutes = +(m[3] || 0);
  if (hours > 18 || minutes > 59 || (hours === 18 && minutes > 0)) return null;
  return hours === 0 && minutes === 0 ? 'Z' : `${m[1]}${pad2(hours)}:${pad2(minutes)}`;
}

function exifTaken(exif) {
  const m = typeof exif.DateTimeOriginal === 'string'
    && /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(exif.DateTimeOriginal);
  if (!m) return null;
  const sub = exif.SubSecTimeOriginal;
  const local = localDateTime(...m.slice(1), typeof sub === 'string' && /^[0-9]{1,9}$/.test(sub) ? sub : null);
  return local && [local, zoneOffset(exif.OffsetTimeOriginal)];
}

function xmpTaken(value) {
  const m = typeof value === 'string'
    && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})?$/.exec(value.trim());
  if (!m) return null;
  const local = localDateTime(m[1], m[2], m[3], m[4], m[5], m[6] || '00', m[7]);
  return local && [local, m[8] ? zoneOffset(m[8]) : null];
}

function iptcTaken(iptc) {
  const d = /^(\d{4})(\d{2})(\d{2})$/.exec(String(iptc.DateCreated ?? ''));
  const t = /^(\d{2})(\d{2})(\d{2})(.*)$/.exec(String(iptc.TimeCreated ?? ''));
  if (!d || !t) return null;
  const local = localDateTime(d[1], d[2], d[3], t[1], t[2], t[3]);
  return local && [local, t[4].trim() ? zoneOffset(t[4]) : null];
}

function xmpFired(flash) {
  const fired = flash && typeof flash === 'object' ? flash.Fired : undefined;
  const text = String(fired).toLowerCase();
  if (fired === true || text === 'true' || text === '1') return 'Fired';
  if (fired === false || text === 'false' || text === '0') return 'Did not fire';
  return null;
}

/** The backend's shared 7,000-unit budget across make, model, lens, author, copyright (in that order). */
function fitBudget(values) {
  let remaining = TEXT_BUDGET;
  return values.map((value) => {
    if (!isSet(value)) return null;
    let out = '';
    for (const ch of value) {
      const cost = ch.codePointAt(0) > 0xffff ? 12 : ch === '"' || ch === '\\' ? 2 : Buffer.byteLength(ch);
      if (cost > remaining) break;
      out += ch;
      remaining -= cost;
    }
    return out.trim() === '' ? null : out;
  });
}

/** Maps two exifr outputs to QuickPitik's 13 fields. Returns only fields that have a value. */
function normalizeMetadata(tiff = {}, xmpIptc = {}) {
  const ifd0 = tiff.ifd0 || {};
  const exif = tiff.exif || {};
  const xIfd0 = xmpIptc.ifd0 || {}; // XMP tiff: namespace
  const xExif = xmpIptc.exif || {}; // XMP exif: namespace
  const iptc = xmpIptc.iptc || {};

  const make = cleanText(exifText(ifd0.Make), 256) ?? cleanText(xmpText(xIfd0.Make), 256);
  const rawModel = cleanText(exifText(ifd0.Model), 256) ?? cleanText(xmpText(xIfd0.Model), 256);
  const model = rawModel && make && rawModel.toLowerCase().startsWith(`${make.toLowerCase()} `)
    ? rawModel.slice(make.length + 1) : rawModel;
  const lens = cleanText(exifText(exif.LensModel), 256)
    ?? cleanText(xmpText(xmpIptc.exifEX?.LensModel), 256)
    ?? cleanText(xmpText(xmpIptc.aux?.Lens), 256);
  const author = cleanText(xmpText(xmpIptc.dc?.creator), 500)
    ?? cleanText(iptcText(iptc.Byline), 500)
    ?? cleanText(exifText(ifd0.Artist), 500);
  const copyright = cleanText(xmpLocalized(xmpIptc.dc?.rights), 1000)
    ?? cleanText(iptcText(iptc.CopyrightNotice), 1000)
    ?? cleanText(exifText(ifd0.Copyright), 1000);
  const taken = exifTaken(exif) ?? xmpTaken(xExif.DateTimeOriginal) ?? iptcTaken(iptc);
  const flashBits = inRange(exif.Flash, 0x7f);
  const mode = inRange(exif.ExposureMode, 2) ?? xmpInt(xExif.ExposureMode);
  const whiteBalance = inRange(exif.WhiteBalance, 1) ?? xmpInt(xExif.WhiteBalance);
  const [cameraMake, cameraModel, lensText, authorText, copyrightText] =
    fitBudget([make, model, lens, author, copyright]);

  const fields = {
    cameraMake,
    cameraModel,
    lens: lensText,
    aperture: positive(exif.FNumber) ?? rationalText(xExif.FNumber),
    exposureTime: exposureFromNumber(exif.ExposureTime) ?? exposureFromXmp(xExif.ExposureTime),
    iso: positiveInt(exif.ISO) ?? positiveInt(exif.ISOSpeed) ?? positiveInt(exif.StandardOutputSensitivity)
      ?? positiveInt(xExif.ISOSpeedRatings),
    author: authorText,
    copyright: copyrightText,
    takenAtLocal: taken?.[0] ?? null,
    takenAtOffset: taken?.[1] ?? null,
    flash: isSet(flashBits) ? (flashBits & 1 ? 'Fired' : 'Did not fire') : xmpFired(xExif.Flash),
    exposureMode: ['Auto', 'Manual', 'Auto bracket'][mode] ?? null,
    whiteBalance: ['Auto', 'Manual'][whiteBalance] ?? null,
  };
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => isSet(value)));
}

/**
 * Reads QuickPitik's display-safe metadata from one ORIGINAL file. Never throws and never logs tag values.
 * @param {string} filePath - absolute path, already validated by the caller
 * @returns {Promise<{status: 'ready'|'empty'|'unavailable'|'failed', fields?: Object, fileSizeBytes?: number}>}
 */
async function readPhotoMetadata(filePath) {
  let fileSizeBytes;
  try {
    fileSizeBytes = (await fs.stat(filePath)).size;
  } catch (_err) {
    return { status: 'failed' };
  }
  const withSize = (result) => ({ ...result, fileSizeBytes });
  try {
    if (!METADATA_EXTENSIONS.includes(path.extname(filePath).toLowerCase())) return withSize({ status: 'unavailable' });
    if (await startsWithZeroZero(filePath)) return withSize({ status: 'unavailable' });
    const tiff = await exifr.parse(filePath, TIFF_OPTIONS);
    const xmpIptc = await exifr.parse(filePath, XMP_IPTC_OPTIONS);
    const fields = normalizeMetadata(tiff || {}, xmpIptc || {});
    return withSize(Object.keys(fields).length > 0 ? { status: 'ready', fields } : { status: 'empty' });
  } catch (_err) {
    return withSize({ status: 'failed' });
  }
}

module.exports = {
  extractExifDates,
  readPhotoMetadata,
  clearCache
};
