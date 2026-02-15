import React from 'react';
import { XCircle } from 'lucide-react';
import BoxSpinner from '../common/BoxSpinner';

/**
 * ProcessingStep — matches the desktop app's ExecutingCard.jsx.
 * Centered card with:  BoxSpinner → title → linear progress bar (8px)
 *                      → "X of Y folders created" → cancel button (danger)
 * Also handles rollback/undo display when isRollback is true.
 */
const ProcessingStep = ({ progress, currentFile, batches, batchMode, onCancel, isRollback }) => {
    const foldersCreated = Math.floor((progress / 100) * (batches?.length || 0));
    const totalFolders   = batches?.length || 0;

    const title = isRollback ? 'Restoring Files...' : 'Creating Batches...';

    return (
        <div className="status-card">
            {/* Box Spinner — CSS-only rotating cube */}
            <BoxSpinner />

            <h2>{title}</h2>

            {/* Linear progress bar (8px, matching desktop) */}
            <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>

            {isRollback ? (
                <p>{currentFile || 'Restoring files to original locations...'}</p>
            ) : (
                <p>
                    <strong>{foldersCreated}</strong> of <strong>{totalFolders}</strong> folders created
                </p>
            )}

            {/* Cancel button — only shown if not rolling back and onCancel is provided */}
            {!isRollback && onCancel && (
                <button className="btn cancel-btn" onClick={onCancel}>
                    <XCircle size={16} /> Cancel
                </button>
            )}
        </div>
    );
};

export default ProcessingStep;