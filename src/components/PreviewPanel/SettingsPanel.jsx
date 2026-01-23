/**
 * SettingsPanel Component
 * 
 * Settings form for batch configuration
 */

import React from 'react';
import { Settings, Zap, Copy } from 'lucide-react';
import './PreviewPanel.css';

/**
 * @param {Object} props
 * @param {string} props.maxFilesPerBatch
 * @param {string} props.outputPrefix
 * @param {'move' | 'copy'} props.batchMode
 * @param {string|null} props.outputDir
 * @param {Object|null} props.validationError
 * @param {(key: string, value: string) => void} props.onChange
 * @param {() => void} props.onSelectOutputFolder
 */
function SettingsPanel({ 
  maxFilesPerBatch, 
  outputPrefix, 
  batchMode, 
  outputDir, 
  validationError,
  onChange,
  onSelectOutputFolder 
}) {
  return (
    <div className="settings-panel">
      <h3><Settings className="icon-inline" size={18} /> Settings</h3>
      
      <div className="setting-row">
        <label>Max Files Per Batch:</label>
        <input
          type="text"
          inputMode="numeric"
          value={maxFilesPerBatch}
          onChange={(e) => {
            const value = e.target.value.replace(/[^0-9]/g, '');
            onChange('maxFilesPerBatch', value);
          }}
          placeholder="500"
          className={validationError?.field === 'maxFilesPerBatch' ? 'input-error' : ''}
        />
      </div>
      
      <div className="setting-row">
        <label>Folder Name:</label>
        <input
          type="text"
          value={outputPrefix}
          onChange={(e) => onChange('outputPrefix', e.target.value)}
          placeholder="Batch"
          className={validationError?.field === 'outputPrefix' ? 'input-error' : ''}
        />
      </div>
      
      {/* Move vs Copy Mode */}
      <div className="setting-row mode-toggle">
        <label>Batch Mode:</label>
        <div className="mode-buttons">
          <button
            className={`mode-btn ${batchMode === 'move' ? 'active' : ''}`}
            onClick={() => onChange('batchMode', 'move')}
          >
            <Zap size={16} /> Move (Fast)
          </button>
          <button
            className={`mode-btn ${batchMode === 'copy' ? 'active' : ''}`}
            onClick={() => onChange('batchMode', 'copy')}
          >
            <Copy size={16} /> Copy (Safe)
          </button>
        </div>
      </div>
      
      {/* Output directory for copy mode */}
      {batchMode === 'copy' && (
        <div className="setting-row output-dir">
          <label>Output Location:</label>
          <div className="output-selector">
            <span className="output-path">
              {outputDir ? outputDir.split(/[/\\]/).pop() : 'Same as source'}
            </span>
            <button className="btn-small" onClick={onSelectOutputFolder}>
              Browse...
            </button>
          </div>
        </div>
      )}
      
      {batchMode === 'move' && (
        <p className="mode-note">
          <Zap size={12} className="icon-inline" /> 
          Files will be moved instantly (same drive). Close Explorer windows for best speed.
        </p>
      )}
      {batchMode === 'copy' && (
        <p className="mode-note">
          <Copy size={12} className="icon-inline" /> 
          Files will be copied. Originals will remain untouched.
        </p>
      )}
    </div>
  );
}

export default SettingsPanel;
