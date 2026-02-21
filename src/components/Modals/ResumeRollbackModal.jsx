/**
 * ResumeRollbackModal Component
 * 
 * Displays when an interrupted rollback (undo) operation is detected on startup.
 * Allows user to resume the rollback or discard it.
 */

import React from 'react';
import { RotateCcw, Trash2, FolderOpen, AlertTriangle } from 'lucide-react';
import './Modals.css';

/**
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is visible
 * @param {Object} props.info - Interrupted rollback info
 * @param {number} props.info.restoredFiles - Files already restored
 * @param {number} props.info.totalFiles - Total files to restore
 * @param {string} props.info.sourceFolder - Original source folder
 * @param {() => void} props.onResume - Callback when user chooses to resume
 * @param {() => void} props.onDiscard - Callback when user chooses to discard
 */
function ResumeRollbackModal({ isOpen, info, onResume, onDiscard }) {
  if (!isOpen || !info) return null;

  const folderName = info.sourceFolder?.split(/[/\\]/).pop() || 'Unknown';
  const percentComplete = info.totalFiles > 0
    ? Math.round((info.restoredFiles / info.totalFiles) * 100)
    : 0;
  const remainingFiles = info.totalFiles - info.restoredFiles;

  return (
    <div className="modal-overlay">
      <div className="modal-content resume-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon">
          <AlertTriangle size={48} className="text-warning" />
        </div>
        <h3>Resume Interrupted Undo?</h3>
        <p className="resume-description">
          A previous undo (rollback) operation was interrupted. Some files may be in an 
          inconsistent state. It is recommended to resume to complete the restoration.
        </p>
        
        <div className="resume-details">
          <div className="resume-row">
            <FolderOpen size={16} />
            <span className="resume-label">Restoring to:</span>
            <span className="resume-value" title={info.sourceFolder}>{folderName}</span>
          </div>
          <div className="resume-progress-bar">
            <div className="resume-progress-fill" style={{ width: `${percentComplete}%` }} />
          </div>
          <div className="resume-stats">
            <span>{info.restoredFiles.toLocaleString()} of {info.totalFiles.toLocaleString()} files restored ({percentComplete}%)</span>
            <span className="remaining">{remainingFiles.toLocaleString()} remaining</span>
          </div>
        </div>
        
        <div className="modal-buttons">
          <button className="btn secondary" onClick={onDiscard}>
            <Trash2 size={16} /> Discard
          </button>
          <button className="btn primary" onClick={onResume}>
            <RotateCcw size={16} /> Resume Undo
          </button>
        </div>
      </div>
    </div>
  );
}

export default ResumeRollbackModal;
