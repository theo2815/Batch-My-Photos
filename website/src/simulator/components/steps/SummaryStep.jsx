import React, { useState } from 'react';
import { CheckCircle, Download, RotateCcw, FolderOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { trackCTAClicked } from '../../analytics';
import FileExplorer from '../common/FileExplorer';

/**
 * SummaryStep — centered card matching the desktop app's CompleteCard.jsx.
 *
 *   ✓ CheckCircle (64px, green)
 *   title  →  summary text  →  results-summary (top 5 folders)
 *   →  action buttons  →  download CTA
 *   ✓ "Open in Explorer" button → FileExplorer overlay
 */
const SummaryStep = ({ batches, stats, elapsedTime, onReset, selectedFolder }) => {
    const [explorerOpen, setExplorerOpen] = useState(false);
    const normalBatches = batches.filter(b => !b.isBlurBatch);
    const blurBatch     = batches.find(b => b.isBlurBatch);

    return (
        <div className="status-card" style={{ maxWidth: 550 }}>
            {/* Success icon — 64px green circle */}
            <div className="success-icon" style={{ color: 'var(--success)' }}>
                <CheckCircle size={64} />
            </div>

            <h2>Batching Complete!</h2>
            <p>
                Successfully created <strong>{normalBatches.length}</strong> batch folder{normalBatches.length !== 1 ? 's' : ''}.
            </p>

            {/* Results Summary — top 5 + blur */}
            <div className="results-summary">
                {normalBatches.slice(0, 5).map(b => (
                    <div key={b.id} className="result-row">
                        <span className="folder-name">
                            {b.name}
                        </span>
                        <span className="file-count">{b.count} files</span>
                    </div>
                ))}
                {blurBatch && (
                    <div className="result-row">
                        <span className="folder-name" style={{ color: 'var(--warning)' }}>
                            {blurBatch.name}
                        </span>
                        <span className="file-count" style={{ color: 'var(--warning)' }}>{blurBatch.count} files</span>
                    </div>
                )}
                {normalBatches.length > 5 && (
                    <p className="more-results">
                        …and {normalBatches.length - 5} more folder{normalBatches.length - 5 !== 1 ? 's' : ''}
                    </p>
                )}
            </div>

            {/* Action Buttons */}
            <div className="action-buttons">
                <button
                    className="btn secondary"
                    onClick={() => { trackCTAClicked('open_explorer'); setExplorerOpen(true); }}
                >
                    <FolderOpen size={16} /> Open in Explorer
                </button>

                <Link
                    to="/register"
                    onClick={() => trackCTAClicked('download_real_app')}
                    className="btn primary"
                    style={{ textDecoration: 'none' }}
                >
                    <Download size={16} /> Download the Real App
                </Link>

                <button
                    className="btn secondary"
                    onClick={() => { trackCTAClicked('try_again'); onReset(); }}
                >
                    <RotateCcw size={16} /> Process Another Folder
                </button>
            </div>

            {/* Demo CTA */}
            <div className="demo-cta" style={{ marginTop: 'var(--space-lg)' }}>
                <span>This was a simulated demo — no real files were moved or copied.</span>
            </div>

            {/* File Explorer Overlay */}
            {explorerOpen && (
                <FileExplorer
                    batches={batches}
                    selectedFolder={selectedFolder}
                    onClose={() => setExplorerOpen(false)}
                />
            )}
        </div>
    );
};

export default SummaryStep;