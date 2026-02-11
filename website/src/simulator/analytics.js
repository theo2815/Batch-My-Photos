/**
 * Lightweight analytics module for the interactive demo.
 * Tracks user interactions to measure demo effectiveness.
 * 
 * Events are queued and can be flushed to any backend (GA, Mixpanel, Supabase, etc.)
 * For now, logs to console in dev and stores in sessionStorage.
 */

const STORAGE_KEY = 'bmp_demo_analytics';
const isDev = import.meta.env.DEV;

let sessionEvents = [];
let sessionStart = Date.now();

const getSessionId = () => {
    let id = sessionStorage.getItem('bmp_session_id');
    if (!id) {
        id = `demo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        sessionStorage.setItem('bmp_session_id', id);
    }
    return id;
};

/**
 * Track a demo event.
 * @param {string} event - Event name (e.g. 'step_reached', 'setting_changed')
 * @param {object} [data] - Optional event data
 */
export const trackEvent = (event, data = {}) => {
    const entry = {
        event,
        data,
        timestamp: Date.now(),
        elapsed: Math.round((Date.now() - sessionStart) / 1000),
        sessionId: getSessionId(),
    };

    sessionEvents.push(entry);

    if (isDev) {
        console.log(`📊 [Analytics] ${event}`, data);
    }

    // Persist to sessionStorage for debugging
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sessionEvents));
    } catch {
        // Storage full, ignore
    }
};

// Convenience methods
export const trackStepReached = (step) => trackEvent('step_reached', { step });
export const trackSettingChanged = (setting, value) => trackEvent('setting_changed', { setting, value });
export const trackCTAClicked = (cta) => trackEvent('cta_clicked', { cta });
export const trackDemoCompleted = (stats) => trackEvent('demo_completed', stats);
export const trackDemoReset = () => trackEvent('demo_reset');
export const trackDemoAbandoned = (lastStep) => trackEvent('demo_abandoned', { lastStep });

/**
 * Get all events for the current session.
 */
export const getSessionEvents = () => [...sessionEvents];

/**
 * Reset the analytics session (e.g. on demo restart).
 */
export const resetSession = () => {
    sessionEvents = [];
    sessionStart = Date.now();
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem('bmp_session_id');
};
