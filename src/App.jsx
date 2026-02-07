/**
 * BatchMyPhotos - Main React Application Component
 * 
 * Thin orchestrator that composes custom hooks for:
 * - Theme management (useTheme)
 * - Batch settings (useSettings)
 * - Folder selection & drag-drop (useFolderSelection)
 * - Batch execution & progress (useBatchExecution)
 * - Undo/rollback (useRollback)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Camera, Sun, Moon, Mail, History } from 'lucide-react';

// Constants
import { STATES } from './constants/appStates';
import { STRINGS } from './constants/strings';

// Custom hooks
import { useTheme } from './hooks/useTheme';
import { useSettings } from './hooks/useSettings';
import { useFolderSelection } from './hooks/useFolderSelection';
import { useBatchExecution } from './hooks/useBatchExecution';
import { useRollback } from './hooks/useRollback';

// Components
import { ValidationModal, ConfirmationModal, CancelConfirmationModal, ResumeModal, UndoConfirmationModal, HistoryModal, SafetyCheckModal } from './components/Modals';
import { ScanningCard, ExecutingCard, CompleteCard, ErrorCard, UndoCompleteCard } from './components/StatusCards';
import { PreviewPanel } from './components/PreviewPanel';
import { IdleScreen } from './components/DropZone';

function App() {
  // ============================================================================
  // CORE STATE
  // ============================================================================
  const [appState, setAppState] = useState(STATES.IDLE);
  const [folderPath, setFolderPath] = useState(null);
  const [scanResults, setScanResults] = useState(null);
  const [previewResults, setPreviewResults] = useState(null);
  const [error, setError] = useState(null);
  const [expandedBatch, setExpandedBatch] = useState(null);
  const [validationError, setValidationError] = useState(null);
  const [isRefreshingPreview, setIsRefreshingPreview] = useState(false);

  // Ref to track if a preview refresh should be cancelled
  const previewCancelledRef = useRef(false);
  // Ref to read appState inside effects without triggering re-runs
  const appStateRef = useRef(appState);
  appStateRef.current = appState;

  // ============================================================================
  // CUSTOM HOOKS
  // ============================================================================
  const { theme, toggleTheme } = useTheme();
  
  const settings = useSettings();
  const {
    maxFilesPerBatch, outputPrefix, batchMode, sortBy, outputDir,
    selectedPresetName, refreshingField, setRefreshingField,
    setSelectedPresetName, resetSettings, handleSettingsChange,
    handleSelectOutputFolder,
  } = settings;

  const batch = useBatchExecution({ setAppState, setError });
  const {
    progress, setProgress, executionResults, setExecutionResults,
    showConfirmation, setShowConfirmation,
    showCancelConfirmation, showResumeModal, interruptedProgress,
    checkInterruptedProgress,
    handleExecuteBatch, handleCancelBatch, confirmCancel,
    handleResume, handleDiscardProgress, handleOpenFolder,
    // Safety check
    safetyCheckResult, showSafetyWarning,
    handleOverrideSafetyCheck, handleDismissSafetyCheck,
  } = batch;

  const rollback = useRollback({
    appState, setAppState, setError, setProgress, setExecutionResults,
  });
  const {
    rollbackAvailable, rollbackInfo,
    showUndoConfirmation, isRollingBack,
    handleUndoClick, handleExecuteUndo, setShowUndoConfirmation,
    clearRollback,
    // History
    operationHistory, showHistoryModal, setShowHistoryModal,
    handleHistoryUndoClick, confirmHistoryUndo, cancelHistoryUndo,
    showHistoryUndoConfirmation, pendingHistoryUndo,
    handleDeleteHistoryEntry,
    handleClearHistory, handleValidateEntry,
    // Undo complete
    undoCompleteResult, clearUndoComplete,
  } = rollback;

  // ============================================================================
  // FOLDER SCANNING
  // ============================================================================
  
  // Stable ref for loadRecentFolders to break the circular dependency
  // between scanFolder -> folder -> scanFolder
  const loadRecentFoldersRef = useRef(null);

  const scanFolder = useCallback(async (path) => {
    setAppState(STATES.SCANNING);
    setFolderPath(path);
    setError(null);
    resetSettings();
    setExpandedBatch(null);

    try {
      const results = await window.electronAPI.scanFolder(path);

      if (results.success) {
        setScanResults(results);

        // Add to recent folders
        if (window.electronAPI?.addRecentFolder) {
          await window.electronAPI.addRecentFolder(path);
          // Reload recent folders list via stable ref
          if (loadRecentFoldersRef.current) {
            await loadRecentFoldersRef.current();
          }
        }

        const preview = await window.electronAPI.previewBatches(path, 500);
        if (preview.success) {
          setPreviewResults(preview);
          setAppState(STATES.READY);
        } else {
          throw new Error(preview.error);
        }
      } else {
        throw new Error(results.error);
      }
    } catch (err) {
      setError(err.message);
      setAppState(STATES.ERROR);
    }
  }, [resetSettings]);

  const folder = useFolderSelection({ setAppState, setError, scanFolder });
  const {
    isDragOver, recentFolders,
    loadRecentFolders,
    handleSelectFolder, handleSelectRecentFolder,
    handleDragOver, handleDragLeave, handleDrop,
  } = folder;
  
  // Keep the ref in sync with the latest loadRecentFolders
  loadRecentFoldersRef.current = loadRecentFolders;

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Load settings and check for interrupted progress on mount
  useEffect(() => {
    loadRecentFolders();
    checkInterruptedProgress();
  }, [loadRecentFolders, checkInterruptedProgress]);

  // Debounced preview refresh when settings change
  const refreshPreview = useCallback(async () => {
    if (!folderPath) return;

    const maxFiles = parseInt(maxFilesPerBatch, 10);
    if (isNaN(maxFiles) || maxFiles < 1) return;

    const previewMaxFiles = Math.max(10, maxFiles);
    previewCancelledRef.current = false;
    setIsRefreshingPreview(true);

    try {
      const preview = await window.electronAPI.previewBatches(folderPath, previewMaxFiles, sortBy);
      if (!previewCancelledRef.current) {
        if (preview.success) {
          setPreviewResults(preview);
        } else {
          console.warn('[Preview] Refresh failed:', preview.error);
        }
      }
    } catch (err) {
      console.error('Failed to refresh preview:', err);
    } finally {
      if (!previewCancelledRef.current) {
        setIsRefreshingPreview(false);
        setRefreshingField(null);
      }
    }
  }, [folderPath, maxFilesPerBatch, sortBy, setRefreshingField]);

  useEffect(() => {
    if (appStateRef.current !== STATES.READY) return;

    previewCancelledRef.current = true;

    const debounceTimer = setTimeout(() => {
      if (appStateRef.current === STATES.READY) {
        refreshPreview();
      }
    }, 400);

    return () => {
      clearTimeout(debounceTimer);
      previewCancelledRef.current = true;
    };
  }, [refreshPreview]);

  // ============================================================================
  // VALIDATION & EXECUTION WRAPPERS
  // ============================================================================

  const validateInputs = () => {
    const maxFiles = parseInt(maxFilesPerBatch, 10);
    if (!maxFilesPerBatch || isNaN(maxFiles)) {
      setValidationError({
        title: 'Max Files Per Batch Required',
        message: 'Please enter the maximum number of files per batch folder.',
        field: 'maxFilesPerBatch',
      });
      return false;
    }

    if (!outputPrefix || outputPrefix.trim() === '') {
      setValidationError({
        title: 'Folder Name Required',
        message: 'Please enter a folder name for the batch folders.',
        field: 'outputPrefix',
      });
      return false;
    }

    if (/[\\/:*?"<>|]/.test(outputPrefix)) {
      setValidationError({
        title: 'Invalid Character Detected',
        message: 'Folder names cannot contain slashes (/) or special characters like \\ : * ? " < > |',
        field: 'outputPrefix',
      });
      return false;
    }

    return true;
  };

  const handleProceedClick = () => {
    if (!validateInputs()) return;
    setShowConfirmation(true);
  };

  const onConfirmExecute = () => {
    handleExecuteBatch({
      folderPath,
      maxFilesPerBatch,
      outputPrefix: outputPrefix.trim(),
      batchMode,
      outputDir,
      sortBy,
      selectedPresetName,
      previewBatchCount: previewResults?.batchCount || 0,
    });
  };

  // ============================================================================
  // RESET
  // ============================================================================

  const handleReset = () => {
    setAppState(STATES.IDLE);
    setFolderPath(null);
    setScanResults(null);
    setPreviewResults(null);
    setError(null);
    setExpandedBatch(null);
    resetSettings();
    // Reset batch execution state so stale data doesn't bleed into next run
    setExecutionResults(null);
    setProgress({ current: 0, total: 0 });
  };

  const handleResetWithRollbackClear = async () => {
    await clearRollback();
    clearUndoComplete();
    handleReset();
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  const isProcessing = appState === STATES.EXECUTING || appState === STATES.SCANNING;

  return (
    <div className={`app ${isProcessing ? 'processing' : ''}`}>
      <header className="app-header">
        <h1><Camera className="icon-inline" size={32} strokeWidth={2.5} /> {STRINGS.APP_TITLE}</h1>
        <p>{STRINGS.APP_SUBTITLE}</p>
        <div className="header-actions">
          {operationHistory.length > 0 && (
            <button
              className={`header-btn ${isProcessing ? 'disabled' : ''}`}
              onClick={() => setShowHistoryModal(true)}
              title="Operation History"
              disabled={isProcessing}
            >
              <History size={20} />
            </button>
          )}
          <button
            className={`header-btn ${isProcessing ? 'disabled' : ''}`}
            onClick={toggleTheme}
            title="Toggle theme"
            disabled={isProcessing}
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </header>

      <main className="app-main">
        {appState === STATES.IDLE && (
          <IdleScreen
            isDragOver={isDragOver}
            recentFolders={recentFolders}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onBrowseClick={handleSelectFolder}
            onSelectRecentFolder={handleSelectRecentFolder}
          />
        )}
        {appState === STATES.SCANNING && <ScanningCard />}
        {appState === STATES.READY && (
          <PreviewPanel
            folderPath={folderPath}
            scanResults={scanResults}
            previewResults={previewResults}
            isRefreshingPreview={isRefreshingPreview}
            refreshingField={refreshingField}
            settings={{ maxFilesPerBatch, outputPrefix, batchMode, sortBy, outputDir }}
            validationError={validationError}
            expandedBatch={expandedBatch}
            selectedPresetName={selectedPresetName}
            onPresetSelect={setSelectedPresetName}
            onSettingsChange={handleSettingsChange}
            onToggleBatch={(batchNumber) =>
              setExpandedBatch(expandedBatch === batchNumber ? null : batchNumber)
            }
            onSelectOutputFolder={handleSelectOutputFolder}
            onProceed={handleProceedClick}
            onReset={handleReset}
          />
        )}
        {appState === STATES.EXECUTING && (
          <ExecutingCard
            progress={progress}
            isRollback={isRollingBack}
            onCancel={(isRollingBack || batchMode === 'move') ? undefined : handleCancelBatch}
          />
        )}
        {appState === STATES.COMPLETE && undoCompleteResult && (
          <UndoCompleteCard
            undoResult={undoCompleteResult}
            onOpenFolder={async () => {
              const targetPath = undoCompleteResult.sourceFolder;
              if (targetPath && window.electronAPI?.openFolder) {
                await window.electronAPI.openFolder(targetPath);
              }
            }}
            onReset={() => {
              clearUndoComplete();
              handleReset();
            }}
          />
        )}
        {appState === STATES.COMPLETE && !undoCompleteResult && (
          <CompleteCard
            executionResults={executionResults}
            rollbackAvailable={rollbackAvailable}
            hasHistory={operationHistory.length > 0}
            onOpenFolder={() => handleOpenFolder(folderPath)}
            onReset={handleResetWithRollbackClear}
            onUndo={handleUndoClick}
            onShowHistory={() => setShowHistoryModal(true)}
          />
        )}
        {appState === STATES.ERROR && <ErrorCard error={error} onReset={handleReset} />}
      </main>

      <footer className="app-footer">
        <p>{STRINGS.FOOTER_PAIRING}</p>
        <p className="contact-text">
          <Mail size={14} className="email-icon" />
          {STRINGS.FOOTER_CONTACT}{' '}
          <a href={`mailto:${STRINGS.FOOTER_EMAIL}`} className="email-link" title="Click to send us an email">
            {STRINGS.FOOTER_EMAIL}
          </a>
        </p>
      </footer>

      {/* Click-blocking overlay during scanning only */}
      {appState === STATES.SCANNING && <div className="blocking-overlay" />}

      {/* Modals */}
      <ValidationModal error={validationError} onClose={() => setValidationError(null)} />

      <ConfirmationModal
        isOpen={showConfirmation}
        settings={{
          maxFilesPerBatch,
          outputPrefix,
          batchMode,
          outputDir,
          sortBy,
          batchCount: previewResults?.batchCount || 0,
          presetName: selectedPresetName,
        }}
        onConfirm={onConfirmExecute}
        onCancel={() => setShowConfirmation(false)}
      />

      <CancelConfirmationModal
        isOpen={showCancelConfirmation}
        onConfirm={confirmCancel}
        onClose={() => batch.setShowCancelConfirmation(false)}
      />

      <ResumeModal
        isOpen={showResumeModal}
        progress={interruptedProgress}
        onResume={handleResume}
        onDiscard={handleDiscardProgress}
      />

      <UndoConfirmationModal
        isOpen={showUndoConfirmation}
        rollbackInfo={rollbackInfo}
        onConfirm={handleExecuteUndo}
        onClose={() => setShowUndoConfirmation(false)}
      />

      <HistoryModal
        isOpen={showHistoryModal}
        history={operationHistory}
        onUndo={handleHistoryUndoClick}
        onDelete={handleDeleteHistoryEntry}
        onClearAll={handleClearHistory}
        onValidate={handleValidateEntry}
        onClose={() => setShowHistoryModal(false)}
      />

      {/* Rendered after HistoryModal so it stacks on top (same z-index, later DOM order wins) */}
      <UndoConfirmationModal
        isOpen={showHistoryUndoConfirmation}
        rollbackInfo={pendingHistoryUndo ? {
          totalFiles: pendingHistoryUndo.totalFiles,
          batchFolderCount: pendingHistoryUndo.batchFolderCount,
        } : null}
        onConfirm={confirmHistoryUndo}
        onClose={cancelHistoryUndo}
      />

      <SafetyCheckModal
        isOpen={showSafetyWarning}
        result={safetyCheckResult}
        onGoBack={handleDismissSafetyCheck}
        onProceed={handleOverrideSafetyCheck}
      />
    </div>
  );
}

export default App;
