/**
 * DeletePresetModal Component
 * 
 * Displays a themed confirmation dialog when deleting a preset
 */

import React from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import './Modals.css';

/**
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is visible
 * @param {string} props.presetName - Name of the preset to delete
 * @param {() => void} props.onConfirm - Callback when user confirms deletion
 * @param {() => void} props.onCancel - Callback when user cancels
 */
function DeletePresetModal({ isOpen, presetName, onConfirm, onCancel }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon warning">
          <AlertTriangle size={48} className="text-warning" />
        </div>
        <h3>Delete Preset?</h3>
        <p>
          Are you sure you want to delete "<strong>{presetName}</strong>"?
          <br />
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            This action cannot be undone.
          </span>
        </p>
        <div className="modal-buttons">
          <button className="btn secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn danger" onClick={onConfirm}>
            <Trash2 size={16} className="icon-inline" /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeletePresetModal;
