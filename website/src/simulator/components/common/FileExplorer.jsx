import React, { useState, useCallback, useMemo } from 'react';
import {
    Folder, FolderOpen, ChevronRight, ArrowLeft, X,
    AlertTriangle, Image as ImageIcon, Grid3x3, List,
} from 'lucide-react';
import ImagePreviewModal from './ImagePreviewModal';
import { getThumbnailGradient } from '../../thumbnailUtils';
import { formatBytes, formatDate } from '../../mockData';

/**
 * FileExplorer — In-browser artificial file explorer that mimics how
 * users browse batch folders in their operating system.
 *
 * States:
 *   root   → grid of batch folders (like Windows Explorer folder view)
 *   folder → grid/list of files inside a batch (with thumbnails)
 *
 * Features:
 *   ✓ Breadcrumb navigation (Root > FolderName)
 *   ✓ Back button
 *   ✓ Folder grid with icons + names + file counts
 *   ✓ File grid with gradient thumbnails (clickable → ImagePreviewModal)
 *   ✓ Grid/List view toggle
 *   ✓ Status bar with item count + total size
 *   ✓ Paginated file loading (60 at a time) for performance
 */

const FILES_PER_PAGE = 60;

// ─── Breadcrumb ─────────────────────────────────────────────────────────

const Breadcrumb = ({ rootName, currentFolder, onNavigateRoot }) => (
    <div className="explorer-breadcrumb">
        <button
            className={`breadcrumb-segment${!currentFolder ? ' active' : ''}`}
            onClick={onNavigateRoot}
        >
            <Folder size={14} />
            {rootName}
        </button>
        {currentFolder && (
            <>
                <ChevronRight size={14} className="breadcrumb-sep" />
                <span className="breadcrumb-segment active">
                    {currentFolder.isBlurBatch ? (
                        <AlertTriangle size={14} />
                    ) : (
                        <FolderOpen size={14} />
                    )}
                    {currentFolder.name}
                </span>
            </>
        )}
    </div>
);

// ─── Folder Card (root view) ────────────────────────────────────────────

const FolderCard = ({ batch, onClick }) => {
    const isBlur = batch.isBlurBatch;

    return (
        <button className={`explorer-folder-card${isBlur ? ' blur-folder' : ''}`} onClick={onClick}>
            <div className="explorer-folder-icon">
                {isBlur ? (
                    <AlertTriangle size={36} />
                ) : (
                    <Folder size={36} />
                )}
            </div>
            <span className="explorer-folder-name" title={batch.name}>
                {batch.name}
            </span>
            <span className="explorer-folder-meta">
                {batch.count.toLocaleString()} photos
            </span>
        </button>
    );
};

// ─── File Card (grid view inside a folder) ──────────────────────────────

const FileCard = ({ file, onClick }) => (
    <button className="explorer-file-card" onClick={onClick} title={file.name}>
        <div
            className="explorer-file-thumb"
            style={{ background: getThumbnailGradient(file.name) }}
        >
            {file.isBlurry && (
                <span className="explorer-file-blur-badge">
                    <AlertTriangle size={10} />
                </span>
            )}
        </div>
        <span className="explorer-file-name">{file.name}</span>
    </button>
);

// ─── File Row (list view inside a folder) ───────────────────────────────

const FileRow = ({ file, onClick }) => (
    <button className="explorer-file-row" onClick={onClick}>
        <div
            className="explorer-file-row-thumb"
            style={{ background: getThumbnailGradient(file.name) }}
        />
        <span className="explorer-file-row-name" title={file.name}>{file.name}</span>
        <span className="explorer-file-row-meta">{formatBytes(file.size)}</span>
        <span className="explorer-file-row-meta">{file.exif?.dimensions || '—'}</span>
        <span className="explorer-file-row-meta">{formatDate(file.date)}</span>
        {file.isBlurry && (
            <span className="explorer-file-row-blur">
                <AlertTriangle size={12} /> Blurry
            </span>
        )}
    </button>
);

// ─── Status Bar ─────────────────────────────────────────────────────────

const StatusBar = ({ itemCount, totalSize, isFolder }) => (
    <div className="explorer-status-bar">
        <span>{itemCount.toLocaleString()} {isFolder ? 'folder' : 'item'}{itemCount !== 1 ? 's' : ''}</span>
        {totalSize > 0 && <span>{formatBytes(totalSize)}</span>}
    </div>
);

// ─── Main FileExplorer ──────────────────────────────────────────────────

const FileExplorer = ({ batches, selectedFolder, onClose }) => {
    const [currentBatch, setCurrentBatch] = useState(null);
    const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
    const [filesShown, setFilesShown] = useState(FILES_PER_PAGE);
    const [previewImage, setPreviewImage] = useState(null);

    const rootName = selectedFolder?.name?.split('—')[0]?.trim() || 'Photos';

    // Navigate into a batch folder
    const openFolder = useCallback((batch) => {
        setCurrentBatch(batch);
        setFilesShown(FILES_PER_PAGE);
    }, []);

    // Navigate back to root
    const goToRoot = useCallback(() => {
        setCurrentBatch(null);
        setFilesShown(FILES_PER_PAGE);
    }, []);

    // Image preview
    const handleFileClick = useCallback((file) => {
        if (currentBatch) {
            setPreviewImage({ fileName: file.name, fileList: currentBatch.items });
        }
    }, [currentBatch]);

    // Memoize sorted batches (normal first, then blur)
    const sortedBatches = useMemo(() => {
        const normal = batches.filter(b => !b.isBlurBatch);
        const blur = batches.filter(b => b.isBlurBatch);
        return [...normal, ...blur];
    }, [batches]);

    // Total size across all batches
    const totalRootSize = useMemo(() =>
        batches.reduce((sum, b) => sum + b.totalSize, 0)
    , [batches]);

    // Visible files for the current batch (paginated)
    const visibleFiles = currentBatch ? currentBatch.items.slice(0, filesShown) : [];
    const remainingFiles = currentBatch ? currentBatch.items.length - filesShown : 0;

    return (
        <div className="explorer-overlay">
            <div className="explorer-window">

                {/* ─── Title Bar ──────────────────────────── */}
                <div className="explorer-titlebar">
                    <div className="explorer-titlebar-left">
                        <Folder size={14} className="explorer-titlebar-icon" />
                        <span>
                            {currentBatch ? currentBatch.name : rootName}
                        </span>
                    </div>
                    <button className="explorer-titlebar-close" onClick={onClose} title="Close">
                        <X size={16} />
                    </button>
                </div>

                {/* ─── Toolbar ────────────────────────────── */}
                <div className="explorer-toolbar">
                    <button
                        className="explorer-toolbar-btn"
                        onClick={goToRoot}
                        disabled={!currentBatch}
                        title="Back"
                    >
                        <ArrowLeft size={16} />
                    </button>

                    <Breadcrumb
                        rootName={rootName}
                        currentFolder={currentBatch}
                        onNavigateRoot={goToRoot}
                    />

                    <div className="explorer-toolbar-right">
                        <button
                            className={`explorer-view-btn${viewMode === 'grid' ? ' active' : ''}`}
                            onClick={() => setViewMode('grid')}
                            title="Grid view"
                        >
                            <Grid3x3 size={16} />
                        </button>
                        <button
                            className={`explorer-view-btn${viewMode === 'list' ? ' active' : ''}`}
                            onClick={() => setViewMode('list')}
                            title="List view"
                        >
                            <List size={16} />
                        </button>
                    </div>
                </div>

                {/* ─── Content Area ───────────────────────── */}
                <div className="explorer-content">
                    {!currentBatch ? (
                        /* Root: folder grid */
                        <div className="explorer-folder-grid">
                            {sortedBatches.map(batch => (
                                <FolderCard
                                    key={batch.id}
                                    batch={batch}
                                    onClick={() => openFolder(batch)}
                                />
                            ))}
                        </div>
                    ) : viewMode === 'grid' ? (
                        /* Inside folder: file grid */
                        <div className="explorer-file-grid">
                            {visibleFiles.map(file => (
                                <FileCard
                                    key={file.id}
                                    file={file}
                                    onClick={() => handleFileClick(file)}
                                />
                            ))}
                            {remainingFiles > 0 && (
                                <button
                                    className="explorer-load-more"
                                    onClick={() => setFilesShown(prev => prev + FILES_PER_PAGE)}
                                >
                                    Load {Math.min(remainingFiles, FILES_PER_PAGE)} more
                                    <span className="explorer-load-more-sub">
                                        ({remainingFiles.toLocaleString()} remaining)
                                    </span>
                                </button>
                            )}
                        </div>
                    ) : (
                        /* Inside folder: list view */
                        <div className="explorer-file-list">
                            <div className="explorer-list-header">
                                <span className="col-thumb"></span>
                                <span className="col-name">Name</span>
                                <span className="col-meta">Size</span>
                                <span className="col-meta">Dimensions</span>
                                <span className="col-meta">Date</span>
                            </div>
                            {visibleFiles.map(file => (
                                <FileRow
                                    key={file.id}
                                    file={file}
                                    onClick={() => handleFileClick(file)}
                                />
                            ))}
                            {remainingFiles > 0 && (
                                <button
                                    className="explorer-load-more list-mode"
                                    onClick={() => setFilesShown(prev => prev + FILES_PER_PAGE)}
                                >
                                    Load {Math.min(remainingFiles, FILES_PER_PAGE)} more
                                    ({remainingFiles.toLocaleString()} remaining)
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* ─── Status Bar ─────────────────────────── */}
                <StatusBar
                    itemCount={currentBatch ? currentBatch.fileCount : sortedBatches.length}
                    totalSize={currentBatch ? currentBatch.totalSize : totalRootSize}
                    isFolder={!currentBatch}
                />
            </div>

            {/* ─── Image Preview Modal (reused) ──────────── */}
            <ImagePreviewModal
                isOpen={!!previewImage}
                fileName={previewImage?.fileName}
                fileList={previewImage?.fileList || []}
                onClose={() => setPreviewImage(null)}
            />
        </div>
    );
};

export default FileExplorer;
