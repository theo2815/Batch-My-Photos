/**
 * UpdateBanner — Slim, dismissible banner shown above the app header
 * when a newer version of BatchMyPhotos is available.
 */

import React from 'react';
import { Download, X } from 'lucide-react';
import './UpdateBanner.css';

export function UpdateBanner({ latestVersion, downloadUrl, onDismiss }) {
  const handleDownload = () => {
    if (window.electronAPI?.openExternalUrl) {
      window.electronAPI.openExternalUrl(downloadUrl);
    } else {
      window.open(downloadUrl, '_blank');
    }
  };

  return (
    <div className="update-banner">
      <div className="update-banner-content">
        <Download size={16} className="update-banner-icon" />
        <span className="update-banner-text">
          Update available — <strong>v{latestVersion}</strong>
        </span>
        <button className="update-banner-download" onClick={handleDownload}>
          Download
        </button>
      </div>
      <button className="update-banner-dismiss" onClick={onDismiss} title="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}
