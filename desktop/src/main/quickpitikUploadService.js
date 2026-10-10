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

const ACCESS_DENIED = 'Access denied: folder not selected through dialog';

// What the backend accepts (storage.direct-upload accepted types) …
const UPLOADABLE_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
// … and what else a camera folder holds. Kept in step with
// batchEngine.ALLOWED_EXTENSIONS (a test checks every entry is in it).
const RAW_EXTENSIONS = new Set(['raw', 'cr2', 'cr3', 'nef', 'nrw', 'arw', 'srf', 'dng', 'orf', 'rw2', 'pef', 'raf', 'srw', 'x3f']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'avi', 'mkv', 'mts', 'm2ts']);
const HEIC_EXTENSIONS = new Set(['heic', 'heif']);

const emptySkipped = () => ({ raw: 0, video: 0, heic: 0, oversize: 0, other: 0 });
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });

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
  if (UPLOADABLE_TYPES[ext]) {
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
    if (kind.kind === 'uploadable') candidates.push({ name: entry.name, contentType: kind.contentType });
    else skipped[kind.kind] += 1;
  }
  await runPool(candidates, STAT_CONCURRENCY, async (candidate) => {
    const { size } = await fsPromises.stat(path.join(dir, candidate.name));
    if (size > QP_MAX_FILE_BYTES) skipped.oversize += 1;
    else files.push({ name: candidate.name, sizeBytes: size, contentType: candidate.contentType });
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

module.exports = {
  classifyFile,
  scanFolder,
  _internals: { listFolder, runPool, ACCESS_DENIED, RAW_EXTENSIONS, VIDEO_EXTENSIONS, HEIC_EXTENSIONS },
};
