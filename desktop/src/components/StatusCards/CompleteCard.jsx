/**
 * CompleteCard Component
 * 
 * Displays the success screen after batch completion (or cancellation)
 */

import React, { useState } from 'react';
import { CheckCircle, AlertCircle, FolderOpen, RotateCcw, Undo2, History, Download } from 'lucide-react';
import './StatusCards.css';

/**
 * @param {Object} props
 * @param {Object} props.executionResults - Results from batch execution
 * @param {number} props.executionResults.batchesCreated - Number of batches created
 * @param {Array} props.executionResults.results - Array of result objects
 * @param {boolean} [props.executionResults.wasCancelled] - Whether operation was cancelled
 * @param {number} [props.executionResults.filesProcessed] - Files processed before cancel
 * @param {number} [props.executionResults.totalFiles] - Total files that were to be processed
 * @param {string} [props.executionResults.mode] - 'move' or 'copy'
 * @param {boolean} props.rollbackAvailable - Whether undo is available
 * @param {boolean} props.hasHistory - Whether there are past operations in history
 * @param {() => void} props.onOpenFolder - Callback to open output folder
 * @param {() => void} props.onReset - Callback to reset and start over
 * @param {() => void} props.onUndo - Callback to undo the batch operation
 * @param {() => void} props.onShowHistory - Callback to open operation history modal
 * @param {() => void} props.onExportReport - Callback to export batch report as CSV
 */
function CompleteCard({ executionResults, rollbackAvailable, hasHistory, onOpenFolder, onReset, onUndo, onShowHistory, onExportReport }) {
  const wasCancelled = executionResults?.wasCancelled || executionResults?.cancelled;
  const [exportStatus, setExportStatus] = useState(null); // null | 'exporting' | 'done'
  
  const handleExport = async () => {
    setExportStatus('exporting');
    try {
      await onExportReport();
      setExportStatus('done');
      setTimeout(() => setExportStatus(null), 2500);
    } catch {
      setExportStatus(null);
    }
  };
  
  return (
    <div className={`status-card complete ${wasCancelled ? 'cancelled' : ''}`}>
      {/* Compact toolbar — top-right utility actions */}
      <div className="complete-toolbar">
        {rollbackAvailable && (
          <button className="toolbar-btn" onClick={onUndo} title="Undo batch">
            <Undo2 size={14} /> Undo
          </button>
        )}
        {hasHistory && (
          <button className="toolbar-btn" onClick={onShowHistory} title="View history">
            <History size={14} /> History
          </button>
        )}
        {onExportReport && (
          <button
            className="toolbar-btn"
            onClick={handleExport}
            disabled={exportStatus === 'exporting'}
            title="Export batch report as CSV"
          >
            <Download size={14} />
            {exportStatus === 'exporting' ? 'Exporting...' : exportStatus === 'done' ? 'Exported!' : 'Export'}
          </button>
        )}
      </div>

      <div className="success-icon">
        {wasCancelled ? (
          <AlertCircle size={64} color="var(--warning)" />
        ) : (
          <CheckCircle size={64} color="var(--success)" />
        )}
      </div>
      <h2>{wasCancelled ? 'Operation Cancelled' : 'Batching Complete!'}</h2>
      {wasCancelled ? (
        <p>
          Processed <strong>{executionResults?.filesProcessed?.toLocaleString()}</strong> of <strong>{executionResults?.totalFiles?.toLocaleString()}</strong> files before cancellation.
        </p>
      ) : (
        <p>
          Successfully created <strong>{executionResults?.batchesCreated}</strong> batch folders.
        </p>
      )}
      <div className="results-summary">
        {executionResults?.results?.slice(0, 5).map((r) => (
          <div key={r.folder} className="result-row">
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
      {wasCancelled && (
        <p className="cancel-note">
          Files already moved/copied will remain in their new location.
        </p>
      )}
      <div className="complete-actions">
        <button className="btn secondary" onClick={onOpenFolder}>
          <FolderOpen size={16} /> Open in Explorer
        </button>
        <button className="btn primary" onClick={onReset}>
          <RotateCcw size={16} /> Process Another Folder
        </button>
      </div>
    </div>
  );
}

export default CompleteCard;
