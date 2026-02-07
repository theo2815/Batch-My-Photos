import { useState, useEffect, useCallback } from 'react';
import { STATES } from '../constants/appStates';

/**
 * Hook for managing rollback/undo state, operations, and persistent history.
 */
export function useRollback({ appState, setAppState, setError, setProgress, setExecutionResults }) {
  // Session-level rollback (backward compatible)
  const [rollbackAvailable, setRollbackAvailable] = useState(false);
  const [rollbackInfo, setRollbackInfo] = useState(null);
  const [showUndoConfirmation, setShowUndoConfirmation] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);

  // Persistent history
  const [operationHistory, setOperationHistory] = useState([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // History undo confirmation (mirrors session-level UndoConfirmationModal pattern)
  const [pendingHistoryUndo, setPendingHistoryUndo] = useState(null); // entry being confirmed
  const [showHistoryUndoConfirmation, setShowHistoryUndoConfirmation] = useState(false);

  // Undo complete result (shown after any undo finishes — session or history)
  const [undoCompleteResult, setUndoCompleteResult] = useState(null);

  // ============================================================================
  // SESSION-LEVEL ROLLBACK (backward compatible)
  // ============================================================================

  const checkRollbackAvailability = useCallback(async () => {
    if (window.electronAPI?.checkRollbackAvailable) {
      const info = await window.electronAPI.checkRollbackAvailable();
      if (info) {
        setRollbackAvailable(true);
        setRollbackInfo(info);
      } else {
        setRollbackAvailable(false);
        setRollbackInfo(null);
      }
    }
  }, []);

  // Check rollback availability when entering COMPLETE state
  useEffect(() => {
    if (appState === STATES.COMPLETE) {
      checkRollbackAvailability();
    }
  }, [appState, checkRollbackAvailability]);

  const handleUndoClick = useCallback(() => {
    setShowUndoConfirmation(true);
  }, []);

  const handleExecuteUndo = useCallback(async () => {
    setShowUndoConfirmation(false);
    setIsRollingBack(true);
    setAppState(STATES.EXECUTING);
    setProgress({ current: 0, total: rollbackInfo?.totalFiles || 0 });

    let cleanupProgress = null;
    if (window.electronAPI?.onRollbackProgress) {
      cleanupProgress = window.electronAPI.onRollbackProgress((progressData) => {
        setProgress({
          current: progressData.restoredFiles || progressData.current || 0,
          total: progressData.total || rollbackInfo?.totalFiles || 0,
        });
      });
    }

    try {
      const results = await window.electronAPI.rollbackBatch();

      if (results.success) {
        setRollbackAvailable(false);
        setRollbackInfo(null);
        setExecutionResults(null);
        // Show undo complete screen instead of going to IDLE
        setUndoCompleteResult({
          restoredFiles: results.restoredFiles,
          totalFiles: results.totalFiles,
          sourceFolder: results.sourceFolder,
          deletedFolders: results.deletedFolders,
        });
        setAppState(STATES.COMPLETE);
        // Refresh history since the entry was removed
        await loadHistory();
      } else if (results.cancelled) {
        setAppState(STATES.COMPLETE);
      } else {
        throw new Error(results.error || 'Rollback failed');
      }
    } catch (err) {
      setError(err.message);
      setAppState(STATES.ERROR);
    } finally {
      if (cleanupProgress) {
        cleanupProgress();
      }
      setIsRollingBack(false);
    }
  }, [rollbackInfo, setAppState, setError, setProgress, setExecutionResults]);

  const clearRollback = useCallback(async () => {
    if (rollbackAvailable && window.electronAPI?.clearRollbackManifest) {
      await window.electronAPI.clearRollbackManifest();
    }
    setRollbackAvailable(false);
    setRollbackInfo(null);
  }, [rollbackAvailable]);

  // ============================================================================
  // PERSISTENT HISTORY
  // ============================================================================

  const loadHistory = useCallback(async () => {
    if (window.electronAPI?.getOperationHistory) {
      try {
        const history = await window.electronAPI.getOperationHistory();
        setOperationHistory(history || []);
      } catch (err) {
        console.error('Failed to load operation history:', err);
        setOperationHistory([]);
      }
    }
  }, []);

  // Load history on mount
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Refresh history when entering COMPLETE or IDLE state (after operations finish)
  useEffect(() => {
    if (appState === STATES.COMPLETE || appState === STATES.IDLE) {
      loadHistory();
    }
  }, [appState, loadHistory]);

  /**
   * Step 1: User clicks Undo on a history entry → show confirmation dialog.
   * The entry object is stored so the confirmation modal can display details.
   */
  const handleHistoryUndoClick = useCallback((entry) => {
    setPendingHistoryUndo(entry);
    // Keep History modal open — it stays visible behind the confirmation overlay
    setShowHistoryUndoConfirmation(true);
  }, []);

  /**
   * Step 2: User cancels the history undo confirmation.
   */
  const cancelHistoryUndo = useCallback(() => {
    setShowHistoryUndoConfirmation(false);
    setPendingHistoryUndo(null);
  }, []);

  /**
   * Step 3: User confirms the history undo → execute the rollback.
   */
  const confirmHistoryUndo = useCallback(async () => {
    const entry = pendingHistoryUndo;
    if (!entry) return;

    setShowHistoryUndoConfirmation(false);
    setShowHistoryModal(false);
    setPendingHistoryUndo(null);
    setIsRollingBack(true);
    setAppState(STATES.EXECUTING);
    setProgress({ current: 0, total: entry.totalFiles || 0 });

    let cleanupProgress = null;
    if (window.electronAPI?.onRollbackProgress) {
      cleanupProgress = window.electronAPI.onRollbackProgress((progressData) => {
        setProgress({
          current: progressData.restoredFiles || progressData.current || 0,
          total: progressData.total || entry.totalFiles || 0,
        });
      });
    }

    try {
      const results = await window.electronAPI.rollbackHistoryEntry(entry.operationId);

      if (results.success) {
        // Clear session-level rollback if it matches
        if (rollbackInfo?.operationId === entry.operationId) {
          setRollbackAvailable(false);
          setRollbackInfo(null);
        }
        setExecutionResults(null);
        // Show undo complete screen
        setUndoCompleteResult({
          restoredFiles: results.restoredFiles,
          totalFiles: results.totalFiles,
          sourceFolder: results.sourceFolder,
          deletedFolders: results.deletedFolders,
        });
        setAppState(STATES.COMPLETE);
        // Refresh history
        await loadHistory();
      } else if (results.cancelled) {
        setAppState(STATES.IDLE);
      } else {
        throw new Error(results.error || 'History rollback failed');
      }
    } catch (err) {
      setError(err.message);
      setAppState(STATES.ERROR);
    } finally {
      if (cleanupProgress) {
        cleanupProgress();
      }
      setIsRollingBack(false);
    }
  }, [pendingHistoryUndo, rollbackInfo, setAppState, setError, setProgress, setExecutionResults, loadHistory]);

  const handleDeleteHistoryEntry = useCallback(async (operationId) => {
    if (window.electronAPI?.deleteHistoryEntry) {
      try {
        const result = await window.electronAPI.deleteHistoryEntry(operationId);
        if (result.success) {
          await loadHistory();
          // Also clear session rollback if it was for this operation
          if (rollbackInfo?.operationId === operationId) {
            setRollbackAvailable(false);
            setRollbackInfo(null);
          }
        }
        return result.success;
      } catch (err) {
        console.error('Failed to delete history entry:', err);
        return false;
      }
    }
    return false;
  }, [rollbackInfo, loadHistory]);

  const handleClearHistory = useCallback(async () => {
    if (window.electronAPI?.clearOperationHistory) {
      try {
        const result = await window.electronAPI.clearOperationHistory();
        if (result.success) {
          setOperationHistory([]);
        }
        return result.success;
      } catch (err) {
        console.error('Failed to clear history:', err);
        return false;
      }
    }
    return false;
  }, []);

  const handleValidateEntry = useCallback(async (operationId) => {
    if (window.electronAPI?.validateHistoryEntry) {
      try {
        return await window.electronAPI.validateHistoryEntry(operationId);
      } catch (err) {
        console.error('Failed to validate history entry:', err);
        return { valid: false, error: err.message };
      }
    }
    return { valid: false, error: 'API not available' };
  }, []);

  /**
   * Clear the undo complete result and return to idle.
   */
  const clearUndoComplete = useCallback(() => {
    setUndoCompleteResult(null);
  }, []);

  return {
    // Session-level rollback
    rollbackAvailable,
    rollbackInfo,
    showUndoConfirmation,
    isRollingBack,
    handleUndoClick,
    handleExecuteUndo,
    setShowUndoConfirmation,
    clearRollback,
    // Persistent history
    operationHistory,
    showHistoryModal,
    setShowHistoryModal,
    loadHistory,
    handleHistoryUndoClick,
    confirmHistoryUndo,
    cancelHistoryUndo,
    showHistoryUndoConfirmation,
    pendingHistoryUndo,
    handleDeleteHistoryEntry,
    handleClearHistory,
    handleValidateEntry,
    // Undo complete
    undoCompleteResult,
    clearUndoComplete,
  };
}
