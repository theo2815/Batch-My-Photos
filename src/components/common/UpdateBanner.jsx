/**
 * UpdateBanner — Slim, dismissible banner shown above the app header
 * when a newer version of BatchMyPhotos is available.
 */

import React from 'react';
import { Download, X } from 'lucide-react';
import './UpdateBanner.css';

export function UpdateBanner({ latestVersion, onUpdateClick, onDismiss }) {
  return (
    <div className="update-banner">
      <div className="update-banner-content">
        <Download size={16} className="update-banner-icon" />
        <span className="update-banner-text">
          Update available — <strong>v{latestVersion}</strong>
        </span>
        <button className="update-banner-download" onClick={onUpdateClick}>
          Update Now
        </button>
      </div>
      <button className="update-banner-dismiss" onClick={onDismiss} title="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}
