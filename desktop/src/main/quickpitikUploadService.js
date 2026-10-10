/**
 * QuickPitik upload service — the Upload view's main-process engine.
 *
 * Read-only on disk: walks a shoot folder, classifies what QuickPitik can take,
 * hashes photos as streams and sends them to one event through the same
 * begin → PUT → commit protocol the website uses (monorepo
 * docs/desktop-upload-integration-guide.md § 3). Nothing here moves, copies,
 * renames or deletes a file.
 *
 * Spec: docs/superpowers/specs/2026-10-10-quickpitik-upload-workflow-design.md
 */

const fsPromises = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const { isPathAllowedAsync } = require('./securityManager');
const { IGNORED_FILES, yieldToMain } = require('./batchEngine');
const { STAT_CONCURRENCY, QP_MAX_FILE_BYTES, QP_WALK_MAX_DEPTH } = require('./constants');
const config = require('./config');
const qpAuth = require('./quickpitikAuthService');

const ACCESS_DENIED = 'Access denied: folder not selected through dialog';
const UNREADABLE = 'Could not read this folder.';

// What the backend accepts (storage.direct-upload accepted types) …
const UPLOADABLE_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
// … and what else a camera folder holds. Kept in step with
// batchEngine.ALLOWED_EXTENSIONS (a test checks every entry is in it).
const RAW_EXTENSIONS = new Set(['raw', 'cr2', 'cr3', 'nef', 'nrw', 'arw', 'srf', 'dng', 'orf', 'rw2', 'pef', 'raf', 'srw', 'x3f']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'avi', 'mkv', 'mts', 'm2ts']);
const HEIC_EXTENSIONS = new Set(['heic', 'heif']);

const emptySkipped = () => ({ raw: 0, video: 0, heic: 0, oversize: 0, other: 0 });
const collator = new Intl.Collator(undefined, { numeric: true });
const byName = (a, b) => collator.compare(a.name, b.name);

// ── Classification and the read-only walk ─────────────────────────────────────

/**
 * Classify one file name. null = the walk ignores it entirely (dotfiles and
 * the OS files batchEngine ignores). Otherwise { kind: 'uploadable', contentType }
 * or { kind: 'raw' | 'video' | 'heic' | 'oversize' | 'other' }.
 */
function classifyFile(name, sizeBytes = 0) {
  const lower = name.toLowerCase();
  if (lower.startsWith('.') || IGNORED_FILES.has(lower)) return null;
  const dot = lower.lastIndexOf('.');
  const ext = dot > 0 ? lower.slice(dot + 1) : '';
  if (Object.hasOwn(UPLOADABLE_TYPES, ext)) {
    return sizeBytes > QP_MAX_FILE_BYTES ? { kind: 'oversize' } : { kind: 'uploadable', contentType: UPLOADABLE_TYPES[ext] };
  }
  if (RAW_EXTENSIONS.has(ext)) return { kind: 'raw' };
  if (VIDEO_EXTENSIONS.has(ext)) return { kind: 'video' };
  if (HEIC_EXTENSIONS.has(ext)) return { kind: 'heic' };
  return { kind: 'other' };
}

/** Same shape as blurDetectionService's pool: at most `concurrency` calls of fn in flight. */
async function runPool(items, concurrency, fn) {
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const current = idx++;
      await fn(items[current], current);
    }
  });
  await Promise.all(workers);
}

/** One directory level: uploadable files (name, size, type), skipped counts, child folder names. Never follows links. */
async function listFolder(dir) {
  const entries = (await fsPromises.readdir(dir, { withFileTypes: true })).sort(byName);
  const files = [];
  const skipped = emptySkipped();
  const subdirs = [];
  const candidates = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) { subdirs.push(entry.name); continue; }
    if (!entry.isFile()) continue;
    const kind = classifyFile(entry.name);
    if (!kind) continue;
    if (kind.kind === 'uploadable') candidates.push(entry.name);
    else skipped[kind.kind] += 1;
  }
  await runPool(candidates, STAT_CONCURRENCY, async (name) => {
    let size;
    try {
      ({ size } = await fsPromises.stat(path.join(dir, name)));
    } catch {
      skipped.other += 1; // gone or unreadable since readdir: skip the file, keep the folder
      return;
    }
    const kind = classifyFile(name, size);
    if (kind.kind === 'uploadable') files.push({ name, sizeBytes: size, contentType: kind.contentType });
    else skipped.oversize += 1;
  });
  files.sort(byName);
  return { files, skipped, subdirs };
}

/**
 * Walk a dropped folder (registered through the dialog or a drop) and
 * summarise each subfolder. Iterative, sorted, depth-capped, links skipped,
 * yields between directories. File lists are not kept.
 */
async function scanFolder(rootPath) {
  if (!(await isPathAllowedAsync(rootPath))) {
    logger.warn('🔒 [QP-UPLOAD] Blocked scan of unregistered path:', rootPath);
    return { success: false, error: ACCESS_DENIED };
  }
  const root = path.resolve(rootPath);
  const folders = [];
  const totals = { folders: 0, uploadable: { count: 0, bytes: 0 }, skipped: emptySkipped() };
  const stack = [{ dir: root, relPath: '', depth: 0 }];
  while (stack.length > 0) {
    const { dir, relPath, depth } = stack.pop();
    let listing;
    try {
      listing = await listFolder(dir);
    } catch (error) {
      logger.warn('⚠️ [QP-UPLOAD] Skipping unreadable folder:', dir, error.code);
      if (depth === 0) return { success: false, error: UNREADABLE };
      continue;
    }
    const name = relPath === '' ? path.basename(root) : path.basename(relPath);
    const bytes = listing.files.reduce((sum, file) => sum + file.sizeBytes, 0);
    const skippedCount = Object.values(listing.skipped).reduce((sum, n) => sum + n, 0);
    if (listing.files.length > 0 || skippedCount > 0) {
      folders.push({
        relPath, name,
        uploadable: { count: listing.files.length, bytes },
        skipped: listing.skipped,
        defaultSelected: !/_Blurry$/i.test(name),
      });
      totals.folders += 1;
      totals.uploadable.count += listing.files.length;
      totals.uploadable.bytes += bytes;
      for (const key of Object.keys(totals.skipped)) totals.skipped[key] += listing.skipped[key];
    }
    if (depth < QP_WALK_MAX_DEPTH) {
      for (const sub of listing.subdirs.reverse()) {
        stack.push({ dir: path.join(dir, sub), relPath: relPath ? `${relPath}/${sub}` : sub, depth: depth + 1 });
      }
    }
    await yieldToMain();
  }
  return { success: true, root, folders, totals };
}

// ── Events open for upload ────────────────────────────────────────────────────
// Same rules as the website (lib/event-catalog.ts): a public event takes
// uploads from race day through the third day after, Manila time; the owner
// of a photographer-created event may upload until one calendar month after
// race day. The backend gate (PhotoUploadService.gate) still decides per upload.

const MANILA_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }); // YYYY-MM-DD
const DAY_MS = 86400000;
const PUBLIC_UPLOAD_DAYS = 4;

/** Whole days from the event date to Manila-today; negative = future, 0 = race day. */
function daysSince(dateIso, now) {
  return Math.round((Date.parse(MANILA_DATE.format(now)) - Date.parse(dateIso)) / DAY_MS);
}

function canUploadPublic(dateIso, now = new Date()) {
  const days = daysSince(dateIso, now);
  return days >= 0 && days < PUBLIC_UPLOAD_DAYS;
}

/** One month after race day, clamped to the month's last day like Java's plusMonths (Jan 31 → Feb 28). */
function ownerCloseDate(dateIso) {
  const [y, m, d] = dateIso.split('-').map(Number);
  const year = y + Math.floor(m / 12);
  const month = m % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

function canUploadOwned(dateIso, now = new Date()) {
  return daysSince(ownerCloseDate(dateIso), now) <= 0;
}

const eventRow = (event, ownedByMe, state) => ({
  id: event.id, name: event.name, date: event.date, location: event.location, ownedByMe, state,
});

/** Events the connected photographer can upload to right now: own first, then public, no duplicates. */
async function listEvents(now = new Date()) {
  const { data: publicPage } = await qpAuth.fetchJson(`${config.urls.QUICKPITIK_API_URL}/events?limit=200`);
  const { data: minePage } = await qpAuth.authorizedFetch('/me/photographer/events?limit=200');
  const byId = new Map();
  for (const event of minePage.items || []) {
    const open = event.ownedByMe ? canUploadOwned(event.date, now) : canUploadPublic(event.date, now);
    if (open) byId.set(event.id, eventRow(event, !!event.ownedByMe, event.state));
  }
  for (const event of publicPage.items || []) {
    if (!byId.has(event.id) && canUploadPublic(event.date, now)) byId.set(event.id, eventRow(event, false, 'live'));
  }
  return [...byId.values()].sort((a, b) => (Number(b.ownedByMe) - Number(a.ownedByMe)) || b.date.localeCompare(a.date));
}

module.exports = {
  classifyFile,
  scanFolder,
  listEvents,
  _internals: { listFolder, runPool, ACCESS_DENIED, RAW_EXTENSIONS, VIDEO_EXTENSIONS, HEIC_EXTENSIONS, canUploadPublic, canUploadOwned, ownerCloseDate },
};
