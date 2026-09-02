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
import { Sun, Moon, Mail, History, Loader2 } from 'lucide-react';

// Constants
import { STATES } from './constants/appStates';
import { STRINGS } from './constants/strings';

// Brand
import appLogo from './images/app_icon.png';

// Custom hooks
import { useTheme } from './hooks/useTheme';
import { useSettings } from './hooks/useSettings';
import { useFolderSelection } from './hooks/useFolderSelection';
import { useBatchExecution } from './hooks/useBatchExecution';
import { useRollback } from './hooks/useRollback';
import { useBlurDetection } from './hooks/useBlurDetection';
import { useUpdateCheck } from './hooks/useUpdateCheck';

// Authentication Components
import { LoginScreen } from './components/Auth/LoginScreen';
import { ProfileDropdown } from './components/Auth/ProfileDropdown';

// Components
import { ValidationModal, ConfirmationModal, CancelConfirmationModal, ResumeModal, ResumeRollbackModal, UndoConfirmationModal, HistoryModal, SafetyCheckModal, BlurSensitivityModal, DeviceManagerModal } from './components/Modals';
import { ScanningCard, ExecutingCard, CompleteCard, ErrorCard, UndoCompleteCard, BatchLimitCard } from './components/StatusCards';
import { PreviewPanel } from './components/PreviewPanel';
import { IdleScreen } from './components/DropZone';
import BoxSpinner from './components/common/BoxSpinner';
import { UpdateBanner } from './components/common/UpdateBanner';

function App() {
  // ============================================================================
  // AUTHENTICATION STATE
  // ============================================================================
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isVerifyingAuth, setIsVerifyingAuth] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

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
    blurDetectionEnabled, blurSensitivity, blurCategories,
  } = settings;

  const blurDetection = useBlurDetection({
    folderPath,
    blurDetectionEnabled,
    blurSensitivity,
    blurCategories,
  });
  const {
    blurryGroups, isAnalyzing: isAnalyzingBlur,
    runBlurAnalysis, resetBlurState, clearAnalysisCache,
  } = blurDetection;

  // Blur sensitivity modal state
  const [showBlurSensitivityModal, setShowBlurSensitivityModal] = useState(false);
  const [analysisRequestId, setAnalysisRequestId] = useState(0);

  // Device manager modal state
  const [showDeviceManagerModal, setShowDeviceManagerModal] = useState(false);

  // Version update check
  const { showBanner, latestVersion, updateAvailable, handleUpdateClick, dismiss: dismissUpdate } = useUpdateCheck();

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
    // Batch limit
    isCheckingLimit, batchLimitExceeded, clearBatchLimitExceeded,
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
    // Interrupted rollback recovery
    checkInterruptedRollback,
    showResumeRollbackModal, interruptedRollback,
    handleResumeRollback, handleDiscardRollback,
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
    resetBlurState();
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
  }, [resetSettings, resetBlurState]);

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

  // Check authentication on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const authStatus = await window.electronAPI.authCheckStatus();
        setIsAuthenticated(authStatus.isAuthenticated);
        setUser(authStatus.user);
        setSubscription(authStatus.subscription);
        setIsOffline(authStatus.offline || false);
        setSessionExpired(authStatus.sessionExpired || false);
      } catch (err) {
        // IPC rejected (rate-limit or bridge failure) — fall back to the login
        // screen instead of hanging on the loading spinner forever.
        console.error('[Auth] checkAuth failed:', err);
        setIsAuthenticated(false);
      } finally {
        setAuthLoading(false);
      }
    }
    checkAuth();
  }, []);

  // Load settings and check for interrupted progress on mount
  useEffect(() => {
    loadRecentFolders();
    checkInterruptedProgress();
    checkInterruptedRollback();
  }, [loadRecentFolders, checkInterruptedProgress, checkInterruptedRollback]);

  // Debounced preview refresh when settings change
  const refreshPreview = useCallback(async () => {
    if (!folderPath) return;

    const maxFiles = parseInt(maxFilesPerBatch, 10);
    if (isNaN(maxFiles) || maxFiles < 1) return;

    const previewMaxFiles = Math.max(10, maxFiles);
    previewCancelledRef.current = false;
    setIsRefreshingPreview(true);

    // Pass blurry groups as excludeGroups if blur detection is enabled
    const excludeGroups = blurDetectionEnabled && blurryGroups.length > 0 ? blurryGroups : null;

    try {
      const preview = await window.electronAPI.previewBatches(folderPath, previewMaxFiles, sortBy, excludeGroups);
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
  }, [folderPath, maxFilesPerBatch, sortBy, blurDetectionEnabled, blurryGroups, setRefreshingField]);

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

  // Track when blur toggle just turned on (to show modal instead of auto-analyzing)
  const prevBlurEnabledRef = useRef(blurDetectionEnabled);

  // Trigger blur analysis when sensitivity or folder changes (but NOT on initial toggle-on)
  useEffect(() => {
    const justEnabled = !prevBlurEnabledRef.current && blurDetectionEnabled;
    prevBlurEnabledRef.current = blurDetectionEnabled;

    if (!blurDetectionEnabled) {
      // When toggled off, reset blur state so groups return to normal batches
      resetBlurState();
      return;
    }
    if (!folderPath || appStateRef.current !== STATES.READY) return;

    // Show the sensitivity modal when toggle just turned on (manual or via preset)
    if (justEnabled) {
      setShowBlurSensitivityModal(true);
      return;
    }

    // Re-analyze on sensitivity change, folder change, or explicit request (analysisRequestId)
    runBlurAnalysis();
  }, [blurDetectionEnabled, blurSensitivity, blurCategories, folderPath, analysisRequestId, runBlurAnalysis, resetBlurState]);

  // Called when user clicks "Start Analysis" in the blur-detection modal
  const handleConfirmBlurAnalysis = useCallback(({ categories, sensitivity }) => {
    handleSettingsChange('blurCategories', categories);
    handleSettingsChange('blurSensitivity', sensitivity);
    setShowBlurSensitivityModal(false);
    clearAnalysisCache();
    setAnalysisRequestId(id => id + 1);
  }, [handleSettingsChange, clearAnalysisCache]);

  // Called when user dismisses the sensitivity modal without starting
  const handleDismissBlurModal = useCallback(() => {
    setShowBlurSensitivityModal(false);
    handleSettingsChange('blurDetectionEnabled', false);
  }, [handleSettingsChange]);

  // Called from SettingsPanel "Change Sensitivity" button
  const handleOpenBlurModal = useCallback(() => {
    setShowBlurSensitivityModal(true);
  }, []);

  // Refresh preview when blurry groups change (after analysis completes or user un-flags)
  useEffect(() => {
    if (appStateRef.current !== STATES.READY) return;
    if (!blurDetectionEnabled) return;

    // Debounce to avoid rapid re-renders when multiple groups are un-flagged
    const timer = setTimeout(() => {
      if (appStateRef.current === STATES.READY) {
        refreshPreview();
      }
    }, 300);

    return () => clearTimeout(timer);
    // We intentionally exclude refreshPreview from deps to avoid infinite loops.
    // This effect should only fire when blurryGroups changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blurryGroups, blurDetectionEnabled]);

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
      blurryGroups: blurDetectionEnabled && blurryGroups.length > 0 ? blurryGroups : null,
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
    resetBlurState();
    // Reset batch execution state so stale data doesn't bleed into next run
    setExecutionResults(null);
    setProgress({ current: 0, total: 0 });
    clearBatchLimitExceeded();
  };

  const handleResetWithRollbackClear = async () => {
    await clearRollback();
    clearUndoComplete();
    handleReset();
  };

  // ============================================================================
  // AUTHENTICATION HANDLERS
  // ============================================================================

  // Handle successful login
  const handleLoginSuccess = async () => {
    setIsVerifyingAuth(true);
    try {
      const authStatus = await window.electronAPI.authCheckStatus();
      setUser(authStatus.user);
      setSubscription(authStatus.subscription);
      setIsOffline(authStatus.offline || false);
      setIsAuthenticated(true);
    } finally {
      setIsVerifyingAuth(false);
    }
  };

  // Handle logout
  const handleLogout = async () => {
    await window.electronAPI.authLogout();
    setIsAuthenticated(false);
    setUser(null);
    setSubscription(null);
    setIsOffline(false);
    // Reset app state when logging out
    handleReset();
  };

  // Handle view profile (opens website dashboard)
  const handleViewProfile = async () => {
    await window.electronAPI.authOpenDashboard();
  };

  // Handle upgrade to Pro (opens website dashboard with upgrade parameter)
  const handleUpgrade = async () => {
    await window.electronAPI.authOpenDashboard();
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  const isProcessing = appState === STATES.EXECUTING || appState === STATES.SCANNING;

  // Show loading screen while checking authentication or verifying after login
  if (authLoading || isVerifyingAuth) {
    return (
      <div className="app">
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          gap: '16px',
        }}>
          <Loader2
            size={36}
            style={{
              color: 'var(--accent-primary)',
              animation: 'spin 1.2s linear infinite',
            }}
          />
          <p style={{
            color: 'var(--text-secondary)',
            fontSize: '15px',
            fontWeight: 500,
          }}>
            {isVerifyingAuth ? 'Signing you in...' : 'Loading...'}
          </p>
        </div>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} sessionExpired={sessionExpired} />;
  }

  // Main app (authenticated users only)
  return (
    <div className={`app ${isProcessing ? 'processing' : ''}`}>
      {showBanner && (
        <UpdateBanner
          latestVersion={latestVersion}
          onUpdateClick={handleUpdateClick}
          onDismiss={dismissUpdate}
        />
      )}
      <header className="app-header">
        <h1><img src={appLogo} className="app-logo" alt="" /> {STRINGS.APP_TITLE}</h1>
        <p>{STRINGS.APP_SUBTITLE}</p>
        <div className="header-actions">
          <ProfileDropdown
            user={user}
            subscription={subscription}
            onLogout={handleLogout}
            onViewProfile={handleViewProfile}
            onUpgrade={handleUpgrade}
            onManageDevices={() => setShowDeviceManagerModal(true)}
            updateAvailable={updateAvailable}
            latestVersion={latestVersion}
            onUpdateClick={handleUpdateClick}
          />
          <div className="header-icons">
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
        {appState === STATES.READY && !batchLimitExceeded && (
          <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
            <PreviewPanel
              folderPath={folderPath}
              scanResults={scanResults}
              previewResults={previewResults}
              isRefreshingPreview={isRefreshingPreview}
              refreshingField={refreshingField}
              settings={{ maxFilesPerBatch, outputPrefix, batchMode, sortBy, outputDir, blurDetectionEnabled, blurSensitivity, blurCategories }}
              validationError={validationError}
              expandedBatch={expandedBatch}
              selectedPresetName={selectedPresetName}
              onPresetSelect={setSelectedPresetName}
              blurDetection={blurDetection}
              onSettingsChange={handleSettingsChange}
              onOpenBlurModal={handleOpenBlurModal}
              onToggleBatch={(batchNumber) =>
                setExpandedBatch(expandedBatch === batchNumber ? null : batchNumber)
              }
              onSelectOutputFolder={handleSelectOutputFolder}
              onProceed={handleProceedClick}
              onReset={handleReset}
            />
            {isCheckingLimit && (
              <div className="checking-limit-overlay">
                <BoxSpinner />
                <p>Checking batch usage...</p>
              </div>
            )}
          </div>
        )}
        {appState === STATES.READY && batchLimitExceeded && (
          <BatchLimitCard
            limitInfo={batchLimitExceeded}
            onUpgrade={handleUpgrade}
            onGoBack={() => {
              clearBatchLimitExceeded();
            }}
            onRetry={() => {
              clearBatchLimitExceeded();
              onConfirmExecute();
            }}
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
            onExportReport={async () => {
              if (window.electronAPI?.exportBatchReport && executionResults) {
                await window.electronAPI.exportBatchReport(executionResults);
              }
            }}
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

      <ResumeRollbackModal
        isOpen={showResumeRollbackModal}
        info={interruptedRollback}
        onResume={handleResumeRollback}
        onDiscard={handleDiscardRollback}
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

      <BlurSensitivityModal
        isOpen={showBlurSensitivityModal}
        currentCategories={blurCategories}
        currentSensitivity={blurSensitivity}
        onStart={handleConfirmBlurAnalysis}
        onCancel={handleDismissBlurModal}
      />

      <DeviceManagerModal
        isOpen={showDeviceManagerModal}
        onClose={() => setShowDeviceManagerModal(false)}
      />
    </div>
  );
}

export default App;
