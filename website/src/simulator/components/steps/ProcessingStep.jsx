import React from 'react';
import { XCircle } from 'lucide-react';
import BoxSpinner from '../common/BoxSpinner';

/**
 * ProcessingStep — matches the desktop app's ExecutingCard.jsx.
 * Centered card with:  BoxSpinner → title → linear progress bar (8px)
 *                      → "X of Y folders created" → cancel button (danger)
 */
const ProcessingStep = ({ progress, batches, batchMode, onCancel }) => {
    const foldersCreated = Math.floor((progress / 100) * (batches?.length || 0));
    const totalFolders   = batches?.length || 0;

    const title = 'Creating Batches...';

    return (
        <div className="status-card">
            {/* Box Spinner — CSS-only rotating cube */}
            <BoxSpinner />

            <h2>{title}</h2>

            {/* Linear progress bar (8px, matching desktop) */}
            <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>

            <p>
                <strong>{foldersCreated}</strong> of <strong>{totalFolders}</strong> folders created
            </p>

            {/* Cancel button — danger styled, matching desktop */}
            <button className="btn cancel-btn" onClick={onCancel}>
                <XCircle size={16} /> Cancel
            </button>
        </div>
    );
};

export default ProcessingStep;