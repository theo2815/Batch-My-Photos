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

  /**
   * Enable persistent operation history.
   * When enabled, rollback manifests are saved to disk and survive
   * app restarts. Users can undo past operations from the history panel.
   */
  HISTORY_ENABLED: envBool('BATCH_HISTORY_ENABLED', true),

  /**
   * Enable the blur detection feature.
   * When enabled, users can toggle blur analysis in the settings panel
   * to detect and separate blurry photos during batching.
   *
   * DISABLED FOR INITIAL RELEASE - Feature under development
   */
  BLUR_DETECTION_ENABLED: envBool('BATCH_BLUR_DETECTION_ENABLED', false),

  /**
   * Enable the AI-powered blur detection service.
   * When enabled, blur analysis is sent to the Python AI service (FastAPI)
   * instead of using the local Laplacian-based algorithm.
   * Set to false to disable blur detection entirely when AI service is down.
   */
  BLUR_AI_ENABLED: envBool('BATCH_BLUR_AI_ENABLED', false),

  /**
   * Enable Hardware ID (HWID) device binding.
   * When enabled, the app generates a stable machine fingerprint and
   * registers it against the user's subscription. Devices exceeding
   * the plan's device_limit are blocked from executing batches.
   * Disable for development/testing to bypass device checks.
   */
  HWID_BINDING_ENABLED: envBool('BATCH_HWID_BINDING_ENABLED', true),

  /**
   * URL of the AI blur detection service.
   * Defaults to local FastAPI server during development.
   * Will be changed to production backend URL when deployed.
   */
  BLUR_AI_URL: process.env.BATCH_BLUR_AI_URL || 'http://localhost:8000',
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
  ALLOWED_SETTINGS_KEYS: ['maxFilesPerBatch', 'outputPrefix', 'batchMode', 'sortBy', 'outputDir', 'blurDetectionEnabled', 'blurSensitivity'],

  /** Maximum number of persisted rollback history entries */
  MAX_HISTORY_ENTRIES: envInt('BATCH_MAX_HISTORY_ENTRIES', 20, 1, 100),
};

// ============================================================================
// URLS — Backend & frontend URLs for API calls and deep link auth
// ============================================================================
// In production (packaged app), defaults point to your deployed server.
// Single deploy: backend and website run on the same server/URL.
// In development (running from source), defaults point to localhost.
// Always overridable via environment variables.

const PROD_URL = 'https://www.batchmyphotos.com'

const urls = {
  /** Backend API base URL (no trailing slash) */
  BACKEND_URL: process.env.BATCH_BACKEND_API_URL
    || (isProduction ? PROD_URL : 'http://localhost:3000'),

  /** Website frontend URL (no trailing slash) — same server in production */
  FRONTEND_URL: process.env.BATCH_FRONTEND_URL
    || (isProduction ? PROD_URL : 'http://localhost:3000'),
};

// ============================================================================
// EXPORT — Frozen to prevent accidental mutation
// ============================================================================

const config = {
  isDevelopment,
  isProduction,
  features: Object.freeze(features),
  limits: Object.freeze(limits),
  urls: Object.freeze(urls),
};

module.exports = Object.freeze(config);
