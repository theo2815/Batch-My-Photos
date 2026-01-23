/**
 * ConfirmationModal Component
 * 
 * Displays a confirmation dialog before batch execution
 */

import React from 'react';
import { Package, Zap, Copy } from 'lucide-react';
import checkedIcon from '../../images/checked.png';
import './Modals.css';

/**
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is visible
 * @param {Object} props.settings - Current batch settings
 * @param {string} props.settings.maxFilesPerBatch
 * @param {string} props.settings.outputPrefix
 * @param {'move' | 'copy'} props.settings.batchMode
 * @param {string | null} props.settings.outputDir
 * @param {number} props.settings.batchCount
 * @param {() => void} props.onConfirm - Callback when user confirms
 * @param {() => void} props.onCancel - Callback when user cancels
 */
function ConfirmationModal({ isOpen, settings, onConfirm, onCancel }) {
  if (!isOpen) return null;

  const { maxFilesPerBatch, outputPrefix, batchMode, outputDir, batchCount } = settings;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content confirmation-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon">
          <Package size={48} className="text-primary" />
        </div>
        <h3>Confirm Batch Settings</h3>
        <div className="confirmation-details">
          <div className="confirmation-row">
            <span className="confirmation-label">Max Files Per Batch:</span>
            <span className="confirmation-value">{maxFilesPerBatch}</span>
          </div>
          <div className="confirmation-row">
            <span className="confirmation-label">Folder Name:</span>
            <span className="confirmation-value">{outputPrefix}</span>
          </div>
          <div className="confirmation-row">
            <span className="confirmation-label">Mode:</span>
            <span className="confirmation-value">
              {batchMode === 'move' ? (
                <><Zap size={14} className="icon-inline" /> Move (Fast)</>
              ) : (
                <><Copy size={14} className="icon-inline" /> Copy (Safe)</>
              )}
            </span>
          </div>
          {batchMode === 'copy' && (
            <div className="confirmation-row">
              <span className="confirmation-label">Output Location:</span>
              <span className="confirmation-value">
                {outputDir ? outputDir.split(/[/\\]/).pop() : 'Same as source'}
              </span>
            </div>
          )}
          <div className="confirmation-row">
            <span className="confirmation-label">Batches to Create:</span>
            <span className="confirmation-value">{batchCount}</span>
          </div>
        </div>
        <div className="modal-buttons">
          <button className="btn secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" onClick={onConfirm}>
            <span 
              className="mask-icon icon-inline" 
              style={{ 
                width: '16px', 
                height: '16px', 
                WebkitMaskImage: `url(${checkedIcon})`,
                maskImage: `url(${checkedIcon})`
              }} 
            /> Start Batching
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmationModal;
