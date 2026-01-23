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
 * @param {() => void} [props.onCancel] - Callback when cancel button is clicked
 */
function ExecutingCard({ progress, onCancel }) {
  const percentage = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
  
  const handleCancel = async () => {
    if (onCancel) {
      onCancel();
    }
  };
  
  return (
    <div className="status-card executing">
      <div className="spinner"><BoxSpinner /></div>
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
      {onCancel && (
        <button className="btn cancel-btn" onClick={handleCancel}>
          <XCircle size={16} /> Cancel
        </button>
      )}
    </div>
  );
}

export default ExecutingCard;
