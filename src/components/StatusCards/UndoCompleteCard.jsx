/**
 * UndoCompleteCard Component
 * 
 * Displays the success screen after an undo (rollback) operation completes.
 * Follows the same UI pattern as CompleteCard but with undo-specific messaging
 * and only two actions: Open in Explorer and Process Another Folder.
 */

import React from 'react';
import { Undo2, FolderOpen, RotateCcw } from 'lucide-react';
import { STRINGS } from '../../constants/strings';
import './StatusCards.css';

/**
 * @param {Object} props
 * @param {Object} props.undoResult - Result from the undo operation
 * @param {number} props.undoResult.restoredFiles - Number of files restored
 * @param {number} props.undoResult.totalFiles - Total files that were to be restored
 * @param {string} props.undoResult.sourceFolder - Folder where files were restored to
 * @param {number} props.undoResult.deletedFolders - Number of empty batch folders deleted
 * @param {() => void} props.onOpenFolder - Callback to open the source folder in Explorer
 * @param {() => void} props.onReset - Callback to reset and process another folder
 */
function UndoCompleteCard({ undoResult, onOpenFolder, onReset }) {
  const folderName = undoResult?.sourceFolder?.split(/[/\\]/).pop() || 'folder';

  return (
    <div className="status-card complete">
      <div className="success-icon">
        <Undo2 size={64} color="var(--success)" />
      </div>
      <h2>{STRINGS.UNDO_COMPLETE_TITLE}</h2>
      <p>
        {STRINGS.UNDO_COMPLETE_DESC}
      </p>
      <div className="results-summary">
        <div className="result-row">
          <span className="confirmation-label">{STRINGS.UNDO_COMPLETE_FILES}</span>
          <span className="confirmation-value">{undoResult?.restoredFiles?.toLocaleString()}</span>
        </div>
        {undoResult?.deletedFolders > 0 && (
          <div className="result-row">
            <span className="confirmation-label">{STRINGS.UNDO_COMPLETE_FOLDERS_REMOVED}</span>
            <span className="confirmation-value">{undoResult.deletedFolders}</span>
          </div>
        )}
        <div className="result-row">
          <span className="confirmation-label">{STRINGS.UNDO_COMPLETE_LOCATION}</span>
          <span className="folder-name">{folderName}</span>
        </div>
      </div>
      <div className="action-buttons">
        <button className="btn secondary" onClick={onOpenFolder}>
          <FolderOpen size={16} /> {STRINGS.UNDO_COMPLETE_OPEN}
        </button>
        <button className="btn primary" onClick={onReset}>
          <RotateCcw size={16} /> {STRINGS.UNDO_COMPLETE_ANOTHER}
        </button>
      </div>
    </div>
  );
}

export default UndoCompleteCard;
