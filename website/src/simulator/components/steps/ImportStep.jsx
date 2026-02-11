import React, { useState } from 'react';
import { Camera, Calendar, HardDrive, FolderOpen, Heart, Plane, Timer, Users, Lock, Monitor, Zap } from 'lucide-react';
import { formatBytes } from '../../mockData';

/** Map folder.icon string names to Lucide components */
const FOLDER_ICONS = { Heart, Camera, Plane, Timer, Users };
import { trackStepReached } from '../../analytics';
import BoxSpinner from '../common/BoxSpinner';

/**
 * ImportStep — left sidebar with demo folder cards + right drop zone.
 *
 * The folder sidebar is web-demo-only (can't access filesystem), but the
 * drop zone and scanning animation now use the desktop CSS classes for parity.
 */

const FolderCard = ({ folder, isSelected, onSelect, onDragStart }) => {
    const sizeEstimate = folder.count * 7.5 * 1024 * 1024;

    return (
        <div
            draggable
            onDragStart={(e) => { e.dataTransfer.setData('text/plain', folder.id); onDragStart?.(folder); }}
            onClick={() => onSelect(folder)}
            className={`folder-card${isSelected ? ' selected' : ''}`}
        >
            <div className="folder-card-title">
                <span className="icon">{React.createElement(FOLDER_ICONS[folder.icon] || FolderOpen, { size: 18 })}</span>
                <h4>{folder.name}</h4>
            </div>
            <p className="folder-card-desc">{folder.description}</p>
            <div className="folder-card-meta">
                <span><Camera size={10} /> {folder.count.toLocaleString()} photos</span>
                <span><HardDrive size={10} /> ~{formatBytes(sizeEstimate)}</span>
                <span><Calendar size={10} /> {folder.dateRange.start.getFullYear()}</span>
            </div>
            <div className="folder-card-tags">
                {folder.cameras.map(cam => (
                    <span key={cam} className="tag">{cam}</span>
                ))}
                {folder.hasRaw && <span className="tag raw">RAW+JPG</span>}
            </div>
        </div>
    );
};

const ImportStep = ({ onImport, isImporting, currentFile, progress, state, demoFolders, selectedFolder, selectFolder }) => {
    const [dragOver, setDragOver] = useState(false);

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        const folderId = e.dataTransfer.getData('text/plain');
        const folder = demoFolders.find(f => f.id === folderId);
        if (folder) { selectFolder(folder); trackStepReached('folder_dropped'); }
    };

    const handleStartImport = () => {
        if (selectedFolder && !isImporting) onImport();
    };

    // Scanning / Analyzing state → use desktop's status-card + BoxSpinner
    if (isImporting) {
        return (
            <div className="status-card">
                <BoxSpinner />
                <h2>{state === 'importing' ? 'Scanning Folder…' : 'Analyzing Photos…'}</h2>
                <p>
                    {state === 'importing'
                        ? 'Discovering files and reading metadata…'
                        : `Analyzing ${selectedFolder?.count.toLocaleString()} files for pairs and blur…`}
                </p>
                <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <p className="sub-progress" style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {currentFile || '…'}
                </p>
            </div>
        );
    }

    // Idle → sidebar + drop zone (flex row fills SimulatorLayout's sim-main)
    return (
        <div style={{ display: 'flex', width: '100%', height: '100%', position: 'absolute', inset: 0 }}>
            {/* Left: Folder Sidebar */}
            <div className="demo-sidebar">
                <div className="demo-sidebar-header">
                    <h3>Choose a Demo Folder</h3>
                    <p>Select a folder to import, or drag it into the drop zone →</p>
                </div>
                <div className="demo-sidebar-list">
                    {demoFolders.map(folder => (
                        <FolderCard
                            key={folder.id}
                            folder={folder}
                            isSelected={selectedFolder?.id === folder.id}
                            onSelect={selectFolder}
                            onDragStart={() => {}}
                        />
                    ))}
                </div>
            </div>

            {/* Right: Drop Zone (desktop DropZone parity) */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
                <div className="idle-container">
                    <div
                        className={`drop-zone${dragOver ? ' drag-over' : ''}`}
                        onDrop={handleDrop}
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onClick={handleStartImport}
                    >
                        <div className="drop-zone-content">
                            {selectedFolder ? (
                                <>
                                    <div className="drop-icon">{React.createElement(FOLDER_ICONS[selectedFolder.icon] || FolderOpen, { size: 64, strokeWidth: 1.5 })}</div>
                                    <h2>{selectedFolder.name}</h2>
                                    <p>{selectedFolder.count.toLocaleString()} photos ready to import</p>
                                </>
                            ) : (
                                <>
                                    <div className="drop-icon"><FolderOpen size={64} strokeWidth={1.5} /></div>
                                    <h2>{dragOver ? 'Drop it here!' : 'Drop a folder here'}</h2>
                                    <p>or select one from the sidebar</p>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Start button */}
                    <button
                        className="btn primary"
                        disabled={!selectedFolder}
                        onClick={handleStartImport}
                        style={{ width: '100%', maxWidth: 500, justifyContent: 'center' }}
                    >
                        {selectedFolder ? 'Start Import ▸' : 'Select a folder to begin'}
                    </button>

                    {/* Trust badges */}
                    <div style={{ display: 'flex', gap: 24, fontSize: '0.75rem', color: 'var(--text-muted)', justifyContent: 'center' }}>
                        <span><Lock size={12} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} /> No files uploaded</span>
                        <span><Monitor size={12} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} /> 100% simulated</span>
                        <span><Zap size={12} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} /> Runs in browser</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ImportStep;