/**
 * ValidationModal Component
 * 
 * Displays validation error messages with a warning icon
 */

import React from 'react';
import { TriangleAlert } from 'lucide-react';
import './Modals.css';

/**
 * @param {Object} props
 * @param {{ title: string, message: string } | null} props.error - Error object or null
 * @param {() => void} props.onClose - Callback when modal is closed
 */
function ValidationModal({ error, onClose }) {
  if (!error) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon">
          <TriangleAlert size={48} className="text-warning" />
        </div>
        <h3>{error.title}</h3>
        <p>{error.message}</p>
        <button className="btn primary" onClick={onClose}>
          OK
        </button>
      </div>
    </div>
  );
}

export default ValidationModal;
