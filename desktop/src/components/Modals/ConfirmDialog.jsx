/**
 * ConfirmDialog Component
 *
 * A reusable yes/no question over the app. Escape, Cancel or a click outside
 * the box all answer "no".
 */

import React, { useEffect } from 'react';
import './Modals.css';

/**
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {string} props.title
 * @param {string} props.message
 * @param {string} props.confirmLabel
 * @param {string} props.cancelLabel
 * @param {boolean} [props.danger] - red confirm button for an action that ends something
 * @param {() => void} props.onConfirm
 * @param {() => void} props.onCancel
 */
function ConfirmDialog({ isOpen, title, message, confirmLabel, cancelLabel, danger = false, onConfirm, onCancel }) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-content confirmation-modal confirm-dialog" role="alertdialog" aria-modal="true"
        aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message" onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-dialog-title">{title}</h3>
        <p id="confirm-dialog-message">{message}</p>
        <div className="modal-buttons">
          {/* Focus starts on the safe answer. */}
          <button type="button" className="btn secondary" onClick={onCancel} autoFocus>{cancelLabel}</button>
          <button type="button" className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
