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

// Application states
const STATES = {
  IDLE: 'idle',           // Waiting for folder selection
  SCANNING: 'scanning',   // Scanning folder contents
  READY: 'ready',         // Ready to execute (showing preview)
  EXECUTING: 'executing', // Moving files
  COMPLETE: 'complete',   // Operation finished
  ERROR: 'error',         // Error occurred
};

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
  
  // User settings
  const [maxFilesPerBatch, setMaxFilesPerBatch] = useState(500);
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

  // ============================================================================
  // EFFECTS
  // ============================================================================
  
  // Load theme and recent folders on mount
  useEffect(() => {
    const loadSettings = async () => {
      if (window.electronAPI?.getTheme) {
        const savedTheme = await window.electronAPI.getTheme();
        setTheme(savedTheme);
      }
      if (window.electronAPI?.getRecentFolders) {
        const folders = await window.electronAPI.getRecentFolders();
        setRecentFolders(folders);
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
  const scanFolder = async (path) => {
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
  };
  
  /**
   * Refresh preview when settings change
   */
  const refreshPreview = async () => {
    if (!folderPath) return;
    
    try {
      const preview = await window.electronAPI.previewBatches(folderPath, maxFilesPerBatch);
      if (preview.success) {
        setPreviewResults(preview);
      }
    } catch (err) {
      console.error('Failed to refresh preview:', err);
    }
  };
  
  // Refresh preview when maxFilesPerBatch changes
  useEffect(() => {
    if (appState === STATES.READY) {
      refreshPreview();
    }
  }, [maxFilesPerBatch]);

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
          await scanFolder(file.path);
        }
      } else if (e.dataTransfer.files[0]?.path) {
        const filePath = e.dataTransfer.files[0].path;
        await scanFolder(filePath);
      }
    }
  }, []);

  // ============================================================================
  // BATCH EXECUTION
  // ============================================================================
  
  /**
   * Execute the batch splitting operation
   */
  const handleExecuteBatch = async () => {
    setAppState(STATES.EXECUTING);
    setProgress({ current: 0, total: previewResults?.batchCount || 0 });
    
    try {
      const results = await window.electronAPI.executeBatch(
        folderPath,
        maxFilesPerBatch,
        outputPrefix,
        batchMode,
        batchMode === 'copy' ? outputDir : null
      );
      
      if (results.success) {
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
  };

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================
  
  /**
   * Render recent folders section
   */
  const renderRecentFolders = () => {
    if (recentFolders.length === 0) return null;
    
    return (
      <div className="recent-folders">
        <h3>📂 Recent Folders</h3>
        <div className="recent-list">
          {recentFolders.map((folder, i) => (
            <button
              key={i}
              className="recent-item"
              onClick={() => scanFolder(folder)}
              title={folder}
            >
              <span className="folder-icon">📁</span>
              <span className="folder-name">{folder.split(/[/\\]/).pop()}</span>
            </button>
          ))}
        </div>
      </div>
    );
  };
  
  /**
   * Render the drop zone (shown in IDLE state)
   */
  const renderDropZone = () => (
    <div className="idle-container">
      <div
        className={`drop-zone ${isDragOver ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleSelectFolder}
      >
        <div className="drop-zone-content">
          <div className="drop-icon">📁</div>
          <h2>Drop a Folder Here</h2>
          <p>or click to browse</p>
        </div>
      </div>
      {renderRecentFolders()}
    </div>
  );
  
  /**
   * Render scanning state
   */
  const renderScanning = () => (
    <div className="status-card scanning">
      <div className="spinner"></div>
      <h2>Scanning Folder...</h2>
      <p>Analyzing files and detecting pairs</p>
    </div>
  );
  
  /**
   * Render batch preview accordion
   */
  const renderBatchPreview = () => {
    if (!previewResults?.batchDetails) return null;
    
    return (
      <div className="batch-preview">
        <h3>📦 Batch Preview</h3>
        <div className="batch-list">
          {previewResults.batchDetails.slice(0, 10).map((batch) => (
            <div key={batch.batchNumber} className="batch-item">
              <button
                className={`batch-header ${expandedBatch === batch.batchNumber ? 'expanded' : ''}`}
                onClick={() => setExpandedBatch(
                  expandedBatch === batch.batchNumber ? null : batch.batchNumber
                )}
              >
                <span className="batch-name">
                  {outputPrefix}_{String(batch.batchNumber).padStart(3, '0')}
                </span>
                <span className="batch-count">{batch.fileCount} files</span>
                <span className="expand-icon">{expandedBatch === batch.batchNumber ? '▼' : '▶'}</span>
              </button>
              {expandedBatch === batch.batchNumber && (
                <div className="batch-files">
                  {batch.sampleFiles.map((file, i) => (
                    <div key={i} className="file-item">{file}</div>
                  ))}
                  {batch.hasMore && (
                    <div className="file-item more">... and {batch.fileCount - 5} more</div>
                  )}
                </div>
              )}
            </div>
          ))}
          {previewResults.batchDetails.length > 10 && (
            <p className="more-batches">
              ... and {previewResults.batchDetails.length - 10} more batches
            </p>
          )}
        </div>
      </div>
    );
  };
  
  /**
   * Render the preview/confirmation screen (READY state)
   */
  const renderPreview = () => (
    <div className="preview-container">
      <div className="folder-info">
        <h2>📂 {folderPath?.split(/[/\\]/).pop()}</h2>
        <p className="folder-path">{folderPath}</p>
      </div>
      
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{scanResults?.totalFiles || 0}</div>
          <div className="stat-label">Total Files</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{scanResults?.totalGroups || 0}</div>
          <div className="stat-label">File Groups</div>
        </div>
        <div className="stat-card highlight">
          <div className="stat-value">{previewResults?.batchCount || 0}</div>
          <div className="stat-label">Batches to Create</div>
        </div>
      </div>
      
      {/* Settings */}
      <div className="settings-panel">
        <h3>⚙️ Settings</h3>
        <div className="setting-row">
          <label>Max Files Per Batch:</label>
          <input
            type="number"
            min="1"
            max="10000"
            value={maxFilesPerBatch}
            onChange={(e) => setMaxFilesPerBatch(Math.max(1, parseInt(e.target.value) || 500))}
          />
        </div>
        <div className="setting-row">
          <label>Folder Prefix:</label>
          <input
            type="text"
            value={outputPrefix}
            onChange={(e) => setOutputPrefix(e.target.value || 'Batch')}
            placeholder="Batch"
          />
        </div>
        
        {/* Move vs Copy Mode */}
        <div className="setting-row mode-toggle">
          <label>Batch Mode:</label>
          <div className="mode-buttons">
            <button
              className={`mode-btn ${batchMode === 'move' ? 'active' : ''}`}
              onClick={() => { setBatchMode('move'); setOutputDir(null); }}
            >
              ⚡ Move (Fast)
            </button>
            <button
              className={`mode-btn ${batchMode === 'copy' ? 'active' : ''}`}
              onClick={() => setBatchMode('copy')}
            >
              📋 Copy (Safe)
            </button>
          </div>
        </div>
        
        {/* Output directory for copy mode */}
        {batchMode === 'copy' && (
          <div className="setting-row output-dir">
            <label>Output Location:</label>
            <div className="output-selector">
              <span className="output-path">
                {outputDir ? outputDir.split(/[/\\]/).pop() : 'Same as source'}
              </span>
              <button
                className="btn-small"
                onClick={async () => {
                  const selected = await window.electronAPI.selectOutputFolder();
                  if (selected) setOutputDir(selected);
                }}
              >
                Browse...
              </button>
            </div>
          </div>
        )}
        
        {batchMode === 'move' && (
          <p className="mode-note">⚡ Files will be moved instantly. Originals will be inside batch folders.</p>
        )}
        {batchMode === 'copy' && (
          <p className="mode-note">📋 Files will be copied. Originals will remain untouched.</p>
        )}
      </div>
      
      {/* Batch Preview */}
      {renderBatchPreview()}
      
      {/* Warning for oversized groups */}
      {previewResults?.oversizedGroups?.length > 0 && (
        <div className="warning-box">
          <h4>⚠️ Warning: Oversized File Groups</h4>
          <p>
            Some file groups exceed your limit of {maxFilesPerBatch} files. 
            These groups will NOT be split to keep file pairs together:
          </p>
          <ul>
            {previewResults.oversizedGroups.map((g, i) => (
              <li key={i}>{g.name} ({g.count} files)</li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Confirmation */}
      <div className="confirmation-box">
        <p>
          This will create <strong>{previewResults?.batchCount || 0}</strong> folders 
          named <strong>{outputPrefix}_001</strong> through <strong>{outputPrefix}_{String(previewResults?.batchCount || 0).padStart(3, '0')}</strong>.
        </p>
        <p className="note">
          💡 Files are moved (not copied) for instant speed. The original files will be inside the new batch folders.
        </p>
      </div>
      
      <div className="action-buttons">
        <button className="btn secondary" onClick={handleReset}>
          ← Select Different Folder
        </button>
        <button className="btn primary" onClick={handleExecuteBatch}>
          ✅ Proceed with Batching
        </button>
      </div>
    </div>
  );
  
  /**
   * Render executing state with progress
   */
  const renderExecuting = () => {
    const percentage = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
    
    return (
      <div className="status-card executing">
        <div className="spinner"></div>
        <h2>Creating Batches...</h2>
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${percentage}%` }}
          ></div>
        </div>
        <p>
          {progress.current} of {progress.total} folders created
        </p>
        {progress.processedFiles !== undefined && (
          <p className="sub-progress">
            Processing file {progress.processedFiles.toLocaleString()} of {progress.totalFiles.toLocaleString()}
          </p>
        )}
      </div>
    );
  };
  
  /**
   * Render completion screen
   */
  const renderComplete = () => (
    <div className="status-card complete">
      <div className="success-icon">✅</div>
      <h2>Batching Complete!</h2>
      <p>
        Successfully created <strong>{executionResults?.batchesCreated}</strong> batch folders.
      </p>
      <div className="results-summary">
        {executionResults?.results?.slice(0, 5).map((r, i) => (
          <div key={i} className="result-row">
            <span className="folder-name">{r.folder}</span>
            <span className="file-count">{r.fileCount} files</span>
          </div>
        ))}
        {executionResults?.results?.length > 5 && (
          <p className="more-results">
            ... and {executionResults.results.length - 5} more folders
          </p>
        )}
      </div>
      <div className="action-buttons">
        <button className="btn secondary" onClick={handleOpenFolder}>
          📂 Open in Explorer
        </button>
        <button className="btn primary" onClick={handleReset}>
          🔄 Process Another Folder
        </button>
      </div>
    </div>
  );
  
  /**
   * Render error state
   */
  const renderError = () => (
    <div className="status-card error">
      <div className="error-icon">❌</div>
      <h2>An Error Occurred</h2>
      <p className="error-message">{error}</p>
      <button className="btn secondary" onClick={handleReset}>
        ← Try Again
      </button>
    </div>
  );

  // ============================================================================
  // MAIN RENDER
  // ============================================================================
  
  const isProcessing = appState === STATES.EXECUTING || appState === STATES.SCANNING;
  
  return (
    <div className={`app ${isProcessing ? 'processing' : ''}`}>
      <header className="app-header">
        <h1>📸 BatchMyPhotos</h1>
        <p>Organize your photos into batch folders</p>
        <button 
          className={`theme-toggle ${appState === STATES.EXECUTING || appState === STATES.SCANNING ? 'disabled' : ''}`}
          onClick={toggleTheme} 
          title="Toggle theme"
          disabled={appState === STATES.EXECUTING || appState === STATES.SCANNING}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </header>
      
      <main className="app-main">
        {appState === STATES.IDLE && renderDropZone()}
        {appState === STATES.SCANNING && renderScanning()}
        {appState === STATES.READY && renderPreview()}
        {appState === STATES.EXECUTING && renderExecuting()}
        {appState === STATES.COMPLETE && renderComplete()}
        {appState === STATES.ERROR && renderError()}
      </main>
      
      <footer className="app-footer">
        <p>Smart file pairing keeps your JPG + RAW files together</p>
      </footer>
      
      {/* Click-blocking overlay during processing */}
      {(appState === STATES.EXECUTING || appState === STATES.SCANNING) && (
        <div className="blocking-overlay" />
      )}
    </div>
  );
}

export default App;
