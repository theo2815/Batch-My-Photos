/**
 * Logger Utility (main process only)
 *
 * Wraps electron-log so a packaged Windows GUI app — which discards stdout —
 * still leaves a trail: %APPDATA%/Batch My Photos/logs/main.log (1 MB rotation).
 * - Development / VERBOSE_LOGGING: everything (debug and up) to console + file
 * - Production: warnings and errors only
 */

const log = require('electron-log/main');
const config = require('../main/config');

const shouldLog = config.isDevelopment || config.features.VERBOSE_LOGGING;
const level = shouldLog ? 'debug' : 'warn';
log.transports.console.level = level;
log.transports.file.level = level;

const logger = {
  info: (...args) => log.info(...args),
  log: (...args) => log.info(...args),
  warn: (...args) => log.warn(...args),
  error: (...args) => log.error(...args),
  debug: (...args) => log.debug(...args),

  // Performance timing stays on console (electron-log has no timers)
  time: (label) => {
    if (shouldLog) console.time(label);
  },

  timeEnd: (label) => {
    if (shouldLog) console.timeEnd(label);
  }
};

module.exports = logger;
