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
import { ValidationModal, ConfirmationModal, CancelConfirmationModal, ResumeModal } from './components/Modals';
import { ScanningCard, ExecutingCard, CompleteCard, ErrorCard } from './components/StatusCards';
import { PreviewPanel } from './components/PreviewPanel';
import { IdleScreen } from './components/DropZone';

function App() {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  
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
  
  // Move vs Copy mode
  const [batchMode, setBatchMode] = useState('move'); // 'move' or 'copy'
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
  
  // Resume modal state (for interrupted batch operations)
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [interruptedProgress, setInterruptedProgress] = useState(null);
  
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
        const preview = await window.electronAPI.previewBatches(path, maxFilesPerBatch);
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
  }, [maxFilesPerBatch]);
  
  /**
   * Handle selecting a recent folder
   * Validates folder exists before scanning; removes from list if not found
   */
  const handleSelectRecentFolder = useCallback(async (path) => {
    // Validate folder exists before scanning
    const registerResult = await window.electronAPI.registerDroppedFolder(path);
    
    if (registerResult.success) {
      await scanFolder(path);
    } else {
      // Folder no longer exists - show error and remove from recent list
      setError(`The folder "${path.split(/[/\\]/).pop()}" no longer exists or is inaccessible.`);
      setAppState(STATES.ERROR);
      
      // Remove invalid folder from recent folders list
      if (window.electronAPI?.getRecentFolders) {
        const currentFolders = await window.electronAPI.getRecentFolders();
        const filteredFolders = currentFolders.filter(f => f !== path);
        // Update local state (store will be updated on next valid add)
        setRecentFolders(filteredFolders);
      }
    }
  }, [scanFolder]);
  
  /**
   * Refresh preview when settings change
   * Enforces a minimum of 10 to prevent extreme calculations
   */
  const refreshPreview = async () => {
    if (!folderPath) return;
    
    // Parse and validate maxFilesPerBatch
    const maxFiles = parseInt(maxFilesPerBatch, 10);
    if (isNaN(maxFiles) || maxFiles < 1) return;
    
    // Enforce minimum of 10 for preview to prevent performance issues
    // User can still set lower values for execution, but preview uses minimum 10
    const previewMaxFiles = Math.max(10, maxFiles);
    
    // Mark this request as not cancelled
    previewCancelledRef.current = false;
    setIsRefreshingPreview(true);
    
    try {
      const preview = await window.electronAPI.previewBatches(folderPath, previewMaxFiles);
      
      // Only update if this request wasn't cancelled
      if (!previewCancelledRef.current && preview.success) {
        setPreviewResults(preview);
      }
    } catch (err) {
      console.error('Failed to refresh preview:', err);
    } finally {
      if (!previewCancelledRef.current) {
        setIsRefreshingPreview(false);
      }
    }
  };
  
  // Debounced refresh preview when maxFilesPerBatch changes
  // Wait 400ms after the user stops typing before refreshing
  useEffect(() => {
    if (appState !== STATES.READY) return;
    
    // Cancel any pending preview when dependencies change
    previewCancelledRef.current = true;
    
    // Set up debounce timer
    const debounceTimer = setTimeout(() => {
      refreshPreview();
    }, 400);
    
    // Cleanup: cancel timer if value changes again before 400ms
    return () => {
      clearTimeout(debounceTimer);
      previewCancelledRef.current = true;
    };
  }, [maxFilesPerBatch, folderPath, appState]);

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
  
  /**
   * Handle dropped folder
   * Registers the dropped path as allowed before scanning
   */
  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      const item = items[0];
      
      // Get the file/folder entry
      const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
      
      if (entry && entry.isDirectory) {
        const file = e.dataTransfer.files[0];
        if (file && file.path) {
          // Register the dropped folder path as allowed before scanning
          const registerResult = await window.electronAPI.registerDroppedFolder(file.path);
          if (registerResult.success) {
            await scanFolder(file.path);
          } else {
            setError(registerResult.error || 'Failed to access the dropped folder');
            setAppState(STATES.ERROR);
          }
        }
      } else {
        // User dropped a file, not a folder - show helpful error
        setError('Please drop a folder, not a file. Select a folder containing your images.');
        setAppState(STATES.ERROR);
      }
    }
  }, [scanFolder]);

  // ============================================================================
  // BATCH EXECUTION
  // ============================================================================
  
  /**
   * Validate inputs before executing batch
   * @returns {boolean} True if valid
   */
  const validateInputs = () => {
    // Check Max Files Per Batch
    const maxFiles = parseInt(maxFilesPerBatch, 10);
    if (!maxFilesPerBatch || maxFilesPerBatch.trim() === '' || isNaN(maxFiles)) {
      setValidationError({
        title: 'Max Files Per Batch Required',
        message: 'Please enter the maximum number of files per batch folder.',
        field: 'maxFilesPerBatch'
      });
      return false;
    }
    if (maxFiles < 1 || maxFiles > 10000) {
      setValidationError({
        title: 'Invalid Max Files',
        message: 'Max files per batch must be between 1 and 10,000.',
        field: 'maxFilesPerBatch'
      });
      return false;
    }
    
    // Check Folder Name
    if (!outputPrefix || outputPrefix.trim() === '') {
      setValidationError({
        title: 'Folder Name Required',
        message: 'Please enter a folder name for the batch folders.',
        field: 'outputPrefix'
      });
      return false;
    }
    
    return true;
  };

  /**
   * Show confirmation modal before executing
   */
  const handleProceedClick = () => {
    // Validate inputs first
    if (!validateInputs()) {
      return;
    }
    // Show confirmation modal
    setShowConfirmation(true);
  };

  /**
   * Execute the batch splitting operation (called after confirmation)
   */
  const handleExecuteBatch = async () => {
    setShowConfirmation(false);
    
    const maxFiles = parseInt(maxFilesPerBatch, 10);
    
    setAppState(STATES.EXECUTING);
    setProgress({ current: 0, total: previewResults?.batchCount || 0 });
    
    try {
      const results = await window.electronAPI.executeBatch(
        folderPath,
        maxFiles,
        outputPrefix.trim(),
        batchMode,
        batchMode === 'copy' ? outputDir : null
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
  // RENDER HELPERS
  // ============================================================================
  
  /**
   * Handle settings change from PreviewPanel
   */
  const handleSettingsChange = (key, value) => {
    switch (key) {
      case 'maxFilesPerBatch':
        setMaxFilesPerBatch(value);
        break;
      case 'outputPrefix':
        setOutputPrefix(value);
        break;
      case 'batchMode':
        setBatchMode(value);
        if (value === 'move') setOutputDir(null);
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
        <button 
          className={`theme-toggle ${appState === STATES.EXECUTING || appState === STATES.SCANNING ? 'disabled' : ''}`}
          onClick={toggleTheme} 
          title="Toggle theme"
          disabled={appState === STATES.EXECUTING || appState === STATES.SCANNING}
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
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
            settings={{ maxFilesPerBatch, outputPrefix, batchMode, outputDir }}
            validationError={validationError}
            expandedBatch={expandedBatch}
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
            onCancel={handleCancelBatch}
          />
        )}
        {appState === STATES.COMPLETE && (
          <CompleteCard 
            executionResults={executionResults} 
            onOpenFolder={handleOpenFolder} 
            onReset={handleReset} 
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
          batchCount: previewResults?.batchCount || 0
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
    </div>
  );
}

export default App;
