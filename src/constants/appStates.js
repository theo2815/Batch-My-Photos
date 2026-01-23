/**
 * Application States
 * 
 * Enum-like object for tracking app state
 */

export const STATES = {
  IDLE: 'idle',           // Waiting for folder selection
  SCANNING: 'scanning',   // Scanning folder contents
  READY: 'ready',         // Ready to execute (showing preview)
  EXECUTING: 'executing', // Moving files
  COMPLETE: 'complete',   // Operation finished
  ERROR: 'error',         // Error occurred
};
