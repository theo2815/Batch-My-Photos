/**
 * Logger Utility
 * 
 * Provides safe logging that respects production environment.
 * - In Development: Logs to console as normal
 * - In Production: Suppresses logs to keep stdout clean and improve performance,
 *   except for Errors and Warnings which are still important.
 * - VERBOSE_LOGGING flag: When enabled, allows info/debug logs in production
 *   for diagnosing user-reported issues without running from source.
 */

const config = require('../main/config');

const shouldLog = config.isDevelopment || config.features.VERBOSE_LOGGING;

const logger = {
  info: (...args) => {
    if (shouldLog) {
      console.log(...args);
    }
  },
  
  log: (...args) => {
    if (shouldLog) {
      console.log(...args);
    }
  },
  
  warn: (...args) => {
    // Always log warnings (e.g. security blocks)
    console.warn(...args);
  },
  
  error: (...args) => {
    // Always log errors
    console.error(...args);
  },
  
  debug: (...args) => {
    if (shouldLog) {
      console.debug(...args);
    }
  },
  
  // Special method for performance timing that works in both but is cleaner in prod
  time: (label) => {
    if (shouldLog) console.time(label);
  },
  
  timeEnd: (label) => {
    if (shouldLog) console.timeEnd(label);
  }
};

module.exports = logger;
