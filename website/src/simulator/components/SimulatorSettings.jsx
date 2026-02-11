import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Settings, ChevronDown, Save, Trash2, Download, Eye, ScanEye, Zap, Copy, X, ArrowDownAZ, Info } from 'lucide-react';
import { trackSettingChanged } from '../analytics';

/**
 * SimulatorSettings — inline settings panel matching the desktop app's
 * SettingsPanel.jsx layout: setting-row flex layout with labels left,
 * controls right. Includes presets (localStorage), custom select dropdowns,
 * toggle switch for blur, and sensitivity selector.
 */

const SORT_OPTIONS = [
    { value: 'date-asc',  label: 'Date (Oldest First)' },
    { value: 'date-desc', label: 'Date (Newest First)' },
    { value: 'name-asc',  label: 'Name (A → Z)' },
    { value: 'name-desc', label: 'Name (Z → A)' },
];

const SENSITIVITY_OPTIONS = [
    { value: 'strict',   label: 'Strict',   desc: 'Catches most blurry photos. May flag some acceptable shots.' },
    { value: 'moderate', label: 'Moderate', desc: 'Balanced detection. Recommended for most use cases.' },
    { value: 'lenient',  label: 'Lenient',  desc: 'Only flags obviously blurry photos. Minimizes false positives.' },
];

const BUILT_IN_PRESETS = {
    'Default':       { maxPhotos: 500,  folderName: 'Batch Folder', sortBy: 'date-asc',  blurEnabled: false, sensitivity: 'moderate', batchMode: 'move' },
    'Wedding Pro':   { maxPhotos: 300,  folderName: 'Wedding',      sortBy: 'date-asc',  blurEnabled: true,  sensitivity: 'moderate', batchMode: 'copy' },
    'Sports Burst':  { maxPhotos: 1000, folderName: 'Sports',       sortBy: 'date-asc',  blurEnabled: true,  sensitivity: 'strict',   batchMode: 'move' },
    'Archive':       { maxPhotos: 500,  folderName: 'Archive',      sortBy: 'date-asc',  blurEnabled: false, sensitivity: 'lenient',  batchMode: 'move' },
};

// ─── Custom Select dropdown (matches desktop Common/CustomSelect) ────────

const CustomSelect = ({ value, options, onChange, width = 230 }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const selected = options.find(o => o.value === value) || options[0];

    return (
        <div ref={ref} className={`custom-select${open ? ' open' : ''}`} style={{ width }} onClick={() => setOpen(!open)}>
            <div className="select-selected">
                <span>{selected.label}</span>
                <ChevronDown size={14} className="select-arrow" />
            </div>
            <div className="select-options">
                {options.map(opt => (
                    <div
                        key={opt.value}
                        className={`select-option${opt.value === value ? ' active' : ''}`}
                        onClick={(e) => { e.stopPropagation(); onChange(opt.value); setOpen(false); }}
                    >
                        {opt.label}
                    </div>
                ))}
            </div>
        </div>
    );
};

// ─── Toggle Switch (matches desktop SettingsPanel toggle) ────────────────

const ToggleSwitch = ({ checked, onChange }) => (
    <label className="toggle-switch">
        <input type="checkbox" checked={checked} onChange={onChange} />
        <span className="toggle-track">
            <span className="toggle-label on">On</span>
            <span className="toggle-label off">Off</span>
            <span className="toggle-knob" />
        </span>
    </label>
);

// ─── Main component ─────────────────────────────────────────────────────

const SimulatorSettings = ({ settings, updateSettings }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const [savingPreset, setSavingPreset] = useState(false);
    const [presetName, setPresetName] = useState('');
    const [currentPreset, setCurrentPreset] = useState('Default');
    const [showSensitivityModal, setShowSensitivityModal] = useState(false);
    const menuRef = useRef(null);

    // Load custom presets from localStorage
    const getCustomPresets = useCallback(() => {
        try {
            return JSON.parse(localStorage.getItem('bmp_demo_presets') || '{}');
        } catch { return {}; }
    }, []);

    const allPresets = { ...BUILT_IN_PRESETS, ...getCustomPresets() };

    // Close menu on outside click
    useEffect(() => {
        const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const applyPreset = (name) => {
        if (allPresets[name]) {
            updateSettings(allPresets[name]);
            setCurrentPreset(name);
            trackSettingChanged('preset', name);
        }
    };

    const savePreset = () => {
        if (!presetName.trim()) return;
        const custom = getCustomPresets();
        custom[presetName.trim()] = { ...settings };
        localStorage.setItem('bmp_demo_presets', JSON.stringify(custom));
        setCurrentPreset(presetName.trim());
        setSavingPreset(false);
        setPresetName('');
        setMenuOpen(false);
        trackSettingChanged('preset_saved', presetName.trim());
    };

    const deletePreset = (name) => {
        const custom = getCustomPresets();
        delete custom[name];
        localStorage.setItem('bmp_demo_presets', JSON.stringify(custom));
        if (currentPreset === name) setCurrentPreset('Default');
        setMenuOpen(false);
    };

    const handleSettingChange = (key, value) => {
        updateSettings({ [key]: value });
        trackSettingChanged(key, value);
    };

    // Folder name preview
    const namePreview = `${settings.folderName || 'Batch'}_001`;
    const forbiddenChars = /[<>:"/\\|?*]/;
    const hasForbidden = forbiddenChars.test(settings.folderName);

    const presetOptions = Object.keys(allPresets).map(k => ({ value: k, label: k }));
    const customPresetNames = Object.keys(getCustomPresets());

    return (
        <>
            <div className="settings-panel">
                <h3><Settings className="icon-inline" size={18} /> Settings</h3>

                {/* ── Presets ─────────────────────────────────────────────── */}
                <div className="setting-row presets-section">
                    <div className="presets-label-row">
                        <label>Presets:</label>
                        <Info size={14} color="var(--text-muted)" style={{ cursor: 'help' }} title="Quickly reuse saved settings with presets, or click the gear icon to add one." />
                    </div>
                    <div className="presets-controls">
                        {savingPreset ? (
                            <div className="preset-naming-row">
                                <input
                                    className="preset-name-input"
                                    type="text"
                                    placeholder="Preset name…"
                                    value={presetName}
                                    onChange={e => setPresetName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && savePreset()}
                                    autoFocus
                                />
                                <button className="btn-small primary" onClick={savePreset} disabled={!presetName.trim()}>Save</button>
                                <button className="btn-small" onClick={() => setSavingPreset(false)}><X size={14} /></button>
                            </div>
                        ) : (
                            <>
                                <CustomSelect
                                    value={currentPreset}
                                    options={presetOptions}
                                    onChange={applyPreset}
                                    width="100%"
                                />
                                <div className="presets-menu-container" ref={menuRef}>
                                    <button className={`btn-icon${menuOpen ? ' active' : ''}`} onClick={() => setMenuOpen(!menuOpen)}>
                                        <Settings size={14} />
                                    </button>
                                    {menuOpen && (
                                        <div className="settings-menu">
                                            <button className="settings-menu-item" onClick={() => { setSavingPreset(true); setMenuOpen(false); }}>
                                                <Save size={14} /> Save Current…
                                            </button>
                                            <button className="settings-menu-item" onClick={() => { applyPreset('Default'); setMenuOpen(false); }}>
                                                <Download size={14} /> Load Default
                                            </button>
                                            {customPresetNames.length > 0 && (
                                                <>
                                                    <div className="menu-divider" />
                                                    {customPresetNames.map(n => (
                                                        <button key={n} className="settings-menu-item danger" onClick={() => deletePreset(n)}>
                                                            <Trash2 size={14} /> Delete "{n}"
                                                        </button>
                                                    ))}
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* ── Max Photos ──────────────────────────────────────────── */}
                <div className="setting-row">
                    <label>Max Photos Per Batch:</label>
                    <input
                        type="number"
                        value={settings.maxPhotos}
                        onChange={e => handleSettingChange('maxPhotos', e.target.value)}
                        min={10}
                        max={10000}
                    />
                </div>

                {/* ── Folder Name ─────────────────────────────────────────── */}
                <div className="setting-row">
                    <label>Folder Name:</label>
                    <div className="folder-name-wrapper">
                        <input
                            type="text"
                            value={settings.folderName}
                            onChange={e => handleSettingChange('folderName', e.target.value)}
                        />
                        {hasForbidden ? (
                            <span className="setting-hint text-warning">Contains forbidden characters</span>
                        ) : (
                            <span className="setting-hint">Preview: {namePreview}</span>
                        )}
                    </div>
                </div>

                {/* ── Sort Order ──────────────────────────────────────────── */}
                <div className="setting-row">
                    <label><ArrowDownAZ size={14} className="icon-inline" /> Sort Photos By:</label>
                    <CustomSelect
                        value={settings.sortBy}
                        options={SORT_OPTIONS}
                        onChange={v => handleSettingChange('sortBy', v)}
                    />
                </div>

                {/* ── Blur Detection ─────────────────────────────────────── */}
                <div className="setting-row">
                    <label><ScanEye size={14} className="icon-inline" /> Detect Blurry Photos:</label>
                    <ToggleSwitch
                        checked={settings.blurEnabled}
                        onChange={() => handleSettingChange('blurEnabled', !settings.blurEnabled)}
                    />
                </div>

                {settings.blurEnabled && (
                    <div className="setting-row blur-sensitivity-row">
                        <label>Sensitivity:</label>
                        <button className="change-sensitivity-btn" onClick={() => setShowSensitivityModal(true)}>
                            <span style={{ textTransform: 'capitalize' }}>{settings.sensitivity}</span>
                            <ChevronDown size={12} />
                        </button>
                    </div>
                )}

                {/* ── Batch Mode ──────────────────────────────────────────── */}
                <div className="setting-row">
                    <label>Batch Mode:</label>
                    <div className="mode-buttons">
                        <button className={`mode-btn${settings.batchMode === 'move' ? ' active' : ''}`} onClick={() => handleSettingChange('batchMode', 'move')}>
                            <Zap size={16} /> Move (Fast)
                        </button>
                        <button className={`mode-btn${settings.batchMode === 'copy' ? ' active' : ''}`} onClick={() => handleSettingChange('batchMode', 'copy')}>
                            <Copy size={16} /> Copy (Safe)
                        </button>
                    </div>
                </div>
                <p className="mode-note">
                    {settings.batchMode === 'move'
                        ? <><Zap size={12} className="icon-inline" /> Files will be moved instantly (same drive). Close Explorer windows for best speed.</>
                        : <><Copy size={12} className="icon-inline" /> Files will be copied. Originals will remain untouched.</>}
                </p>
            </div>

            {/* ─── Blur Sensitivity Modal ───────────────────────────────── */}
            {showSensitivityModal && (
                <div className="modal-overlay" onClick={() => setShowSensitivityModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-icon"><ScanEye size={32} /></div>
                        <h3>Blur Detection Sensitivity</h3>
                        <p>Choose how aggressively blurry photos are detected.</p>

                        <div className="sensitivity-options">
                            {SENSITIVITY_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    className={`sensitivity-card${settings.sensitivity === opt.value ? ' selected' : ''}`}
                                    onClick={() => {
                                        handleSettingChange('sensitivity', opt.value);
                                        setShowSensitivityModal(false);
                                    }}
                                >
                                    <div className="sensitivity-radio">
                                        <div className="sensitivity-radio-dot" />
                                    </div>
                                    <div>
                                        <span className="sensitivity-card-label">{opt.label}</span>
                                        <span className="sensitivity-card-desc">{opt.desc}</span>
                                    </div>
                                </button>
                            ))}
                        </div>

                        <div className="modal-buttons">
                            <button className="btn secondary" onClick={() => setShowSensitivityModal(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default SimulatorSettings;