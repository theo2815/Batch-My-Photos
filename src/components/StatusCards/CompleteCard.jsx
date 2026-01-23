/**
 * CompleteCard Component
 * 
 * Displays the success screen after batch completion (or cancellation)
 */

import React from 'react';
import { CheckCircle, AlertCircle, FolderOpen, RotateCcw } from 'lucide-react';
import './StatusCards.css';

/**
 * @param {Object} props
 * @param {Object} props.executionResults - Results from batch execution
 * @param {number} props.executionResults.batchesCreated - Number of batches created
 * @param {Array} props.executionResults.results - Array of result objects
 * @param {boolean} [props.executionResults.wasCancelled] - Whether operation was cancelled
 * @param {number} [props.executionResults.filesProcessed] - Files processed before cancel
 * @param {number} [props.executionResults.totalFiles] - Total files that were to be processed
 * @param {() => void} props.onOpenFolder - Callback to open output folder
 * @param {() => void} props.onReset - Callback to reset and start over
 */
function CompleteCard({ executionResults, onOpenFolder, onReset }) {
  const wasCancelled = executionResults?.wasCancelled || executionResults?.cancelled;
  
  return (
    <div className={`status-card complete ${wasCancelled ? 'cancelled' : ''}`}>
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
      {wasCancelled && (
        <p className="cancel-note">
          Files already moved/copied will remain in their new location.
        </p>
      )}
      <div className="action-buttons">
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
