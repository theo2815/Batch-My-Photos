/**
 * ResumeModal Component
 * 
 * Displays when an interrupted batch operation is detected on startup.
 * Allows user to resume or discard the previous operation.
 */

import React from 'react';
import { RotateCcw, Trash2, Clock, FolderOpen, Zap, Copy } from 'lucide-react';
import './Modals.css';

/**
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is visible
 * @param {Object} props.progress - Interrupted progress data
 * @param {string} props.progress.folderPath - Source folder path
 * @param {string} props.progress.mode - 'move' or 'copy'
 * @param {number} props.progress.processedFiles - Files already processed
 * @param {number} props.progress.totalFiles - Total files in operation
 * @param {string} props.progress.startedAt - ISO date string when operation started
 * @param {() => void} props.onResume - Callback when user chooses to resume
 * @param {() => void} props.onDiscard - Callback when user chooses to discard
 */
function ResumeModal({ isOpen, progress, onResume, onDiscard }) {
  if (!isOpen || !progress) return null;

  const folderName = progress.folderPath.split(/[/\\]/).pop();
  const startDate = new Date(progress.startedAt);
  const formattedDate = startDate.toLocaleDateString() + ' ' + startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const percentComplete = Math.round((progress.processedFiles / progress.totalFiles) * 100);
  const remainingFiles = progress.totalFiles - progress.processedFiles;

  return (
    <div className="modal-overlay">
      <div className="modal-content resume-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon">
          <RotateCcw size={48} className="text-warning" />
        </div>
        <h3>Resume Previous Operation?</h3>
        <p className="resume-description">
          An interrupted batch operation was detected. Would you like to continue where you left off?
        </p>
        
        <div className="resume-details">
          <div className="resume-row">
            <FolderOpen size={16} />
            <span className="resume-label">Folder:</span>
            <span className="resume-value" title={progress.folderPath}>{folderName}</span>
          </div>
          <div className="resume-row">
            {progress.mode === 'move' ? <Zap size={16} /> : <Copy size={16} />}
            <span className="resume-label">Mode:</span>
            <span className="resume-value">{progress.mode === 'move' ? 'Move' : 'Copy'}</span>
          </div>
          <div className="resume-row">
            <Clock size={16} />
            <span className="resume-label">Started:</span>
            <span className="resume-value">{formattedDate}</span>
          </div>
          <div className="resume-progress-bar">
            <div className="resume-progress-fill" style={{ width: `${percentComplete}%` }} />
          </div>
          <div className="resume-stats">
            <span>{progress.processedFiles.toLocaleString()} of {progress.totalFiles.toLocaleString()} files processed ({percentComplete}%)</span>
            <span className="remaining">{remainingFiles.toLocaleString()} remaining</span>
          </div>
        </div>
        
        <div className="modal-buttons">
          <button className="btn secondary" onClick={onDiscard}>
            <Trash2 size={16} /> Discard
          </button>
          <button className="btn primary" onClick={onResume}>
            <RotateCcw size={16} /> Resume
          </button>
        </div>
      </div>
    </div>
  );
}

export default ResumeModal;
