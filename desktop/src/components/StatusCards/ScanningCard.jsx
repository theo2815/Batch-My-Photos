/**
 * ScanningCard Component
 * 
 * Displays the scanning state with a loading spinner
 */

import React from 'react';
import { BoxSpinner } from '../common';
import './StatusCards.css';

function ScanningCard() {
  return (
    <div className="status-card scanning">
      <div className="spinner"><BoxSpinner /></div>
      <h2>Scanning Folder...</h2>
      <p>Analyzing files and detecting pairs</p>
    </div>
  );
}

export default ScanningCard;
