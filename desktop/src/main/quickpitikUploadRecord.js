/**
 * The one unfinished QuickPitik upload, kept so the next launch can offer Resume.
 *
 * Holds no token, file list or count: only the QuickPitik account id, the
 * event, the dropped folder, the ticked subfolders and the ones that finished.
 * The record is read back from disk, so it is checked like any outside input:
 * anything unreadable, odd or from another version counts as no record and is
 * cleared. Writing it never stops an upload.
 */

const path = require('path');
const SecureStore = require('./secureStore');
const logger = require('../utils/logger');

const VERSION = 1;

let store;
function getStore() {
  if (!store) store = new SecureStore({ name: 'quickpitik-upload-resume' });
  return store;
}

const isText = (value) => typeof value === 'string' && value.length > 0 && value.length <= 200;
const isTime = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value));
// The beginUpload rule, stricter: '/' only, no '..' step, never absolute ('' is the dropped folder itself).
const isRelPath = (rel) => typeof rel === 'string' && !rel.includes('\\') && !rel.split('/').includes('..') && !path.isAbsolute(rel);

function isRecord(r) {
  return r !== null && typeof r === 'object' && r.version === VERSION
    && isText(r.account) && isText(r.eventId) && isText(r.eventName)
    && typeof r.root === 'string' && path.isAbsolute(r.root)
    && Array.isArray(r.selected) && r.selected.length > 0 && r.selected.every(isRelPath)
    && Array.isArray(r.finished) && r.finished.every(rel => r.selected.includes(rel))
    && isTime(r.startedAt) && isTime(r.updatedAt);
}

function write(record) {
  try {
    getStore().set('record', record);
  } catch (error) {
    logger.warn('⚠️ [QP-RESUME] Could not save the upload record:', error.message);
  }
}

function clear() {
  try {
    getStore().clear();
  } catch (error) {
    logger.warn('⚠️ [QP-RESUME] Could not clear the upload record:', error.message);
  }
}

/** The saved record, or null. */
function load() {
  let record;
  try {
    record = getStore().get('record', null);
  } catch (error) {
    logger.warn('⚠️ [QP-RESUME] Could not read the upload record:', error.message);
    return null;
  }
  if (record === null) return null;
  if (isRecord(record)) return record;
  logger.warn('⚠️ [QP-RESUME] Ignoring an upload record it cannot use');
  clear();
  return null;
}

/** A new upload replaces the record. */
function save({ account, eventId, eventName, root, selected }) {
  const now = new Date().toISOString();
  write({ version: VERSION, account, eventId, eventName, root, selected, finished: [], startedAt: now, updatedAt: now });
}

/** A subfolder with no failed photo is done: a resume does not read it again. */
function markFinished(relPath) {
  const record = load();
  if (!record) return;
  const finished = [...record.finished, relPath];
  if (record.selected.every(rel => finished.includes(rel))) clear(); // nothing left to resume
  else write({ ...record, finished, updatedAt: new Date().toISOString() });
}

module.exports = { load, save, markFinished, clear, isRelPath };
