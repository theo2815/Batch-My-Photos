import { useState, useEffect, useCallback, useRef } from 'react';
import { STATES } from '../constants/appStates';

/**
 * Hook for managing batch execution, progress, cancellation, resume,
 * and pre-execution safety checks (disk space + permissions).
 */
export function useBatchExecution({ setAppState, setError }) {
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [executionResults, setExecutionResults] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [interruptedProgress, setInterruptedProgress] = useState(null);

  // Safety check state
  const [safetyCheckResult, setSafetyCheckResult] = useState(null);
  const [showSafetyWarning, setShowSafetyWarning] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  // Stores pending execution params so "Proceed Anyway" can resume execution
  const pendingExecutionRef = useRef(null);

  // Subscribe to batch progress updates
  useEffect(() => {
    if (!window.electronAPI?.onBatchProgress) return;
    const cleanup = window.electronAPI.onBatchProgress((data) => {
      setProgress(data);
    });
    return cleanup;
  }, []);

  // Check for interrupted progress on mount (called from parent)
  const checkInterruptedProgress = useCallback(async () => {
    if (window.electronAPI?.checkInterruptedProgress) {
      const prog = await window.electronAPI.checkInterruptedProgress();
      if (prog) {
        setInterruptedProgress(prog);
        setShowResumeModal(true);
      }
    }
  }, []);

  /**
   * Internal: Run the actual batch execution (no validation).
   * Extracted so it can be called directly after validation passes
   * or when the user overrides a soft warning via "Proceed Anyway".
   */
  const runBatchExecution = useCallback(async ({
    folderPath, maxFilesPerBatch, outputPrefix, batchMode, outputDir, sortBy,
    selectedPresetName, previewBatchCount,
  }) => {
    // Auto-save current preset if one is selected
    if (selectedPresetName && window.electronAPI?.savePreset) {
      try {
        await window.electronAPI.savePreset(selectedPresetName, {
          maxFilesPerBatch,
          outputPrefix,
          batchMode,
          sortBy,
          outputDir,
        });
      } catch (err) {
        console.error('Failed to auto-save preset:', err);
      }
    }

    const maxFiles = parseInt(maxFilesPerBatch, 10);

    setAppState(STATES.EXECUTING);
    setProgress({ current: 0, total: previewBatchCount || 0 });

    try {
      const results = await window.electronAPI.executeBatch(
        folderPath,
        maxFiles,
        outputPrefix.trim(),
        batchMode,
        batchMode === 'copy' ? outputDir : null,
        sortBy
      );

      if (results.cancelled) {
        setExecutionResults({ ...results, wasCancelled: true });
        setAppState(STATES.COMPLETE);
      } else if (results.success) {
        setExecutionResults(results);
        setAppState(STATES.COMPLETE);
      } else {
        throw new Error(results.error);
      }
    } catch (err) {
      setError(err.message);
      setAppState(STATES.ERROR);
    }
  }, [setAppState, setError]);

  /**
   * Main entry point: validates the environment, then either proceeds
   * to execution or shows the safety warning modal.
   */
  const handleExecuteBatch = useCallback(async (params) => {
    const {
      folderPath, batchMode, outputDir,
    } = params;

    setShowConfirmation(false);
    setSafetyCheckResult(null);
    setShowSafetyWarning(false);

    // Run pre-execution validation
    if (window.electronAPI?.validateExecution) {
      setIsValidating(true);
      try {
        const validation = await window.electronAPI.validateExecution(
          folderPath,
          batchMode,
          batchMode === 'copy' ? outputDir : null
        );

        setIsValidating(false);

        if (!validation.success) {
          // Validation call itself failed (e.g., access denied)
          setError(validation.error || 'Pre-execution validation failed');
          setAppState(STATES.ERROR);
          return;
        }

        // Determine if there's a hard failure or soft warning
        const hasHardFailure =
          (validation.diskSpace && validation.diskSpace.sufficient === false) ||
          (validation.permissions && !validation.permissions.writable);

        const hasSoftWarning =
          (validation.diskSpace && validation.diskSpace.sufficient === null) ||
          (validation.warnings && validation.warnings.length > 0);

        if (hasHardFailure || hasSoftWarning) {
          // Store params so "Proceed Anyway" can resume
          pendingExecutionRef.current = params;
          setSafetyCheckResult(validation);
          setShowSafetyWarning(true);
          return; // Don't proceed — user must acknowledge
        }

        // All checks passed — proceed directly
      } catch (err) {
        setIsValidating(false);
        console.error('Safety check failed:', err);
        // If validation itself errors, treat as soft warning and proceed
      }
    }

    // Validation passed (or not available) — execute
    await runBatchExecution(params);
  }, [setAppState, setError, runBatchExecution]);

  /**
   * Called when user clicks "Proceed Anyway" on a soft safety warning.
   * Only available for soft warnings, not hard failures.
   */
  const handleOverrideSafetyCheck = useCallback(async () => {
    setShowSafetyWarning(false);
    setSafetyCheckResult(null);

    const params = pendingExecutionRef.current;
    pendingExecutionRef.current = null;

    if (params) {
      await runBatchExecution(params);
    }
  }, [runBatchExecution]);

  /**
   * Called when user clicks "Go Back" on the safety warning modal.
   */
  const handleDismissSafetyCheck = useCallback(() => {
    setShowSafetyWarning(false);
    setSafetyCheckResult(null);
    pendingExecutionRef.current = null;
  }, []);

  const handleCancelBatch = useCallback(() => {
    setShowCancelConfirmation(true);
  }, []);

  const confirmCancel = useCallback(async () => {
    setShowCancelConfirmation(false);
    if (window.electronAPI?.cancelBatch) {
      await window.electronAPI.cancelBatch();
    }
  }, []);

  const handleResume = useCallback(async () => {
    setShowResumeModal(false);
    setAppState(STATES.EXECUTING);
    setProgress({ current: 0, total: interruptedProgress?.totalFiles || 0 });

    try {
      const results = await window.electronAPI.resumeBatch();

      if (results.cancelled) {
        setExecutionResults({ ...results, wasCancelled: true });
        setAppState(STATES.COMPLETE);
      } else if (results.success) {
        setExecutionResults(results);
        setAppState(STATES.COMPLETE);
      } else {
        throw new Error(results.error);
      }
    } catch (err) {
      setError(err.message);
      setAppState(STATES.ERROR);
    } finally {
      setInterruptedProgress(null);
    }
  }, [interruptedProgress, setAppState, setError]);

  const handleDiscardProgress = useCallback(async () => {
    setShowResumeModal(false);
    setInterruptedProgress(null);
    try {
      if (window.electronAPI?.clearInterruptedProgress) {
        await window.electronAPI.clearInterruptedProgress();
      }
    } catch (err) {
      console.error('Failed to discard progress:', err);
    }
  }, []);

  const handleOpenFolder = useCallback(async (folderPath, executionResultsOverride) => {
    const targetPath = (executionResultsOverride || executionResults)?.outputDir || folderPath;
    if (targetPath && window.electronAPI?.openFolder) {
      await window.electronAPI.openFolder(targetPath);
    }
  }, [executionResults]);

  return {
    progress,
    setProgress,
    executionResults,
    setExecutionResults,
    showConfirmation,
    setShowConfirmation,
    showCancelConfirmation,
    setShowCancelConfirmation,
    showResumeModal,
    interruptedProgress,
    checkInterruptedProgress,
    handleExecuteBatch,
    handleCancelBatch,
    confirmCancel,
    handleResume,
    handleDiscardProgress,
    handleOpenFolder,
    // Safety check
    safetyCheckResult,
    showSafetyWarning,
    isValidating,
    handleOverrideSafetyCheck,
    handleDismissSafetyCheck,
  };
}
