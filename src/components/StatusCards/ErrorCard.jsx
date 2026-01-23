/**
 * ErrorCard Component
 * 
 * Displays error messages with retry option
 */

import React from 'react';
import { XCircle } from 'lucide-react';
import './StatusCards.css';

/**
 * @param {Object} props
 * @param {string} props.error - Error message to display
 * @param {() => void} props.onReset - Callback to reset and try again
 */
function ErrorCard({ error, onReset }) {
  return (
    <div className="status-card error">
      <div className="error-icon">
        <XCircle size={64} color="var(--error)" />
      </div>
      <h2>An Error Occurred</h2>
      <p className="error-message">{error}</p>
      <button className="btn secondary" onClick={onReset}>
        ← Try Again
      </button>
    </div>
  );
}

export default ErrorCard;
