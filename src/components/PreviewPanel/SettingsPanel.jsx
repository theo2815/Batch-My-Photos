/**
 * SettingsPanel Component
 * 
 * Settings form for batch configuration
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Settings, Zap, Copy, ArrowDownAZ, Save, Trash2, Info, Plus, Loader2 } from 'lucide-react';
import CustomSelect from '../common/CustomSelect';
import Tooltip from '../common/Tooltip';
import { ValidationModal, DeletePresetModal } from '../Modals';
import './PreviewPanel.css';

// ... (props definition)

function SettingsPanel({ 
  maxFilesPerBatch, 
  outputPrefix, 
  batchMode,
  sortBy,
  outputDir, 
  // Props from parent
  validationError,
  isRefreshingPreview,
  onChange,
  onSelectOutputFolder,
  selectedPresetName, // Lifted state
  onPresetSelect    // Lifted state setter
}) {
  // Presets State
  const [presets, setPresets] = useState([]);
  
  // New States for inline naming
  const [isNamingPreset, setIsNamingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [isOptionsOpen, setIsOptionsOpen] = useState(false); // Menu toggle
  const optionsRef = React.useRef(null);
  
  // Modal states
  const [showValidationWarning, setShowValidationWarning] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Only close if menu is open AND click is truly outside
      if (isOptionsOpen && optionsRef.current && !optionsRef.current.contains(event.target)) {
        setIsOptionsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOptionsOpen]);

  // Sort Options
  const sortOptions = [
    { value: 'name-asc', label: 'Name (A-Z)' },
    { value: 'name-desc', label: 'Name (Z-A)' },
    { value: 'exif-asc', label: 'Date (Oldest First)' },
    { value: 'exif-desc', label: 'Date (Newest First)' }
  ];

  const loadPresets = useCallback(async () => {
    if (window.electronAPI?.getPresets) {
      try {
        const loadedPresets = await window.electronAPI.getPresets();
        setPresets(loadedPresets || []);
      } catch (err) {
        console.error('Failed to load presets:', err);
      }
    }
  }, []);

  // Load presets on mount
  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only data fetch is standard React pattern
  useEffect(() => { loadPresets(); }, [loadPresets]);

  const startSavePreset = () => {
    // Basic validation
    if (!maxFilesPerBatch || !outputPrefix) {
      setShowValidationWarning(true);
      return;
    }
    
    if (selectedPresetName) {
       setNewPresetName(selectedPresetName);
    } else {
       setNewPresetName('');
    }
    setIsNamingPreset(true);
  };

  const cancelSavePreset = () => {
    setIsNamingPreset(false);
    setNewPresetName('');
  };

  const confirmSavePreset = async () => {
    if (!newPresetName || !newPresetName.trim()) return;

    const settings = {
      maxFilesPerBatch,
      outputPrefix,
      batchMode,
      sortBy,
      outputDir
    };

    if (window.electronAPI?.savePreset) {
      const success = await window.electronAPI.savePreset(newPresetName.trim(), settings);
      if (success) {
        await loadPresets();
        onPresetSelect(newPresetName.trim());
        setIsNamingPreset(false);
      }
    }
  };

  const handleSaveExisting = async () => {
    if (!selectedPresetName) return;

    const settings = {
      maxFilesPerBatch,
      outputPrefix,
      batchMode,
      sortBy,
      outputDir
    };

    if (window.electronAPI?.savePreset) {
      // Immediate save without prompting for name
      const success = await window.electronAPI.savePreset(selectedPresetName, settings);
      if (success) {
        // Optional: Show a small toast or visual feedback here
        await loadPresets();
      }
    }
  };

  const handleDeletePreset = () => {
    if (!selectedPresetName) return;
    setShowDeleteConfirm(true);
  };

  const confirmDeletePreset = async () => {
    setShowDeleteConfirm(false);
    if (window.electronAPI?.deletePreset) {
      const success = await window.electronAPI.deletePreset(selectedPresetName);
      if (success) {
        await loadPresets();
        onPresetSelect('');
      }
    }
  };

  const handlePresetChange = (presetName) => {
    const preset = presets.find(p => p.name === presetName);
    if (!preset) return;

    onPresetSelect(preset.name);
    
    // Apply settings
    if (preset.settings) {
      onChange({
        maxFilesPerBatch: preset.settings.maxFilesPerBatch,
        outputPrefix: preset.settings.outputPrefix,
        batchMode: preset.settings.batchMode,
        sortBy: preset.settings.sortBy,
        outputDir: preset.settings.batchMode === 'move' ? null : (preset.settings.outputDir || null)
      });
    }
  };

  return (
    <div className="settings-panel">
      <h3><Settings className="icon-inline" size={18} /> Settings</h3>
      
      {/* Presets Section */}
      <div className="setting-row presets-row presets-section">
        <div className="presets-label-row">
          <label>Presets:</label>
          <Tooltip text="Quickly reuse saved settings with presets, or click ⚙ to add one." position="right">
            <Info size={14} color="var(--text-muted)" className="help-icon" />
          </Tooltip>
        </div>
        <div className="presets-controls">
          
          {isNamingPreset ? (
             <div className="preset-naming-row">
               <input 
                 type="text" 
                 autoFocus
                 placeholder="Preset name..."
                 value={newPresetName}
                 onChange={(e) => setNewPresetName(e.target.value)}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter') confirmSavePreset();
                   if (e.key === 'Escape') cancelSavePreset();
                 }}
                 className="preset-name-input"
               />
               <button 
                 onClick={confirmSavePreset}
                 className="btn-small primary"
                 disabled={!newPresetName.trim()}
               >
                 Save
               </button>
               <button 
                 onClick={cancelSavePreset}
                 className="btn-small"
               >
                 Cancel
               </button>
             </div>
          ) : (
            <>
              <CustomSelect 
                value={selectedPresetName}
                options={presets.map(p => ({ value: p.name, label: p.name }))}
                onChange={handlePresetChange}
                placeholder="Select or create preset..."
                className="presets-select"
              />
              
              <div className="presets-menu-container" ref={optionsRef}>
                <button 
                  className={`btn-icon presets-action-btn ${isOptionsOpen ? 'active' : ''}`}
                  title="Preset Actions"
                  onClick={() => setIsOptionsOpen(!isOptionsOpen)}
                >
                  <Settings size={16} />
                </button>

                {isOptionsOpen && (
                  <div className="settings-menu">
                    <button 
                      className="settings-menu-item"
                      onClick={() => {
                        // Close menu FIRST to prevent race conditions
                        setIsOptionsOpen(false);
                        onPresetSelect('');
                        setNewPresetName('');
                        
                        // Defer naming mode and settings clear to next tick for proper sequencing
                        setTimeout(() => {
                          setIsNamingPreset(true);
                          onChange({
                            maxFilesPerBatch: '',
                            outputPrefix: '',
                            batchMode: 'move',
                            sortBy: 'name-asc',
                            outputDir: null
                          });
                        }, 0);
                      }}
                    >
                      <Plus size={16} />
                      <span>New Preset</span>
                    </button>
                    
                    {selectedPresetName ? (
                      <button 
                        className="settings-menu-item"
                        onClick={() => {
                          handleSaveExisting();
                          setIsOptionsOpen(false);
                        }}
                      >
                        <Save size={16} />
                        <span>Save Changes</span>
                      </button>
                    ) : (
                      <button 
                        className="settings-menu-item"
                        onClick={() => {
                          startSavePreset();
                          setIsOptionsOpen(false);
                        }}
                      >
                        <Save size={16} />
                        <span>Save as Preset</span>
                      </button>
                    )}
                    
                    {selectedPresetName && (
                      <>
                        <div className="menu-divider"></div>
                        
                        <button 
                          className="settings-menu-item danger"
                          onClick={() => {
                            handleDeletePreset();
                            setIsOptionsOpen(false);
                          }}
                        >
                          <Trash2 size={16} />
                          <span>Delete Preset</span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      
      <div className="setting-row">
        <label>
          Max Photos Per Batch:
          {isRefreshingPreview && <Loader2 size={14} className="settings-loading-spinner" />}
        </label>
        <input
          type="text"
          inputMode="numeric"
          value={maxFilesPerBatch}
          onChange={(e) => {
            const value = e.target.value.replace(/[^0-9]/g, '');
            onChange('maxFilesPerBatch', value);
          }}
          placeholder="Max value per batch"
          className={`setting-input-fixed ${validationError?.field === 'maxFilesPerBatch' ? 'input-error' : ''}`}
        />
      </div>
      
      <div className="setting-row">
        <label>
          Folder Name:  

        </label>
        <div className="folder-name-input-wrapper">
          <input
            type="text"
            value={outputPrefix}
            onChange={(e) => {
              const val = e.target.value;
              // Check for forbidden characters (Windows constraints + / \)
              if (/[\\/:*?"<>|]/.test(val)) {
                // Show temporary warning or shake effect could be added here
                // For now, we rely on the helper text below becoming a warning
                onChange('outputPrefix', val); // Pass it through, let generic validation/sanitization handle it or show inline warning
              } else {
                onChange('outputPrefix', val);
              }
            }}
            placeholder="New folder name"
            className={`setting-input-fixed ${validationError?.field === 'outputPrefix' ? 'input-error' : ''}`}
          />
          
          {outputPrefix && /[\\/:*?"<>|]/.test(outputPrefix) ? (
             <span className="setting-hint setting-hint--warning">
               <span className="warning-icon">⚠️</span>
               {(() => {
                 const match = outputPrefix.match(/[\\/:*?"<>|]/);
                 const char = match ? match[0] : '/';
                 return `Character '${char}' is not allowed. Please use '-' instead.`;
               })()}
             </span>
          ) : (
            <span className="setting-hint setting-hint--muted">
              
            </span>
          )}
        </div>
      </div>
      
      {/* Sort Order */}
      <div className="setting-row">
        <label>
          <ArrowDownAZ size={14} className="icon-inline" /> Sort Photos By:
          {isRefreshingPreview && <Loader2 size={14} className="settings-loading-spinner" />}
        </label>
        
        <CustomSelect 
          value={sortBy}
          options={sortOptions}
          onChange={(value) => onChange('sortBy', value)}
          className="setting-input-fixed"
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
      
      {/* Validation Warning Modal */}
      <ValidationModal 
        error={showValidationWarning ? {
          title: 'Settings Required',
          message: 'Please fill in the settings before saving a preset.'
        } : null}
        onClose={() => setShowValidationWarning(false)}
      />
      
      {/* Delete Confirmation Modal */}
      <DeletePresetModal
        isOpen={showDeleteConfirm}
        presetName={selectedPresetName}
        onConfirm={confirmDeletePreset}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}

export default SettingsPanel;

