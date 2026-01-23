/**
 * StatsGrid Component
 * 
 * Displays the three stat cards: Total Files, File Groups, Batches to Create
 */

import React from 'react';
import { Loader2 } from 'lucide-react';
import './PreviewPanel.css';

/**
 * @param {Object} props
 * @param {number} props.totalFiles - Total number of files in folder
 * @param {number} props.totalGroups - Number of file groups
 * @param {number} props.batchCount - Number of batches to create
 * @param {boolean} props.isLoading - Whether preview is loading
 */
function StatsGrid({ totalFiles, totalGroups, batchCount, isLoading }) {
  return (
    <div className="stats-grid">
      <div className="stat-card">
        <div className="stat-value">{totalFiles}</div>
        <div className="stat-label">Total Files</div>
      </div>
      <div className="stat-card">
        <div className="stat-value">{totalGroups}</div>
        <div className="stat-label">File Groups</div>
      </div>
      <div className="stat-card highlight">
        <div className="stat-value">
          {isLoading ? (
            <Loader2 size={32} className="spin-icon" />
          ) : (
            batchCount
          )}
        </div>
        <div className="stat-label">Batches to Create</div>
      </div>
    </div>
  );
}

export default StatsGrid;
