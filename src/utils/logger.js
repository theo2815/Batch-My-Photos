/**
 * Logger Utility
 * 
 * Provides safe logging that respects production environment.
 * - In Development: Logs to console as normal
 * - In Production: Suppresses logs to keep stdout clean and improve performance,
 *   except for Errors and Warnings which are still important.
 */

const { app } = require('electron');

const isDevelopment = !app.isPackaged;

const logger = {
  info: (...args) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },
  
  log: (...args) => {
    if (isDevelopment) {
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
    if (isDevelopment) {
      console.debug(...args);
    }
  },
  
  // Special method for performance timing that works in both but is cleaner in prod
  time: (label) => {
    if (isDevelopment) console.time(label);
  },
  
  timeEnd: (label) => {
    if (isDevelopment) console.timeEnd(label);
  }
};

module.exports = logger;
