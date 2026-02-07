/**
 * Application Configuration & Feature Flags
 * 
 * Central place for all feature flags, environment detection, and
 * runtime-tunable options. Values can be overridden via environment
 * variables (prefixed with BATCH_) without editing source code.
 * 
 * Usage:
 *   const config = require('./config');
 *   if (config.isDevelopment) { ... }
 *   if (config.features.ROLLBACK_ENABLED) { ... }
 * 
 * Environment variable overrides (set before launching the app):
 *   BATCH_ROLLBACK_ENABLED=false
 *   BATCH_ENCRYPTION_ENABLED=false
 *   BATCH_VERBOSE_LOGGING=true
 *   BATCH_MAX_PRESETS=50
 *   etc.
 * 
 * NOTE: This module requires Electron's `app` module and should only
 * be imported AFTER `require('electron')` has been called.
 */

const { app } = require('electron');

// ============================================================================
// HELPERS — Parse environment variables with type safety
// ============================================================================

/**
 * Read a boolean from process.env, falling back to a default.
 * Recognizes: "true", "1", "yes" as true; everything else as false.
 * 
 * @param {string} envKey - Environment variable name
 * @param {boolean} defaultValue - Default if not set
 * @returns {boolean}
 */
function envBool(envKey, defaultValue) {
  const val = process.env[envKey];
  if (val === undefined || val === '') return defaultValue;
  return ['true', '1', 'yes'].includes(val.toLowerCase());
}

/**
 * Read an integer from process.env, falling back to a default.
 * Clamps to [min, max] if provided.
 * 
 * @param {string} envKey - Environment variable name
 * @param {number} defaultValue - Default if not set or invalid
 * @param {number} [min] - Minimum allowed value
 * @param {number} [max] - Maximum allowed value
 * @returns {number}
 */
function envInt(envKey, defaultValue, min, max) {
  const val = process.env[envKey];
  if (val === undefined || val === '') return defaultValue;
  const num = parseInt(val, 10);
  if (isNaN(num)) return defaultValue;
  if (min !== undefined && num < min) return min;
  if (max !== undefined && num > max) return max;
  return num;
}

// ============================================================================
// ENVIRONMENT DETECTION
// ============================================================================

/** True when running from source (not packaged as an .exe/.app) */
const isDevelopment = !app.isPackaged;

/** True when running as a packaged/distributed application */
const isProduction = app.isPackaged;

// ============================================================================
// FEATURE FLAGS
// ============================================================================
// Toggle application features without code changes.
// All flags default to sensible production values and can be
// overridden via environment variables for testing/debugging.

const features = {
  /**
   * Enable the rollback/undo feature for move operations.
   * When disabled, the rollback UI and IPC handlers are still registered
   * but will report rollback as unavailable.
   */
  ROLLBACK_ENABLED: envBool('BATCH_ROLLBACK_ENABLED', true),

  /**
   * Encrypt the progress persistence file at rest using AES-256-GCM.
   * Protects file paths and file lists from casual access by another
   * user on the same machine. When disabled, uses plaintext JSON + HMAC.
   */
  ENCRYPTION_ENABLED: envBool('BATCH_ENCRYPTION_ENABLED', true),

  /**
   * Enable verbose debug logging even in production builds.
   * Useful for diagnosing issues reported by users without
   * requiring them to run from source.
   */
  VERBOSE_LOGGING: envBool('BATCH_VERBOSE_LOGGING', false),

  /**
   * Enable EXIF-based sorting option in the UI.
   * Can be disabled if the exifr dependency causes issues on
   * certain platforms.
   */
  EXIF_SORTING_ENABLED: envBool('BATCH_EXIF_SORTING_ENABLED', true),
};

// ============================================================================
// LIMITS — Security & storage bounds
// ============================================================================
// Centralized limits that were previously hardcoded across handlers.
// Overridable via environment variables for testing edge cases.

const limits = {
  /** Maximum number of saved presets per user */
  MAX_PRESETS: envInt('BATCH_MAX_PRESETS', 20, 1, 100),

  /** Maximum length for a preset name */
  MAX_PRESET_NAME_LENGTH: envInt('BATCH_MAX_PRESET_NAME_LENGTH', 100, 1, 500),

  /** Maximum length for a single setting value string */
  MAX_SETTING_VALUE_LENGTH: envInt('BATCH_MAX_SETTING_VALUE_LENGTH', 500, 1, 2000),

  /** Maximum allowed value for maxFilesPerBatch (DoS prevention) */
  MAX_FILES_PER_BATCH_CEILING: 10000,

  /** Default value for maxFilesPerBatch when input is invalid */
  DEFAULT_FILES_PER_BATCH: 500,

  /** Allowed keys in preset settings (whitelist for injection prevention) */
  ALLOWED_SETTINGS_KEYS: ['maxFilesPerBatch', 'outputPrefix', 'batchMode', 'sortBy', 'outputDir'],
};

// ============================================================================
// EXPORT — Frozen to prevent accidental mutation
// ============================================================================

const config = {
  isDevelopment,
  isProduction,
  features: Object.freeze(features),
  limits: Object.freeze(limits),
};

module.exports = Object.freeze(config);
