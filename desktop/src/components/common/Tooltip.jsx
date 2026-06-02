/**
 * Tooltip Component
 * 
 * A reusable tooltip component with animated hover effects
 * Designed to match the app's dark theme
 */

import React from 'react';
import './Tooltip.css';

/**
 * @param {Object} props
 * @param {React.ReactNode} props.children - The element that triggers the tooltip
 * @param {string} props.text - The tooltip text to display
 * @param {'top' | 'bottom' | 'left' | 'right'} [props.position='top'] - Tooltip position
 * @param {string} [props.className] - Additional CSS class
 */
function Tooltip({ children, text, position = 'top', className = '' }) {
  return (
    <div className={`tooltip-wrapper ${className}`}>
      {children}
      <span className={`tooltip tooltip-${position}`}>{text}</span>
    </div>
  );
}

export default Tooltip;
