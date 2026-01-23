/**
 * CancelConfirmationModal Component
 * 
 * Displays a warning confirmation when user attempts to cancel a running batch
 */

import React from 'react';
import { AlertTriangle, XCircle } from 'lucide-react';
import './Modals.css';

/**
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is visible
 * @param {() => void} props.onConfirm - Callback when user confirms cancellation
 * @param {() => void} props.onClose - Callback when user dismisses/continues execution
 */
function CancelConfirmationModal({ isOpen, onConfirm, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content confirmation-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon warning">
          <AlertTriangle size={48} className="text-warning" />
        </div>
        <h3>Stop Batching?</h3>
        <div className="confirmation-details">
          <p className="warning-text">
            Are you sure you want to stop the batch operation?
          </p>
          <ul className="params-list">
            <li>Files already processed will <strong>remain in their new location</strong>.</li>
            <li>The operation will stop immediately after the current file.</li>
            <li>You may need to manually clean up partial batches.</li>
          </ul>
        </div>
        <div className="modal-buttons">
          <button className="btn secondary" onClick={onClose}>
            Continue Batching
          </button>
          <button className="btn danger" onClick={onConfirm}>
            <XCircle size={16} className="icon-inline" /> Stop Operation
          </button>
        </div>
      </div>
    </div>
  );
}

export default CancelConfirmationModal;
