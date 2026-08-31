/**
 * StatsGrid Component
 * 
 * Displays stat cards: Total Files, File Groups, Batches to Create,
 * and optionally Blurry Photos (when blur detection is enabled).
 */

import React from 'react';
import { Loader2, ScanEye } from 'lucide-react';
import './PreviewPanel.css';

/**
 * @param {Object} props
 * @param {number} props.totalFiles - Total number of files in folder
 * @param {number} props.totalGroups - Number of file groups
 * @param {number} props.batchCount - Number of batches to create
 * @param {boolean} props.isLoading - Whether preview is loading
 * @param {boolean} [props.blurDetectionEnabled] - Whether blur detection is on
 * @param {boolean} [props.isAnalyzingBlur] - Whether blur analysis is in progress
 * @param {number} [props.blurryCount] - Number of blurry groups detected
 */
function StatsGrid({ totalFiles, totalGroups, batchCount, isLoading, blurDetectionEnabled, isAnalyzingBlur, blurryCount }) {
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
      {blurDetectionEnabled && (
        <div className="stat-card blur-stat">
          <div className="stat-value">
            {isAnalyzingBlur ? (
              <Loader2 size={32} className="spin-icon" />
            ) : (
              <>
                <ScanEye size={16} className="blur-stat-icon" />
                {blurryCount}
              </>
            )}
          </div>
          <div className="stat-label">Blurry Photos</div>
        </div>
      )}
    </div>
  );
}

export default StatsGrid;
