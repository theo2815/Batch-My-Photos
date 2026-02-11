import React, { useState, useCallback } from 'react';
import { CheckCircle, RotateCcw, FolderOpen, Package, ScanEye, Zap, Copy } from 'lucide-react';
import SimulatorSettings from '../SimulatorSettings';
import ImagePreviewModal from '../common/ImagePreviewModal';
import { getThumbnailGradient } from '../../thumbnailUtils';

/**
 * PreviewStep — single-column centered layout matching the desktop app's
 * PreviewPanel.jsx.  Layout order:
 *
 *   FolderInfo  →  StatsGrid  →  SettingsPanel (inline)
 *   →  BatchPreview (accordion)  →  ConfirmationBox  →  ActionButtons
 */

// ─── Stats Grid  (3 cols, or 4 when blur enabled) ───────────────────────

const StatsGrid = ({ stats, batchCount, blurEnabled }) => (
    <div className={`stats-grid${blurEnabled ? ' has-blur' : ''}`}>
        <div className="stat-card">
            <div className="stat-value">{stats.totalFiles.toLocaleString()}</div>
            <div className="stat-label">Total Files</div>
        </div>
        <div className="stat-card">
            <div className="stat-value">{stats.totalGroups.toLocaleString()}</div>
            <div className="stat-label">File Groups</div>
        </div>
        <div className="stat-card highlight">
            <div className="stat-value">{batchCount}</div>
            <div className="stat-label">Batches to Create</div>
        </div>
        {blurEnabled && (
            <div className="stat-card blur-stat">
                <div className="stat-value">
                    <ScanEye size={16} className="blur-stat-icon" /> {stats.blurryCount}
                </div>
                <div className="stat-label">Blurry Photos</div>
            </div>
        )}
    </div>
);

// ─── Batch Accordion Item ───────────────────────────────────────────────

const INITIAL_FILES_SHOWN = 8;
const LOAD_MORE_COUNT     = 16;

const BatchAccordionItem = ({ batch, isBlur = false, onImageClick }) => {
    const [expanded, setExpanded]   = useState(false);
    const [filesShown, setFilesShown] = useState(INITIAL_FILES_SHOWN);

    const visibleFiles = batch.items.slice(0, filesShown);
    const remaining    = batch.items.length - filesShown;

    return (
        <div className="batch-item">
            <button
                className={`batch-header${expanded ? ' expanded' : ''}${isBlur ? ' blur-batch' : ''}`}
                onClick={() => setExpanded(!expanded)}
            >
                <span className="batch-name">{batch.name}</span>
                <span className="batch-count">{batch.count} photos</span>
                <span className="expand-icon">{expanded ? '▼' : '▶'}</span>
            </button>

            {expanded && (
                <div className="batch-files">
                    {visibleFiles.map(file => (
                        <div key={file.id} className="file-item">
                            <div
                                className="thumbnail-placeholder"
                                style={{ background: getThumbnailGradient(file.name) }}
                                onClick={() => onImageClick?.(file.name, batch.items)}
                                title="Click to preview"
                            />
                            <span className="file-name">{file.name}</span>
                        </div>
                    ))}
                    {remaining > 0 && (
                        <button
                            className="load-more-btn"
                            onClick={() => setFilesShown(prev => prev + LOAD_MORE_COUNT)}
                        >
                            Show {Math.min(remaining, LOAD_MORE_COUNT)} more files ({remaining} remaining)
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

// ─── Batch Preview Accordion ────────────────────────────────────────────

const INITIAL_BATCHES_SHOWN = 5;
const LOAD_MORE_BATCHES     = 5;

const BatchPreview = ({ batches, onImageClick }) => {
    const [batchesShown, setBatchesShown] = useState(INITIAL_BATCHES_SHOWN);

    const normalBatches = batches.filter(b => !b.isBlurBatch);
    const blurBatch     = batches.find(b => b.isBlurBatch);
    const visibleBatches = normalBatches.slice(0, batchesShown);
    const remainingBatches = normalBatches.length - batchesShown;

    return (
        <div className="batch-preview">
            <h3><Package className="icon-inline" size={18} /> Batch Preview</h3>
            <div className="batch-list">
                {visibleBatches.map(batch => (
                    <BatchAccordionItem key={batch.id} batch={batch} onImageClick={onImageClick} />
                ))}
                {remainingBatches > 0 && (
                    <button
                        className="load-more-btn"
                        onClick={() => setBatchesShown(prev => prev + LOAD_MORE_BATCHES)}
                    >
                        Show {Math.min(remainingBatches, LOAD_MORE_BATCHES)} more batches ({remainingBatches} remaining)
                    </button>
                )}
            </div>

            {blurBatch && (
                <>
                    <h3 style={{ marginTop: 'var(--space-lg)' }}><ScanEye className="icon-inline" size={18} /> Blurry Photos</h3>
                    <div className="batch-list">
                        <BatchAccordionItem batch={blurBatch} isBlur onImageClick={onImageClick} />
                    </div>
                </>
            )}
        </div>
    );
};

// ─── Main PreviewStep ───────────────────────────────────────────────────

const PreviewStep = ({ photos, groups, batches, stats, settings, updateSettings, onProcess, onSelectDifferent, selectedFolder }) => {
    // Image preview modal state
    const [previewImage, setPreviewImage] = useState(null);

    const handleImageClick = useCallback((fileName, fileList) => {
        setPreviewImage({ fileName, fileList });
    }, []);

    // Confirmation text
    const firstBatchName = batches.length > 0 ? batches[0].name : `${settings.folderName}_001`;
    const lastBatchName  = batches.length > 1
        ? batches.filter(b => !b.isBlurBatch).slice(-1)[0]?.name || firstBatchName
        : firstBatchName;
    const normalCount = batches.filter(b => !b.isBlurBatch).length;

    const folderName = selectedFolder?.name || 'Photo Folder';
    const simulatedPath = `C:\\Users\\Photos\\${folderName}`;

    return (
        <div className="preview-container">
            {/* Folder Info — matches desktop: folder name h2 + monospace path */}
            <div className="folder-info">
                <h2><FolderOpen className="icon-inline" size={28} /> {folderName}</h2>
                <p className="folder-path">{simulatedPath}</p>
            </div>

            {/* Stats Grid */}
            <StatsGrid stats={stats} batchCount={normalCount} blurEnabled={settings.blurEnabled} />

            {/* Settings Panel (inline, matching desktop) */}
            <SimulatorSettings settings={settings} updateSettings={updateSettings} />

            {/* Batch Accordion */}
            <BatchPreview batches={batches} onImageClick={handleImageClick} />

            {/* Confirmation Box */}
            <div className="confirmation-box">
                <p>
                    This will create <strong>{normalCount}</strong> folder{normalCount !== 1 ? 's' : ''} named{' '}
                    <strong style={{ fontFamily: 'monospace' }}>{firstBatchName}</strong>
                    {normalCount > 1 && <> through <strong style={{ fontFamily: 'monospace' }}>{lastBatchName}</strong></>}
                </p>
                <p className="note">
                    {settings.batchMode === 'move'
                        ? <><Zap size={14} className="icon-inline" /> Files will be moved instantly (same drive). The original files will be placed inside the newly created batch folders.</>
                        : <><Copy size={14} className="icon-inline" /> Files will be copied. Originals will remain untouched.</>}
                </p>
            </div>

            {/* Action Buttons */}
            <div className="action-buttons">
                {onSelectDifferent && (
                    <button className="btn secondary" onClick={onSelectDifferent}>
                        <RotateCcw size={16} /> Select Different Folder
                    </button>
                )}
                <button className="btn primary" onClick={onProcess}>
                    <CheckCircle size={16} className="icon-inline" /> Proceed with Batching
                </button>
            </div>

            {/* Image Preview Modal */}
            <ImagePreviewModal
                isOpen={!!previewImage}
                fileName={previewImage?.fileName}
                fileList={previewImage?.fileList || []}
                onClose={() => setPreviewImage(null)}
            />
        </div>
    );
};

export default PreviewStep;