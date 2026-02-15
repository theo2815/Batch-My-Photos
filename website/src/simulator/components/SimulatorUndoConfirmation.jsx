/**
 * SimulatorUndoConfirmation Component
 * 
 * Ported from desktop UndoConfirmationModal for web demo.
 * Displays a confirmation dialog when user attempts to undo a batch operation.
 */

import React from 'react';
import { Undo2, AlertTriangle } from 'lucide-react';
import '../styles/SimulatorModals.css';

const STRINGS = {
  HISTORY_UNDO_CONFIRM_TITLE: 'Undo Batch Operation?',
  HISTORY_UNDO_CONFIRM_DESC: 'This will move all files back to their original location.',
  HISTORY_UNDO_CONFIRM_NOTE: 'This action cannot be undone. The batch folders will be removed if they are empty after restoration.',
  HISTORY_UNDO_CONFIRM_BTN: 'Yes, Undo',
};

/**
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is visible
 * @param {Object} props.rollbackInfo - Info about what will be undone
 * @param {() => void} props.onConfirm - Callback when user confirms undo
 * @param {() => void} props.onClose - Callback when user cancels
 */
function SimulatorUndoConfirmation({ isOpen, rollbackInfo, onConfirm, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content confirmation-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon warning">
          <AlertTriangle size={48} className="text-warning" />
        </div>
        <h3>{STRINGS.HISTORY_UNDO_CONFIRM_TITLE}</h3>
        <div className="confirmation-details">
          <p className="warning-text">
            {STRINGS.HISTORY_UNDO_CONFIRM_DESC}
          </p>
          {rollbackInfo && (
            <ul className="params-list">
              <li>
                <strong>{rollbackInfo.totalFiles?.toLocaleString()}</strong> files will be restored
              </li>
              <li>
                <strong>{rollbackInfo.batchFolderCount}</strong> batch folders will be deleted (if empty)
              </li>
            </ul>
          )}
          <p className="note-text">
            {STRINGS.HISTORY_UNDO_CONFIRM_NOTE}
          </p>
        </div>
        <div className="modal-buttons">
          <button className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={onConfirm}>
            <Undo2 size={16} className="icon-inline" /> {STRINGS.HISTORY_UNDO_CONFIRM_BTN}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SimulatorUndoConfirmation;
