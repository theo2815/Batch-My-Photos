/**
 * PreviewPanel Component
 * 
 * Main preview screen showing folder stats, settings, and batch preview
 */

import React from 'react';
import { FolderOpen, TriangleAlert, Zap, Copy, RotateCcw, CheckCircle } from 'lucide-react';
import StatsGrid from './StatsGrid';
import SettingsPanel from './SettingsPanel';
import BatchPreview from './BatchPreview';
import './PreviewPanel.css';

/**
 * @param {Object} props
 * @param {string} props.folderPath - Path of selected folder
 * @param {Object} props.scanResults - Scan results object
 * @param {Object} props.previewResults - Preview results object
 * @param {boolean} props.isRefreshingPreview - Loading state for preview
 * @param {Object} props.settings - Current settings
 * @param {Object|null} props.validationError - Validation error object
 * @param {number|null} props.expandedBatch - Currently expanded batch
 * @param {(key: string, value: string) => void} props.onSettingsChange
 * @param {(batchNumber: number) => void} props.onToggleBatch
 * @param {() => void} props.onSelectOutputFolder
 * @param {() => void} props.onProceed
 * @param {() => void} props.onReset
 */
function PreviewPanel({
  folderPath,
  scanResults,
  previewResults,
  isRefreshingPreview,
  settings,
  validationError,
  expandedBatch,
  // New props for preset lifting
  selectedPresetName,
  onPresetSelect,
  // Existing props
  onSettingsChange,
  onToggleBatch,
  onSelectOutputFolder,
  onProceed,
  onReset
}) {
  const { maxFilesPerBatch, outputPrefix, batchMode, sortBy, outputDir } = settings;
  
  return (
    <div className="preview-container">
      {/* Folder Info */}
      <div className="folder-info">
        <h2><FolderOpen className="icon-inline" size={28} /> {folderPath?.split(/[/\\]/).pop()}</h2>
        <p className="folder-path">{folderPath}</p>
      </div>
      
      {/* Stats Grid */}
      <StatsGrid
        totalFiles={scanResults?.totalFiles || 0}
        totalGroups={scanResults?.totalGroups || 0}
        batchCount={previewResults?.batchCount || 0}
        isLoading={isRefreshingPreview}
      />
      
      {/* Settings Panel */}
      <SettingsPanel
        maxFilesPerBatch={maxFilesPerBatch}
        outputPrefix={outputPrefix}
        batchMode={batchMode}
        sortBy={sortBy}
        outputDir={outputDir}
        validationError={validationError}
        onChange={onSettingsChange}
        onSelectOutputFolder={onSelectOutputFolder}
        // Pass preset props
        selectedPresetName={selectedPresetName}
        onPresetSelect={onPresetSelect}
      />
      
      {/* Batch Preview Accordion */}
      <BatchPreview
        batchDetails={previewResults?.batchDetails}
        outputPrefix={outputPrefix}
        expandedBatch={expandedBatch}
        onToggleBatch={onToggleBatch}
      />
      
      {/* Warning for oversized groups */}
      {previewResults?.oversizedGroups?.length > 0 && (
        <div className="warning-box">
          <h4><TriangleAlert size={18} className="icon-inline" /> Warning: Oversized File Groups</h4>
          <p>
            Some file groups exceed your limit of {maxFilesPerBatch} files. 
            These groups will NOT be split to keep file pairs together:
          </p>
          <ul>
            {previewResults.oversizedGroups.map((g, i) => (
              <li key={i}>{g.name} ({g.count} files)</li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Confirmation Box */}
      <div className="confirmation-box">
        <p>
          This will create <strong>{previewResults?.batchCount || 0}</strong> folders 
          named <strong>{outputPrefix}_001</strong> through <strong>{outputPrefix}_{String(previewResults?.batchCount || 0).padStart(3, '0')}</strong>.
        </p>
        {batchMode === 'move' ? (
          <p className="note">
            <Zap size={14} className="icon-inline" /> 
            Files will be moved instantly (same drive). The original files will be placed inside the newly created batch folders.
          </p>
        ) : (
          <p className="note">
            <Copy size={14} className="icon-inline" /> 
            Files will be copied to the <strong>{outputDir ? outputDir.split(/[/\\]/).pop() : 'source folder'}</strong>. Originals will remain untouched.
          </p>
        )}
      </div>
      
      {/* Action Buttons */}
      <div className="action-buttons">
        <button className="btn secondary" onClick={onReset}>
          <RotateCcw size={16} /> Select Different Folder
        </button>
        <button className="btn primary" onClick={onProceed}>
          <CheckCircle size={16} className="icon-inline" /> Proceed with Batching
        </button>
      </div>
    </div>
  );
}

export default PreviewPanel;
