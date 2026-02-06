/**
 * BatchMyPhotos - Main React Application Component
 * 
 * This component provides the user interface for the PhotoBatcher application:
 * - Drag & Drop zone for folder selection
 * - Settings panel for batch configuration
 * - Preview and confirmation before execution
 * - Progress tracking during batch operation
 * - Theme toggle (dark/light)
 * - Recent folders list
 * - Batch preview with file details
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Camera, Sun, Moon, Mail } from 'lucide-react';

// Import application states from constants
import { STATES } from './constants/appStates';
import { STRINGS, formatString } from './constants/strings';

// Import components
import { ValidationModal, ConfirmationModal, CancelConfirmationModal, ResumeModal, UndoConfirmationModal } from './components/Modals';
import { ScanningCard, ExecutingCard, CompleteCard, ErrorCard } from './components/StatusCards';
import { PreviewPanel } from './components/PreviewPanel';
import { IdleScreen } from './components/DropZone';

function App() {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  
  /* State Management */
  const [appState, setAppState] = useState(STATES.IDLE);
  const [folderPath, setFolderPath] = useState(null);
  const [scanResults, setScanResults] = useState(null);
  const [previewResults, setPreviewResults] = useState(null);
  const [executionResults, setExecutionResults] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState(null);
  
  // User settings - stored as strings to allow empty input
  const [maxFilesPerBatch, setMaxFilesPerBatch] = useState('500');
  const [outputPrefix, setOutputPrefix] = useState('Batch');
  
  // UX Improvements
  const [theme, setTheme] = useState('dark');
  const [recentFolders, setRecentFolders] = useState([]);
  const [expandedBatch, setExpandedBatch] = useState(null);
  
  // Preset State (lifted from SettingsPanel)
  const [selectedPresetName, setSelectedPresetName] = useState('');

  // Move vs Copy mode
  const [batchMode, setBatchMode] = useState('move'); // 'move' or 'copy'
  const [sortBy, setSortBy] = useState('name-asc'); // Sort order for files
  const [outputDir, setOutputDir] = useState(null);

  // Drag & drop visual state
  const [isDragOver, setIsDragOver] = useState(false);
  
  // Validation modal state
  const [validationError, setValidationError] = useState(null);
  
  // Confirmation modal state
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  
  // Preview refresh loading state
  const [isRefreshingPreview, setIsRefreshingPreview] = useState(false);
  const [refreshingField, setRefreshingField] = useState(null); // 'maxFilesPerBatch' or 'sortBy'
  
  // Resume modal state (for interrupted batch operations)
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [interruptedProgress, setInterruptedProgress] = useState(null);
  
  // Undo/Rollback state
  const [rollbackAvailable, setRollbackAvailable] = useState(false);
  const [rollbackInfo, setRollbackInfo] = useState(null);
  const [showUndoConfirmation, setShowUndoConfirmation] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  
  // Ref to track if a preview refresh should be cancelled
  const previewCancelledRef = React.useRef(false);

  // ============================================================================
  // EFFECTS
  // ============================================================================
  
  // Load theme and recent folders on mount, check for interrupted progress
  useEffect(() => {
    const loadSettings = async () => {
      if (window.electronAPI?.getTheme) {
        const savedTheme = await window.electronAPI.getTheme();
        setTheme(savedTheme);
      }
      // Clean up stale folders first (removes non-existent paths), then use that result
      if (window.electronAPI?.cleanupRecentFolders) {
        const validFolders = await window.electronAPI.cleanupRecentFolders();
        setRecentFolders(validFolders);
      } else if (window.electronAPI?.getRecentFolders) {
        // Fallback for backwards compatibility
        const folders = await window.electronAPI.getRecentFolders();
        setRecentFolders(folders);
      }
      
      // Check for interrupted batch operation from a previous session
      if (window.electronAPI?.checkInterruptedProgress) {
        const progress = await window.electronAPI.checkInterruptedProgress();
        if (progress) {
          setInterruptedProgress(progress);
          setShowResumeModal(true);
        }
      }
    };
    loadSettings();
  }, []);
  
  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  
  // Subscribe to batch progress updates
  useEffect(() => {
    if (!window.electronAPI?.onBatchProgress) return;
    
    const cleanup = window.electronAPI.onBatchProgress((data) => {
      setProgress(data);
    });
    
    return cleanup;
  }, []);

  // ============================================================================
  // THEME TOGGLE
  // ============================================================================
  
  const toggleTheme = async () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    if (window.electronAPI?.setTheme) {
      await window.electronAPI.setTheme(newTheme);
    }
  };

  // ============================================================================
  // FOLDER SELECTION & SCANNING
  // ============================================================================
  
  /**
   * Handle folder selection via native dialog
   */
  const handleSelectFolder = async () => {
    const selectedPath = await window.electronAPI.selectFolder();
    if (selectedPath) {
      await scanFolder(selectedPath);
    }
  };
  
  /**
   * Scan a folder and analyze its contents
   */
  const scanFolder = useCallback(async (path) => {
    setAppState(STATES.SCANNING);
    setFolderPath(path);
    setError(null);
    
    // Reset settings to defaults when scanning a new folder
    setMaxFilesPerBatch('500');
    setOutputPrefix('Batch');
    setBatchMode('move');
    setOutputDir(null);
    // Keep internal UI state like expandedBatch cleared
    setExpandedBatch(null);
    // Clear selected preset to avoid confusion
    setSelectedPresetName('');

    try {
      const results = await window.electronAPI.scanFolder(path);
      
      if (results.success) {
        setScanResults(results);
        
        // Add to recent folders
        if (window.electronAPI?.addRecentFolder) {
          const updated = await window.electronAPI.addRecentFolder(path);
          setRecentFolders(updated);
        }
        
        // Also get preview of batches
        const preview = await window.electronAPI.previewBatches(path, 500); // Default 500
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
  }, []);
  
  /**
   * Handle selecting a recent folder
   */
  const handleSelectRecentFolder = useCallback(async (path) => {
    // Validate folder exists before scanning
    const registerResult = await window.electronAPI.registerDroppedFolder(path);
    
    if (registerResult.success) {
      await scanFolder(path);
    } else {
      setError(`The folder "${path.split(/[/\\]/).pop()}" no longer exists or is inaccessible.`);
      setAppState(STATES.ERROR);
      
      if (window.electronAPI?.getRecentFolders) {
        const currentFolders = await window.electronAPI.getRecentFolders();
        setRecentFolders(currentFolders.filter(f => f !== path));
      }
    }
  }, [scanFolder]);
  
  /**
   * Refresh preview when settings change
   */
  const refreshPreview = async () => {
    if (!folderPath) return;
    
    const maxFiles = parseInt(maxFilesPerBatch, 10);
    if (isNaN(maxFiles) || maxFiles < 1) return;
    
    const previewMaxFiles = Math.max(10, maxFiles);
    
    previewCancelledRef.current = false;
    setIsRefreshingPreview(true);
    
    try {
      const preview = await window.electronAPI.previewBatches(folderPath, previewMaxFiles, sortBy);
      if (!previewCancelledRef.current && preview.success) {
        setPreviewResults(preview);
      }
    } catch (err) {
      console.error('Failed to refresh preview:', err);
    } finally {
      if (!previewCancelledRef.current) {
        setIsRefreshingPreview(false);
        setRefreshingField(null);
      }
    }
  };
  
  // Debounced refresh preview
  useEffect(() => {
    if (appState !== STATES.READY) return;
    
    previewCancelledRef.current = true;
    
    const debounceTimer = setTimeout(() => {
      refreshPreview();
    }, 400);
    
    return () => {
      clearTimeout(debounceTimer);
      previewCancelledRef.current = true;
    };
  }, [maxFilesPerBatch, folderPath, sortBy, appState]);

  // ============================================================================
  // DRAG & DROP HANDLERS
  // ============================================================================
  
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);
  
  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);
  
  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      const item = items[0];
      const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
      
      if (entry && entry.isDirectory) {
        const file = e.dataTransfer.files[0];
        if (file && file.path) {
          const registerResult = await window.electronAPI.registerDroppedFolder(file.path);
          if (registerResult.success) {
            await scanFolder(file.path);
          } else {
            setError(registerResult.error || 'Failed to access the dropped folder');
            setAppState(STATES.ERROR);
          }
        }
      } else {
        setError('Please drop a folder, not a file.');
        setAppState(STATES.ERROR);
      }
    }
  }, [scanFolder]);

  // ============================================================================
  // BATCH EXECUTION PREP
  // ============================================================================
  
  const validateInputs = () => {
    const maxFiles = parseInt(maxFilesPerBatch, 10);
    if (!maxFilesPerBatch || isNaN(maxFiles)) {
      setValidationError({
        title: 'Max Files Per Batch Required',
        message: 'Please enter the maximum number of files per batch folder.',
        field: 'maxFilesPerBatch'
      });
      return false;
    }
    
    if (!outputPrefix || outputPrefix.trim() === '') {
      setValidationError({
        title: 'Folder Name Required',
        message: 'Please enter a folder name for the batch folders.',
        field: 'outputPrefix'
      });
      return false;
    }

    // Check for illegal characters
    if (/[\\/:*?"<>|]/.test(outputPrefix)) {
      setValidationError({
        title: 'Invalid Character Detected',
        message: 'Folder names cannot contain slashes (/) or special characters like \\ : * ? " < > |',
        field: 'outputPrefix'
      });
      return false;
    }
    
    return true;
  };

  const handleProceedClick = () => {
    if (!validateInputs()) {
      return;
    }
    setShowConfirmation(true);
  };


  /**
   * Execute the batch splitting operation (called after confirmation)
   */
  const handleExecuteBatch = async () => {
    setShowConfirmation(false);
    
    // Auto-save current preset if one is selected (User Requirement)
    if (selectedPresetName && window.electronAPI?.savePreset) {
      try {
        await window.electronAPI.savePreset(selectedPresetName, {
          maxFilesPerBatch,
          outputPrefix,
          batchMode,
          sortBy,
          outputDir
        });
      } catch (err) {
        console.error('Failed to auto-save preset:', err);
      }
    }
    
    const maxFiles = parseInt(maxFilesPerBatch, 10);
    
    setAppState(STATES.EXECUTING);
    setProgress({ current: 0, total: previewResults?.batchCount || 0 });
    
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
        // Operation was cancelled - show partial results
        setExecutionResults({
          ...results,
          wasCancelled: true
        });
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
  };
  
  /**
   * Request to cancel the current batch operation
   * Shows confirmation modal
   */
  const handleCancelBatch = () => {
    setShowCancelConfirmation(true);
  };

  /**
   * Confirm cancellation
   * Actually triggers the cancellation
   */
  const confirmCancel = async () => {
    setShowCancelConfirmation(false);
    if (window.electronAPI?.cancelBatch) {
      await window.electronAPI.cancelBatch();
    }
  };
  
  /**
   * Open folder in file explorer
   */
  const handleOpenFolder = async () => {
    const targetPath = executionResults?.outputDir || folderPath;
    if (targetPath && window.electronAPI?.openFolder) {
      await window.electronAPI.openFolder(targetPath);
    }
  };
  
  /**
   * Reset to initial state
   */
  const handleReset = () => {
    setAppState(STATES.IDLE);
    setFolderPath(null);
    setScanResults(null);
    setPreviewResults(null);
    setExecutionResults(null);
    setProgress({ current: 0, total: 0 });
    setError(null);
    setExpandedBatch(null);
    // Reset user settings to defaults
    setMaxFilesPerBatch('500');
    setOutputPrefix('Batch');
    setBatchMode('move');
    setOutputDir(null);
    // Clear selected preset
    setSelectedPresetName('');
  };

  // ============================================================================
  // RESUME HANDLERS
  // ============================================================================
  
  /**
   * Resume an interrupted batch operation
   */
  const handleResume = async () => {
    setShowResumeModal(false);
    setAppState(STATES.EXECUTING);
    setProgress({ current: 0, total: interruptedProgress?.totalFiles || 0 });
    
    try {
      const results = await window.electronAPI.resumeBatch();
      
      if (results.cancelled) {
        setExecutionResults({
          ...results,
          wasCancelled: true
        });
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
  };
  
  /**
   * Discard interrupted progress and start fresh
   */
  const handleDiscardProgress = async () => {
    setShowResumeModal(false);
    setInterruptedProgress(null);
    if (window.electronAPI?.clearInterruptedProgress) {
      await window.electronAPI.clearInterruptedProgress();
    }
  };

  // ============================================================================
  // UNDO/ROLLBACK HANDLERS
  // ============================================================================
  
  /**
   * Check if rollback is available after batch completes
   * Called after execution results are set
   */
  const checkRollbackAvailability = async () => {
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
  };
  
  // Check rollback availability when entering COMPLETE state
  useEffect(() => {
    if (appState === STATES.COMPLETE) {
      checkRollbackAvailability();
    }
  }, [appState]);
  
  /**
   * Show undo confirmation modal
   */
  const handleUndoClick = () => {
    setShowUndoConfirmation(true);
  };
  
  /**
   * Execute the undo operation
   */
  const handleExecuteUndo = async () => {
    setShowUndoConfirmation(false);
    setIsRollingBack(true);
    setAppState(STATES.EXECUTING);
    setProgress({ current: 0, total: rollbackInfo?.totalFiles || 0 });
    
    // Set up rollback progress listener
    let cleanupProgress = null;
    if (window.electronAPI?.onRollbackProgress) {
      cleanupProgress = window.electronAPI.onRollbackProgress((progressData) => {
        setProgress({
          current: progressData.restoredFiles || progressData.current || 0,
          total: progressData.total || rollbackInfo?.totalFiles || 0
        });
      });
    }
    
    try {
      const results = await window.electronAPI.rollbackBatch();
      
      if (results.success) {
        // Show success - reset to idle with a success message
        setRollbackAvailable(false);
        setRollbackInfo(null);
        setExecutionResults(null);
        setAppState(STATES.IDLE);
        // Could show a toast/notification here in the future
      } else if (results.cancelled) {
        // User cancelled during rollback - stay on complete screen
        setAppState(STATES.COMPLETE);
      } else {
        throw new Error(results.error || 'Rollback failed');
      }
    } catch (err) {
      setError(err.message);
      setAppState(STATES.ERROR);
    } finally {
      // Clean up progress listener
      if (cleanupProgress) {
        cleanupProgress();
      }
      setIsRollingBack(false);
    }
  };
  
  /**
   * Reset with rollback manifest clear
   * Used when user starts a new batch (clear undo option)
   */
  const handleResetWithRollbackClear = async () => {
    // Clear rollback manifest when starting new operation
    if (rollbackAvailable && window.electronAPI?.clearRollbackManifest) {
      await window.electronAPI.clearRollbackManifest();
    }
    setRollbackAvailable(false);
    setRollbackInfo(null);
    handleReset();
  };

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================
  
  /**
   * Handle settings change from PreviewPanel
   */
  const handleSettingsChange = (key, value) => {
    // Handle bulk updates (object passed as first argument)
    if (typeof key === 'object' && key !== null) {
      const settings = key;
      if (settings.maxFilesPerBatch !== undefined) setMaxFilesPerBatch(settings.maxFilesPerBatch);
      if (settings.outputPrefix !== undefined) setOutputPrefix(settings.outputPrefix);
      if (settings.sortBy !== undefined) setSortBy(settings.sortBy);
      
      // Handle mode and output dir specifically
      if (settings.batchMode !== undefined) {
        setBatchMode(settings.batchMode);
        // If switching to move mode, clear output dir unless explicitly set to something else (which shouldn't happen in move mode)
        if (settings.batchMode === 'move') {
           setOutputDir(null);
        }
      }
      
      // Explicit output dir sets (overrides the mode check above if provided)
      if (settings.outputDir !== undefined) {
         setOutputDir(settings.outputDir);
      }
      return;
    }

    switch (key) {
      case 'maxFilesPerBatch':
        setMaxFilesPerBatch(value);
        setRefreshingField('maxFilesPerBatch');
        break;
      case 'outputPrefix':
        setOutputPrefix(value);
        break;
      case 'batchMode':
        setBatchMode(value);
        if (value === 'move') setOutputDir(null);
        break;
      case 'sortBy':
        setSortBy(value);
        setRefreshingField('sortBy');
        break;
      case 'outputDir':
        setOutputDir(value);
        break;
      default:
        break;
    }
  };
  
  /**
   * Handle output folder selection
   */
  const handleSelectOutputFolder = async () => {
    const selected = await window.electronAPI.selectOutputFolder();
    if (selected) setOutputDir(selected);
  };

  // ============================================================================
  // MAIN RENDER
  // ============================================================================
  
  const isProcessing = appState === STATES.EXECUTING || appState === STATES.SCANNING;
  
  return (
    <div className={`app ${isProcessing ? 'processing' : ''}`}>
      <header className="app-header">
        <h1><Camera className="icon-inline" size={32} strokeWidth={2.5} /> {STRINGS.APP_TITLE}</h1>
        <p>{STRINGS.APP_SUBTITLE}</p>
        <div className="header-actions">
          <button 
            className={`header-btn ${appState === STATES.EXECUTING || appState === STATES.SCANNING ? 'disabled' : ''}`}
            onClick={toggleTheme} 
            title="Toggle theme"
            disabled={appState === STATES.EXECUTING || appState === STATES.SCANNING}
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
              // Preset Props (Lifted State)
              selectedPresetName={selectedPresetName}
              onPresetSelect={setSelectedPresetName}
              onSettingsChange={handleSettingsChange}
              onToggleBatch={(batchNumber) => setExpandedBatch(
                expandedBatch === batchNumber ? null : batchNumber
              )}
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
          {appState === STATES.COMPLETE && (
            <CompleteCard 
              executionResults={executionResults} 
              rollbackAvailable={rollbackAvailable}
              onOpenFolder={handleOpenFolder} 
              onReset={handleResetWithRollbackClear}
              onUndo={handleUndoClick}
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
      
      {/* Click-blocking overlay during scanning only (not executing - to allow cancel) */}
      {appState === STATES.SCANNING && (
        <div className="blocking-overlay" />
      )}
      
      {/* Validation Error Modal */}
      <ValidationModal 
        error={validationError} 
        onClose={() => setValidationError(null)} 
      />
      
      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showConfirmation}
        settings={{
          maxFilesPerBatch,
          outputPrefix,
          batchMode,
          outputDir,
          sortBy,
          batchCount: previewResults?.batchCount || 0,
          presetName: selectedPresetName
        }}
        onConfirm={handleExecuteBatch}
        onCancel={() => setShowConfirmation(false)}
      />

      {/* Cancel Confirmation Modal */}
      <CancelConfirmationModal
        isOpen={showCancelConfirmation}
        onConfirm={confirmCancel}
        onClose={() => setShowCancelConfirmation(false)}
      />
      

      
      {/* Resume Modal - shown on startup if interrupted progress detected */}
      <ResumeModal
        isOpen={showResumeModal}
        progress={interruptedProgress}
        onResume={handleResume}
        onDiscard={handleDiscardProgress}
      />
      
      {/* Undo Confirmation Modal */}
      <UndoConfirmationModal
        isOpen={showUndoConfirmation}
        rollbackInfo={rollbackInfo}
        onConfirm={handleExecuteUndo}
        onClose={() => setShowUndoConfirmation(false)}
      />
    </div>
  );
}

export default App;
