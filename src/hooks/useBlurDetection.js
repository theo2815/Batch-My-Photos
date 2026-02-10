import { useState, useCallback, useMemo, useEffect, useRef } from 'react';

/**
 * Format remaining seconds into a human-readable ETA string.
 * @param {number} seconds - Remaining seconds
 * @returns {string} Formatted ETA (e.g. "~3 min remaining" or "~45s remaining")
 */
function formatEta(seconds) {
  if (seconds > 60) {
    const mins = Math.ceil(seconds / 60);
    return `~${mins} min remaining`;
  }
  return `~${seconds}s remaining`;
}

/**
 * Hook for managing blur detection analysis, results, and user un-flagging.
 * 
 * @param {Object} params
 * @param {string|null} params.folderPath - Currently selected folder path
 * @param {boolean} params.blurDetectionEnabled - Whether blur detection is toggled on
 * @param {string} params.blurSensitivity - Sensitivity preset: 'strict' | 'moderate' | 'lenient'
 */
export function useBlurDetection({ folderPath, blurDetectionEnabled, blurSensitivity }) {
  const [blurResults, setBlurResults] = useState(null);     // Full results map: { baseName: { score, isBlurry, analyzedFile } }
  const [blurProgress, setBlurProgress] = useState(null);   // { current, total }
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [unflaggedGroups, setUnflaggedGroups] = useState(new Set()); // User-unflagged base names

  // Track the last analyzed folder + sensitivity to avoid redundant analyses
  const lastAnalysisRef = useRef({ folderPath: null, sensitivity: null });

  // Track analysis start time for ETA computation
  const analysisStartTimeRef = useRef(null);

  // Guard against concurrent analysis runs (refs are synchronous, unlike state)
  const analysisInFlightRef = useRef(false);

  // Subscribe to blur progress updates from main process
  useEffect(() => {
    if (!window.electronAPI?.onBlurProgress) return;
    const cleanup = window.electronAPI.onBlurProgress((data) => {
      setBlurProgress(data);
    });
    return cleanup;
  }, []);

  // Derived: blurry group base names (excluding user-unflagged ones)
  const blurryGroups = useMemo(() => {
    if (!blurResults) return [];
    return Object.entries(blurResults)
      .filter(([baseName, result]) => result.isBlurry && !unflaggedGroups.has(baseName))
      .map(([baseName]) => baseName);
  }, [blurResults, unflaggedGroups]);

  const blurryCount = blurryGroups.length;

  // Derived: ETA for blur analysis based on progress and elapsed time
  const blurEta = useMemo(() => {
    if (!blurProgress || !analysisStartTimeRef.current) return null;
    const { current, total } = blurProgress;
    if (total === 0) return null;
    const pct = current / total;
    // Don't show ETA until 5% complete (early estimates are unreliable due to Sharp warmup)
    if (pct < 0.05) return { pct, etaSeconds: null, label: 'Estimating...' };
    const elapsedMs = Date.now() - analysisStartTimeRef.current;
    const totalEstMs = elapsedMs / pct;
    const remainingMs = totalEstMs - elapsedMs;
    const etaSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    return { pct, etaSeconds, label: formatEta(etaSeconds) };
  }, [blurProgress]);

  /**
   * Run blur analysis on the current folder.
   * Called when blur detection is enabled or sensitivity changes.
   */
  const runBlurAnalysis = useCallback(async () => {
    if (!folderPath || !blurDetectionEnabled) return;

    // Prevent concurrent analysis runs — ref check is synchronous and
    // immune to React batching race conditions (unlike state).
    if (analysisInFlightRef.current) return;

    // Skip if we already analyzed this folder with the same sensitivity
    if (
      lastAnalysisRef.current.folderPath === folderPath &&
      lastAnalysisRef.current.sensitivity === blurSensitivity
    ) {
      return;
    }

    analysisInFlightRef.current = true;
    setIsAnalyzing(true);
    setBlurProgress(null);
    analysisStartTimeRef.current = Date.now();

    try {
      const result = await window.electronAPI.analyzeBlur(folderPath, blurSensitivity);

      if (result.success) {
        setBlurResults(result.blurResults);
        lastAnalysisRef.current = { folderPath, sensitivity: blurSensitivity };
      } else {
        console.error('[BLUR] Analysis failed:', result.error);
        setBlurResults(null);
      }
    } catch (err) {
      console.error('[BLUR] Analysis error:', err);
      setBlurResults(null);
    } finally {
      analysisInFlightRef.current = false;
      setIsAnalyzing(false);
      setBlurProgress(null);
      analysisStartTimeRef.current = null;
    }
  }, [folderPath, blurDetectionEnabled, blurSensitivity]);

  /**
   * Toggle a group's blur flag (un-flag or re-flag).
   * Un-flagged groups are placed back into normal batches.
   */
  const toggleBlurFlag = useCallback((baseName) => {
    setUnflaggedGroups(prev => {
      const next = new Set(prev);
      if (next.has(baseName)) {
        next.delete(baseName);
      } else {
        next.add(baseName);
      }
      return next;
    });
  }, []);

  /**
   * Reset all blur state (called when folder changes or feature is toggled off).
   */
  const resetBlurState = useCallback(() => {
    setBlurResults(null);
    setBlurProgress(null);
    setIsAnalyzing(false);
    setUnflaggedGroups(new Set());
    lastAnalysisRef.current = { folderPath: null, sensitivity: null };
    analysisInFlightRef.current = false;
  }, []);

  /**
   * Clear only the analysis cache so the next runBlurAnalysis() call
   * re-runs even if folder + sensitivity haven't changed.
   * Used when the user explicitly clicks "Start Analysis" in the modal.
   */
  const clearAnalysisCache = useCallback(() => {
    lastAnalysisRef.current = { folderPath: null, sensitivity: null };
  }, []);

  return {
    blurResults,
    blurProgress,
    blurEta,
    isAnalyzing,
    blurryGroups,
    blurryCount,
    unflaggedGroups,
    runBlurAnalysis,
    toggleBlurFlag,
    resetBlurState,
    clearAnalysisCache,
  };
}
