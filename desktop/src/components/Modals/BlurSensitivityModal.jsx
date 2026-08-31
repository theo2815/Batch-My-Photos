/**
 * BlurSensitivityModal Component
 *
 * Modal that appears when the user toggles on "Detect Blurry Photos."
 * The user picks which blur categories the CNN classifier should flag,
 * then clicks "Start Analysis" to run inference against the AI service.
 * Dismissing the modal without starting reverts the toggle to OFF.
 *
 * Categories map 1:1 to the trained YOLOv8n-cls class names
 * (`ai-service/models/class_names.json`): motion_blurred, defocused_blurred,
 * defocused_object_portrait. `sharp` is never user-selectable.
 */

import React, { useState, useEffect } from 'react';
import { ScanEye } from 'lucide-react';
import './Modals.css';

const CATEGORY_OPTIONS = [
  {
    value: 'motion_blurred',
    label: 'Motion Blur',
    description: 'Camera shake or fast subjects',
  },
  {
    value: 'defocused_blurred',
    label: 'Defocused (general)',
    description: 'Out of focus throughout the frame',
  },
  {
    value: 'defocused_object_portrait',
    label: 'Defocused subject',
    description: 'Subject soft, background sharp',
  },
];

const DEFAULT_SELECTION = CATEGORY_OPTIONS.map(o => o.value);

const SENSITIVITY_OPTIONS = [
  { value: 'strict', label: 'Strict', hint: 'Catches borderline blur' },
  { value: 'moderate', label: 'Moderate', hint: 'Balanced (recommended)' },
  { value: 'lenient', label: 'Lenient', hint: 'Only obvious blur' },
];

/**
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is visible
 * @param {string[]} props.currentCategories - The currently saved category set
 * @param {string} props.currentSensitivity - Current sensitivity preset
 * @param {(payload: { categories: string[], sensitivity: string }) => void} props.onStart
 * @param {() => void} props.onCancel - Called when user dismisses without starting
 */
function BlurSensitivityModal({ isOpen, currentCategories, currentSensitivity, onStart, onCancel }) {
  const initial = Array.isArray(currentCategories) && currentCategories.length > 0
    ? currentCategories
    : DEFAULT_SELECTION;
  const [selected, setSelected] = useState(new Set(initial));
  const [sensitivity, setSensitivity] = useState(currentSensitivity || 'moderate');

  // Sync internal state when the modal opens
  useEffect(() => {
    if (isOpen) {
      const next = Array.isArray(currentCategories) && currentCategories.length > 0
        ? currentCategories
        : DEFAULT_SELECTION;
      setSelected(new Set(next));
      setSensitivity(currentSensitivity || 'moderate');
    }
  }, [isOpen, currentCategories, currentSensitivity]);

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

  const toggle = (value) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const canStart = selected.size > 0;

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
        <p>Choose which blur types to flag. Sharp photos are always kept.</p>

        <div className="sensitivity-options">
          {CATEGORY_OPTIONS.map((option) => {
            const isSelected = selected.has(option.value);
            return (
              <button
                key={option.value}
                className={`sensitivity-card ${isSelected ? 'selected' : ''}`}
                onClick={() => toggle(option.value)}
                type="button"
                role="checkbox"
                aria-checked={isSelected}
              >
                <span
                  className="sensitivity-radio"
                  style={{ borderRadius: '4px' }}
                >
                  {isSelected && (
                    <span
                      className="sensitivity-radio-dot"
                      style={{ borderRadius: '2px' }}
                    />
                  )}
                </span>
                <span className="sensitivity-card-text">
                  <span className="sensitivity-card-label">{option.label}</span>
                  <span className="sensitivity-card-desc">{option.description}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div
          className="blur-sensitivity-section"
          style={{
            margin: '18px 0 10px',
            paddingTop: '14px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              letterSpacing: '0.4px',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.55)',
              marginBottom: '8px',
            }}
          >
            Sensitivity
          </div>
          <div
            role="radiogroup"
            aria-label="Detection sensitivity"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '6px',
            }}
          >
            {SENSITIVITY_OPTIONS.map((opt) => {
              const isActive = sensitivity === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => setSensitivity(opt.value)}
                  title={opt.hint}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: isActive
                      ? '1px solid rgb(99 102 241)'
                      : '1px solid rgba(255,255,255,0.08)',
                    backgroundColor: isActive
                      ? 'rgb(99 102 241 / 0.15)'
                      : 'rgba(255,255,255,0.03)',
                    color: isActive ? 'rgb(199 210 254)' : 'rgba(255,255,255,0.75)',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <div
            style={{
              fontSize: '11px',
              color: 'rgba(255,255,255,0.45)',
              marginTop: '6px',
              minHeight: '14px',
            }}
          >
            {SENSITIVITY_OPTIONS.find(o => o.value === sensitivity)?.hint}
          </div>
        </div>

        <div className="modal-buttons">
          <button className="btn secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={() => onStart({ categories: Array.from(selected), sensitivity })}
            disabled={!canStart}
          >
            <ScanEye size={16} /> Start Analysis
          </button>
        </div>
      </div>
    </div>
  );
}

export default BlurSensitivityModal;
