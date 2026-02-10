/**
 * BlurSensitivityModal Component
 * 
 * Modal that appears when the user toggles on "Detect Blurry Photos."
 * The user must select a sensitivity level and click "Start Analysis"
 * before any blur detection runs. Dismissing the modal without starting
 * reverts the toggle to OFF.
 */

import React, { useState, useEffect } from 'react';
import { ScanEye } from 'lucide-react';
import './Modals.css';

const SENSITIVITY_OPTIONS = [
  {
    value: 'strict',
    label: 'Strict',
    description: 'Catches subtle blur',
  },
  {
    value: 'moderate',
    label: 'Moderate',
    description: 'Balanced detection',
  },
  {
    value: 'lenient',
    label: 'Lenient',
    description: 'Obvious blur only',
  },
];

/**
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is visible
 * @param {string} props.currentSensitivity - The currently saved sensitivity value
 * @param {(selectedSensitivity: string) => void} props.onStart - Called when user clicks Start Analysis
 * @param {() => void} props.onCancel - Called when user dismisses without starting
 */
function BlurSensitivityModal({ isOpen, currentSensitivity, onStart, onCancel }) {
  const [selectedSensitivity, setSelectedSensitivity] = useState(currentSensitivity || 'moderate');

  // Sync internal state when the modal opens with a potentially new currentSensitivity
  useEffect(() => {
    if (isOpen) {
      setSelectedSensitivity(currentSensitivity || 'moderate');
    }
  }, [isOpen, currentSensitivity]);

  // ESC key to dismiss
  useEffect(() => {
    if (!isOpen) return;

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
        className="modal-content blur-sensitivity-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Configure Blur Detection"
      >
        <div className="modal-icon">
          <ScanEye size={48} className="text-primary" />
        </div>
        <h3>Configure Blur Detection</h3>
        <p>Choose how aggressively to detect blurry photos.</p>

        <div className="sensitivity-options">
          {SENSITIVITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={`sensitivity-card ${selectedSensitivity === option.value ? 'selected' : ''}`}
              onClick={() => setSelectedSensitivity(option.value)}
              type="button"
            >
              <span className="sensitivity-radio">
                <span className="sensitivity-radio-dot" />
              </span>
              <span className="sensitivity-card-text">
                <span className="sensitivity-card-label">{option.label}</span>
                <span className="sensitivity-card-desc">{option.description}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="modal-buttons">
          <button className="btn secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => onStart(selectedSensitivity)}>
            <ScanEye size={16} /> Start Analysis
          </button>
        </div>
      </div>
    </div>
  );
}

export default BlurSensitivityModal;
