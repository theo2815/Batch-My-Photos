/**
 * SecureStore — Tamper-proof persistent key-value storage
 *
 * Wraps electron-store so the on-disk JSON file contains only a single
 * `_encrypted` key whose value is a safeStorage-encrypted blob.  This
 * prevents technical users from opening the JSON in a text editor and
 * granting themselves Pro status, editing device IDs, or otherwise
 * manipulating cached data.
 *
 * Encryption:
 *   - Uses Electron `safeStorage` (Windows DPAPI / macOS Keychain / Linux Secret Service)
 *   - The OS manages the encryption key — it never appears in source code
 *   - If safeStorage is unavailable, data is base64-encoded (obscured, not tamper-proof)
 *
 * Migration:
 *   When a store is opened for the first time after this upgrade, any existing
 *   plain-text keys are automatically migrated into the encrypted blob and the
 *   old keys are removed.
 *
 * API surface mirrors electron-store: get, set, delete, has, clear.
 */

const { app, safeStorage } = require('electron')
const Store = require('electron-store')
const path = require('path')
const fs = require('fs')

class SecureStore {
  /**
   * @param {Object} options
   * @param {string} options.name - Store file name (without .json)
   * @param {Object} [options.defaults={}] - Default values for keys
   */
  constructor({ name, defaults = {} }) {
    this._defaults = defaults
    this._cache = null

    // Resolve the JSON file path for cleanup if needed
    const userDataDir = app.getPath('userData')
    const storeFile = path.join(userDataDir, `${name}.json`)

    try {
      this._store = new Store({ name })
    } catch (_err) {
      // Corrupted JSON file — delete and recreate
      try { fs.unlinkSync(storeFile) } catch (_e) { /* file may not exist */ }
      this._store = new Store({ name })
    }
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  /**
   * Load and decrypt the entire store into the in-memory cache.
   * Handles three cases:
   *   1. Store already contains an _encrypted blob → decrypt it
   *   2. Store has plain-text legacy keys → migrate them into an encrypted blob
   *   3. Store is empty → use defaults
   */
  _readAll() {
    if (this._cache) return this._cache

    const rawStore = this._store.store // full JSON contents

    // Case 1: Already encrypted
    if (rawStore._encrypted && typeof rawStore._encrypted === 'string') {
      try {
        const buf = Buffer.from(rawStore._encrypted, 'base64')
        const json = safeStorage.isEncryptionAvailable()
          ? safeStorage.decryptString(buf)
          : buf.toString('utf8')
        this._cache = { ...this._defaults, ...JSON.parse(json) }
        return this._cache
      } catch (_err) {
        // Blob is corrupted or was encrypted with a different OS user — start fresh
        this._cache = { ...this._defaults }
        this._writeAll(this._cache)
        return this._cache
      }
    }

    // Case 2: Legacy plain-text keys → migrate into encrypted blob
    const legacyKeys = Object.keys(rawStore)
    if (legacyKeys.length > 0) {
      this._cache = { ...this._defaults, ...rawStore }
      this._writeAll(this._cache)
      return this._cache
    }

    // Case 3: Empty store
    this._cache = { ...this._defaults }
    return this._cache
  }

  /**
   * Encrypt and persist the entire cache to disk.
   * Replaces the file contents with a single `_encrypted` key.
   */
  _writeAll(data) {
    this._cache = data
    const json = JSON.stringify(data)

    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(json)
      this._store.store = { _encrypted: encrypted.toString('base64') }
    } else {
      // No OS keychain — base64-encode (obscured, not tamper-proof)
      this._store.store = { _encrypted: Buffer.from(json).toString('base64') }
    }
  }

  // ── Public API (mirrors electron-store) ─────────────────────────────────────

  /**
   * Get a value by key.
   * @param {string} key
   * @param {*} [defaultValue]
   * @returns {*}
   */
  get(key, defaultValue) {
    const data = this._readAll()
    return data[key] !== undefined ? data[key] : defaultValue
  }

  /**
   * Set a value by key.
   * @param {string} key
   * @param {*} value
   */
  set(key, value) {
    const data = this._readAll()
    data[key] = value
    this._writeAll(data)
  }

  /**
   * Delete a key.
   * @param {string} key
   */
  delete(key) {
    const data = this._readAll()
    if (key in data) {
      delete data[key]
      this._writeAll(data)
    }
  }

  /**
   * Check if a key exists.
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    const data = this._readAll()
    return key in data
  }

  /**
   * Clear all data (resets to defaults).
   */
  clear() {
    this._cache = null
    this._writeAll({ ...this._defaults })
  }
}

module.exports = SecureStore
