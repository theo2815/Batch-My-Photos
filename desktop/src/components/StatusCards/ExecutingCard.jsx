/**
 * ExecutingCard Component
 * 
 * Displays the batch execution progress with a progress bar and cancel button
 */

import React from 'react';
import { XCircle } from 'lucide-react';
import { BoxSpinner } from '../common';
import './StatusCards.css';

/**
 * @param {Object} props
 * @param {Object} props.progress - Progress object
 * @param {number} props.progress.current - Current batch number
 * @param {number} props.progress.total - Total batch count
 * @param {number} [props.progress.processedFiles] - Number of files processed
 * @param {number} [props.progress.totalFiles] - Total number of files
 * @param {boolean} [props.isRollback] - Whether this is a rollback/undo operation
 * @param {() => void} [props.onCancel] - Callback when cancel button is clicked
 */
function ExecutingCard({ progress, isRollback = false, onCancel }) {
  const percentage = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
  
  const handleCancel = async () => {
    if (onCancel) {
      onCancel();
    }
  };
  
  // Dynamic text based on operation type
  const title = isRollback ? 'Undoing Batches...' : 'Creating Batches...';
  const progressText = isRollback 
    ? `${progress.current} of ${progress.total} files restored`
    : `${progress.current} of ${progress.total} folders created`;
  
  return (
    <div className="status-card executing">
      <div className="spinner"><BoxSpinner /></div>
      <h2>{title}</h2>
      <div className="progress-bar">
        <div 
          className="progress-fill" 
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
      <p>{progressText}</p>
      {progress.processedFiles !== undefined && !isRollback && (
        <p className="sub-progress">
          Processing file {progress.processedFiles.toLocaleString()} of {progress.totalFiles.toLocaleString()}
        </p>
      )}
      {onCancel && (
        <button className="btn cancel-btn" onClick={handleCancel}>
          <XCircle size={16} /> Cancel
        </button>
      )}
    </div>
  );
}

export default ExecutingCard;
