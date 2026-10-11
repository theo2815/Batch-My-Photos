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

const fs = require('fs');
const fsPromises = fs.promises;
const crypto = require('crypto');
const https = require('https');
const { net } = require('electron');
const path = require('path');
const logger = require('../utils/logger');
const { isPathAllowedAsync } = require('./securityManager');
const { IGNORED_FILES, yieldToMain } = require('./batchEngine');
const {
  STAT_CONCURRENCY, QP_MAX_FILE_BYTES, QP_WALK_MAX_DEPTH, QP_UPLOAD_CONCURRENCY, QP_HASH_CONCURRENCY,
  QP_EXISTS_CHUNK, QP_COMMIT_TIMEOUT_MS, QP_PUT_STALL_MS, QP_PUT_DEADLINE_MS, QP_COMMIT_BUSY_WINDOW_MS,
  QP_MAX_RETRIES_PER_PHASE, QP_PROGRESS_INTERVAL_MS,
} = require('./constants');
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
  // The last day the event takes uploads (YYYY-MM-DD).
  closesOn: ownedByMe ? ownerCloseDate(event.date) : new Date(Date.parse(event.date) + (PUBLIC_UPLOAD_DAYS - 1) * DAY_MS).toISOString().slice(0, 10),
});

/** Events the connected photographer can upload to right now: own first, then public, no duplicates. */
async function listEvents(now = new Date()) {
  const { data: publicPage } = await qpAuth.fetchJson(`${config.urls.QUICKPITIK_API_URL}/events?limit=200`);
  const { data: minePage } = await qpAuth.authorizedFetch('/me/photographer/events?limit=200');
  const byId = new Map();
  for (const event of minePage.items || []) {
    // The server refuses an archived event, and an own event until an admin
    // approves it (website: isOwnedEventLive).
    if (event.state === 'past') continue;
    if (event.ownedByMe && !['approved', 'change_pending'].includes(event.reviewStatus ?? 'approved')) continue;
    const open = event.ownedByMe ? canUploadOwned(event.date, now) : canUploadPublic(event.date, now);
    if (open) byId.set(event.id, eventRow(event, !!event.ownedByMe, event.state));
  }
  for (const event of publicPage.items || []) {
    if (!byId.has(event.id) && canUploadPublic(event.date, now)) byId.set(event.id, eventRow(event, false, 'live'));
  }
  return [...byId.values()].sort((a, b) => (Number(b.ownedByMe) - Number(a.ownedByMe)) || b.date.localeCompare(a.date));
}

// ── Upload engine ─────────────────────────────────────────────────────────────
// Mirrors uploadPhotographerPhoto in website/src/lib/api-photographer.ts
// without the persisted checkpoint. Rules: spec section "Upload protocol
// rules for the desktop client".

/** Codes the backend answers per photo: the file is recorded as failed and the run continues. */
const TERMINAL_PER_FILE = new Set(['UNSUPPORTED_MEDIA_TYPE', 'PAYLOAD_TOO_LARGE', 'UPLOAD_CHECKSUM_MISMATCH',
  'UPLOAD_KEY_MISMATCH', 'UPLOAD_REQUEST_CONFLICT', 'PHOTO_DUPLICATE_DIFFERENT_EVENT', 'UPLOAD_LINK_REJECTED', 'VALIDATION_ERROR']);
/** Codes that mean no other photo can succeed either: the run stops. */
const TERMINAL_PER_UPLOAD = new Set(['EVENT_NOT_UPLOADABLE', 'EVENT_NOT_FOUND', 'PHOTOGRAPHER_NOT_VERIFIED', 'ACCOUNT_SUSPENDED', 'WATERMARK_MISSING']);
const OFFLINE_CODES = new Set(['ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN', 'ENETUNREACH', 'ERR_INTERNET_DISCONNECTED', 'ERR_NETWORK_CHANGED',
  'ERR_NAME_NOT_RESOLVED', 'ERR_CONNECTION_REFUSED', 'ERR_ADDRESS_UNREACHABLE']);

class CancelledError extends Error {
  constructor() { super('Upload cancelled'); this.name = 'CancelledError'; }
}

// Replaceable in tests so retries and the offline wait do not sleep for real.
const internals = { sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)), now: () => Date.now() };

const codeOf = (error) => (error instanceof qpAuth.QpApiError ? error.code : null);
/**
 * The code of a network failure: Node sockets give error.code ('ECONNRESET');
 * Electron's net.fetch gives only a message ('net::ERR_NAME_NOT_RESOLVED'),
 * and its timeout is an AbortError.
 */
function netCode(error) {
  if (!error) return null;
  if (typeof error.code === 'string') return error.code;
  if (error.name === 'AbortError') return 'TIMEOUT';
  return /^net::(ERR_\w+)/.exec(error.message)?.[1] || null;
}
const isOffline = (error) => !net.isOnline() || OFFLINE_CODES.has(netCode(error));
function isRetryable(error) {
  if (error instanceof qpAuth.QpApiError) {
    if (TERMINAL_PER_FILE.has(error.code)) return false;
    return error.status === undefined || error.status >= 500 || error.status === 429
      || ['UPLOAD_STORAGE_UNAVAILABLE', 'TIMEOUT', 'UPLOAD_TRANSFER_FAILED'].includes(error.code);
  }
  // Socket, DNS and timeout errors are plain Errors with no HTTP status.
  const code = netCode(error);
  return code === 'TIMEOUT' || !!code?.startsWith('E');
}
function retryDelay(error, attempt) {
  const jittered = 1000 * 2 ** attempt * (0.8 + Math.random() * 0.4);
  const retryAfter = error instanceof qpAuth.QpApiError && error.retryAfterSeconds ? error.retryAfterSeconds * 1000 : 0;
  return Math.max(jittered, retryAfter);
}

/**
 * Run one phase with the retry rules: offline → wait, retry, do not count;
 * commit busy (UPLOAD_IN_PROGRESS / 429) → capped waits inside
 * QP_COMMIT_BUSY_WINDOW_MS; retryable → backoff, at most
 * QP_MAX_RETRIES_PER_PHASE per phase; anything else is thrown to the caller.
 */
async function withRetries(run, phase, state, ctx, canRetry = isRetryable) {
  for (;;) {
    ctx.assertActive();
    try {
      return await run();
    } catch (error) {
      ctx.assertActive();
      if (error instanceof CancelledError || error instanceof qpAuth.QpAuthError) throw error;
      if (isOffline(error)) { await ctx.waitForConnection(); continue; }
      if (phase === 'commit' && (codeOf(error) === 'UPLOAD_IN_PROGRESS' || (error instanceof qpAuth.QpApiError && error.status === 429))) {
        state.busyUntil = state.busyUntil || internals.now() + QP_COMMIT_BUSY_WINDOW_MS;
        if (internals.now() < state.busyUntil) {
          state.busyWaits = (state.busyWaits || 0) + 1;
          await ctx.sleep(Math.min(15000, retryDelay(error, Math.min(state.busyWaits - 1, 4))));
          continue;
        }
      }
      if (!canRetry(error)) throw error;
      const attempt = state[phase] || 0;
      if (attempt >= QP_MAX_RETRIES_PER_PHASE) throw error;
      state[phase] = attempt + 1;
      await ctx.sleep(retryDelay(error, attempt));
    }
  }
}

/** SHA-256 of the file bytes as lower-case hex — the identity the backend dedups on. Streams; never loads the file. */
function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(filePath)
      .on('error', reject)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')));
  });
}

/** The presigned URL must be https on the configured storage origin, with no credentials in it. */
function assertUploadOrigin(uploadUrl) {
  const configured = config.urls.QUICKPITIK_UPLOAD_ORIGIN;
  let url = null;
  try { url = new URL(uploadUrl); } catch { url = null; }
  if (!configured || !url || url.protocol !== 'https:' || url.origin !== configured || url.username || url.password) {
    throw new qpAuth.QpApiError({ code: 'UPLOAD_LINK_REJECTED', message: 'The upload link did not point at the QuickPitik storage origin.' });
  }
}

/**
 * Stream one file to the presigned URL with Node https (streaming request
 * bodies are not guaranteed by net.fetch in Electron 28, and the read stream
 * gives byte progress for free). Resolves on 2xx; rejects with QpApiError
 * TIMEOUT / UPLOAD_TRANSFER_FAILED or the socket error.
 */
function putFile(uploadUrl, headers, file, onBytes, ctx, deadlineMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stall = null;
    let request = null;
    let source = null;
    const settle = () => {
      if (settled) return false;
      settled = true;
      clearTimeout(stall);
      clearTimeout(absolute);
      if (request) ctx.inFlight.delete(request);
      if (source) source.destroy(); // or it reads on to the end of the file, reporting bytes nobody sends
      return true;
    };
    const fail = (error) => { if (settle()) { if (request) request.destroy(); reject(error); } };
    const timeout = (message) => fail(new qpAuth.QpApiError({ code: 'TIMEOUT', message }));
    const absolute = setTimeout(() => timeout('Upload timed out.'), Math.max(0, deadlineMs - internals.now()));
    const resetStall = () => { clearTimeout(stall); stall = setTimeout(() => timeout('Upload stalled.'), QP_PUT_STALL_MS); };
    request = https.request(uploadUrl, { method: 'PUT', headers: { ...headers, 'Content-Length': file.sizeBytes } }, (response) => {
      response.resume();
      response.on('end', () => {
        if (!settle()) return;
        if (response.statusCode >= 200 && response.statusCode < 300) resolve();
        else reject(new qpAuth.QpApiError({ status: response.statusCode, code: 'UPLOAD_TRANSFER_FAILED', message: `Upload failed (${response.statusCode})` }));
      });
    });
    ctx.inFlight.add(request);
    request.on('error', fail);
    source = fs.createReadStream(file.path);
    source.on('error', fail);
    source.on('data', (chunk) => { resetStall(); onBytes(chunk.length); });
    resetStall();
    source.pipe(request);
  });
}

/** Local-storage deployments: the classic multipart POST. Buffers one file (≤ 25 MiB), at most four at a time. */
async function multipartUpload(ctx, file, base, state) {
  await withRetries(async () => {
    const form = new FormData();
    form.append('file', new Blob([await fsPromises.readFile(file.path)], { type: file.contentType }), file.name);
    await qpAuth.authorizedFetch(base, { method: 'POST', body: form, timeoutMs: QP_COMMIT_TIMEOUT_MS });
    ctx.addBytes(file.sizeBytes);
  }, 'transfer', state, ctx);
}

/** One photo: begin → (PUT → commit | multipart | existing). Returns 'uploaded' or 'alreadyThere'; throws on failure. */
async function uploadOne(ctx, file) {
  const base = `/me/photographer/events/${encodeURIComponent(ctx.eventId)}/photos`;
  const state = {};
  let requestId = crypto.randomUUID();
  for (;;) {
    const { data: begin } = await withRetries(() => qpAuth.authorizedFetch(`${base}/direct`, {
      method: 'POST',
      body: { contentHash: file.hash, contentType: file.contentType, sizeBytes: file.sizeBytes, originalFilename: file.name, requestId },
    }), 'begin', state, ctx);
    if (begin.mode === 'existing') return 'alreadyThere';
    if (begin.mode === 'multipart') { await multipartUpload(ctx, file, base, state); return 'uploaded'; }
    if (begin.mode !== 'direct' || !begin.photoId || !begin.key || !begin.uploadUrl) {
      throw new qpAuth.QpApiError({ code: 'UPLOAD_LINK_REJECTED', message: 'The server did not return a usable upload link.' });
    }
    assertUploadOrigin(begin.uploadUrl);
    const commit = () => withRetries(() => qpAuth.authorizedFetch(`${base}/direct/commit`, {
      method: 'POST', timeoutMs: QP_COMMIT_TIMEOUT_MS,
      body: { photoId: begin.photoId, key: begin.key, contentHash: file.hash, sizeBytes: file.sizeBytes, contentType: file.contentType },
    }), 'commit', state, ctx);
    const deadline = Math.min(begin.expiresAt ? Date.parse(begin.expiresAt) : Infinity, internals.now() + QP_PUT_DEADLINE_MS);
    let sent = 0;
    const onBytes = (n) => {
      sent += n;
      ctx.addBytes(n);
      ctx.emit({ phase: 'uploading', file: { name: file.name, percent: Math.round((sent / file.sizeBytes) * 100) } });
    };
    let committed = false;
    let renew = false;
    let unknown = false;
    try {
      await withRetries(async () => {
        ctx.addBytes(-sent); // a retry sends the bytes again
        sent = 0;
        try {
          await putFile(begin.uploadUrl, begin.uploadHeaders || {}, file, onBytes, ctx, deadline);
        } catch (error) {
          if (!isRetryable(error) || isOffline(error)) throw error;
          // The PUT may have landed although its reply was lost: ask the server
          // before sending bytes again. UPLOAD_OBJECT_MISSING = it did not.
          try {
            await commit();
            committed = true;
            return;
          } catch (commitError) {
            if (codeOf(commitError) !== 'UPLOAD_OBJECT_MISSING') { unknown = true; throw commitError; }
            if (begin.expiresAt && Date.parse(begin.expiresAt) <= internals.now()) renew = true;
            throw error;
          }
        }
      }, 'transfer', state, ctx, (error) => !renew && !unknown && isRetryable(error));
    } catch (error) {
      if (!renew) throw error;
      // The grant expired and storage has nothing: start over with a fresh
      // request id, a bounded number of times (a PC clock far ahead of the
      // server makes every grant look expired).
      state.renewals = (state.renewals || 0) + 1;
      if (state.renewals > QP_MAX_RETRIES_PER_PHASE) throw error;
      ctx.addBytes(-sent);
      requestId = crypto.randomUUID();
      delete state.transfer;
      continue;
    }
    if (!committed) await commit();
    return 'uploaded';
  }
}

/** Pre-flight: which of these hashes the photographer already has. A chunk that keeps failing is treated as all new. */
async function checkExists(ctx, hashes) {
  const statuses = new Map();
  for (let i = 0; i < hashes.length; i += QP_EXISTS_CHUNK) {
    const chunk = hashes.slice(i, i + QP_EXISTS_CHUNK);
    try {
      const { data } = await withRetries(() => qpAuth.authorizedFetch(
        `/me/photographer/events/${encodeURIComponent(ctx.eventId)}/photos/exists`, { method: 'POST', body: { hashes: chunk } },
      ), 'exists', {}, ctx);
      for (const row of data.results || []) statuses.set(row.hash, row.status);
    } catch (error) {
      if (error instanceof CancelledError || error instanceof qpAuth.QpAuthError || TERMINAL_PER_UPLOAD.has(codeOf(error))) throw error;
      logger.warn('⚠️ [QP-UPLOAD] Pre-flight failed, treating the chunk as new:', error.message);
    }
  }
  return statuses;
}

function recordFailure(ctx, folder, file, code, message, retryable) {
  ctx.counts.failed += 1;
  ctx.failures.push({ relPath: folder.relPath, name: file.name, code, message, retryable });
}

function makeContext({ eventId, plan, total, send }) {
  let wake;
  const ctx = {
    eventId, plan, cancelled: false, stopError: null, inFlight: new Set(), failures: [], folder: null, lastEmit: 0,
    stopped: new Promise(resolve => { wake = resolve; }),
    counts: { uploaded: 0, alreadyThere: 0, failed: 0, total },
    bytes: { sent: 0, total: plan.reduce((sum, folder) => sum + folder.files.reduce((a, f) => a + f.sizeBytes, 0), 0) },
    assertActive() { if (ctx.cancelled) throw ctx.stopError; },
    /** No new file starts, waits end at once, in-flight PUTs are destroyed. The first reason wins. */
    stop(error) {
      if (ctx.cancelled) return;
      ctx.cancelled = true;
      ctx.stopError = error;
      wake();
      for (const request of ctx.inFlight) request.destroy(error);
    },
    async sleep(ms) { await Promise.race([internals.sleep(ms), ctx.stopped]); ctx.assertActive(); },
    async waitForConnection() {
      ctx.emit({ phase: 'waiting' }, true);
      do { await ctx.sleep(10000); } while (!net.isOnline());
    },
    addBytes(n) { ctx.bytes.sent += n; },
    emit(extra, force = false) {
      const now = internals.now();
      if (!force && now - ctx.lastEmit < QP_PROGRESS_INTERVAL_MS) return;
      ctx.lastEmit = now;
      send({ phase: 'uploading', folder: ctx.folder, counts: { ...ctx.counts }, bytes: { ...ctx.bytes }, ...extra });
    },
  };
  return ctx;
}

/** The folder loop: hash → pre-flight → upload, one subfolder at a time, four files in flight. */
async function runUpload(ctx) {
  try {
    for (let index = 0; index < ctx.plan.length; index++) {
      const folder = ctx.plan[index];
      ctx.folder = { relPath: folder.relPath, index, count: ctx.plan.length };
      ctx.emit({ phase: 'hashing' }, true);
      // A worker never throws: the pool then ends only when every file in
      // flight has finished, so nothing is reported after the last event.
      await runPool(folder.files, QP_HASH_CONCURRENCY, async (file) => {
        if (ctx.cancelled) return;
        file.path = path.join(folder.dir, file.name);
        try { file.hash = await sha256File(file.path); } catch (error) { file.readError = error; }
        ctx.emit({ phase: 'hashing' });
      });
      ctx.assertActive();
      ctx.emit({ phase: 'checking' }, true);
      const existing = await checkExists(ctx, folder.files.filter(f => f.hash).map(f => f.hash));
      const queue = [];
      for (const file of folder.files) {
        if (file.readError) { recordFailure(ctx, folder, file, file.readError.code || 'READ_ERROR', file.readError.message, false); continue; }
        const status = existing.get(file.hash) || 'new';
        if (status === 'same_event') { ctx.counts.alreadyThere += 1; ctx.addBytes(file.sizeBytes); }
        else if (status === 'different_event') recordFailure(ctx, folder, file, 'PHOTO_DUPLICATE_DIFFERENT_EVENT', 'This photo already belongs to another of your events.', false);
        else queue.push(file);
      }
      ctx.emit({ phase: 'uploading' }, true);
      await runPool(queue, QP_UPLOAD_CONCURRENCY, async (file) => {
        if (ctx.cancelled) return;
        try {
          const outcome = await uploadOne(ctx, file);
          ctx.counts[outcome] += 1;
          if (outcome === 'alreadyThere') ctx.addBytes(file.sizeBytes);
        } catch (error) {
          if (error instanceof CancelledError || error instanceof qpAuth.QpAuthError || TERMINAL_PER_UPLOAD.has(codeOf(error))) {
            ctx.stop(error); // the other workers finish the file they are on, then stop
            return;
          }
          recordFailure(ctx, folder, file, netCode(error) || 'UPLOAD_FAILED', error.message, isRetryable(error));
        }
        ctx.emit({ phase: 'uploading' });
      });
      ctx.assertActive();
      ctx.emit({ phase: 'folder-done' }, true);
    }
    ctx.emit({ phase: 'done', failures: ctx.failures }, true);
  } catch (caught) {
    const error = ctx.stopError || caught;
    if (error instanceof CancelledError) {
      ctx.emit({ phase: 'cancelled', failures: ctx.failures }, true);
    } else if (error instanceof qpAuth.QpAuthError) {
      ctx.emit({ phase: 'error', error: { code: 'SESSION_EXPIRED', message: 'Your QuickPitik sign-in expired.' }, failures: ctx.failures }, true);
    } else {
      logger.error('❌ [QP-UPLOAD] Upload stopped:', error);
      ctx.emit({ phase: 'error', error: { code: codeOf(error) || error.code || 'UPLOAD_FAILED', message: error.message }, failures: ctx.failures }, true);
    }
  }
}

let current = null; // one upload per process

/**
 * Validate, list the selected subfolders (names and sizes only), then run the
 * upload in the background. Resolves at once; progress arrives through `send`.
 */
async function startUpload(request, send) {
  if (current) return { success: false, error: 'An upload is already running.' };
  const slot = current = { stop() {} }; // holds the place while the folders are listed
  try {
    return await beginUpload(request, send);
  } finally {
    if (current === slot) current = null;
  }
}

async function beginUpload(request, send) {
  const { rootPath, eventId, folders } = request || {};
  if (typeof rootPath !== 'string' || typeof eventId !== 'string' || !Array.isArray(folders)
      || folders.some(rel => typeof rel !== 'string' || rel.split('/').includes('..') || path.isAbsolute(rel))) {
    return { success: false, error: 'Invalid upload request.' };
  }
  if (!(await isPathAllowedAsync(rootPath))) return { success: false, error: ACCESS_DENIED };
  const root = path.resolve(rootPath);
  const plan = [];
  for (const relPath of folders) {
    const dir = relPath === '' ? root : path.join(root, ...relPath.split('/'));
    if (!(await isPathAllowedAsync(dir))) return { success: false, error: ACCESS_DENIED };
    const { files } = await listFolder(dir);
    if (files.length > 0) plan.push({ relPath, dir, files });
  }
  const total = plan.reduce((sum, folder) => sum + folder.files.length, 0);
  if (total === 0) return { success: false, error: 'Nothing to upload.' };
  current = makeContext({ eventId, plan, total, send });
  runUpload(current).finally(() => { current = null; });
  return { success: true, total };
}

/** Cooperative cancel: no new file starts, in-flight PUTs are destroyed, the summary reports what finished. */
function cancelUpload() {
  if (!current) return { success: false };
  current.stop(new CancelledError());
  return { success: true };
}

module.exports = {
  classifyFile,
  scanFolder,
  listEvents,
  sha256File, startUpload, cancelUpload,
  _internals: { listFolder, runPool, ACCESS_DENIED, RAW_EXTENSIONS, VIDEO_EXTENSIONS, HEIC_EXTENSIONS, canUploadPublic, canUploadOwned, ownerCloseDate, get sleep() { return internals.sleep; }, set sleep(fn) { internals.sleep = fn; }, get now() { return internals.now; }, set now(fn) { internals.now = fn; } },
};
