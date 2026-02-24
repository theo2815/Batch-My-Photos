import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView } from 'framer-motion'
import { useTheme } from '../context/ThemeContext'
import { Zap, FolderOpen, Folder, Settings, ScanEye, CheckCircle, Copy, ArrowDownAZ, Trash2, Save, Info, Package, ChevronRight, ChevronDown, XCircle, RotateCcw, Undo2, History, ArrowLeft, Grid3x3, List, Play, Layers, Eye, Droplets, Lock, Sparkles, Camera, Upload, WifiOff, ShieldCheck, SlidersHorizontal, Heart, Monitor, ArrowRight, ArrowUp, Download } from 'lucide-react'
import VerticalTimeline from '../components/VerticalTimeline'
import Footer from '../components/Footer'

// Interactive Mock Components
const MockSettingsPanel = () => {
  const [maxPhotos, setMaxPhotos] = useState("500");
  const [folderName, setFolderName] = useState("Sample photos");
  const [blurEnabled, setBlurEnabled] = useState(false);
  const [batchMode, setBatchMode] = useState("move");
  const [sensitivity, setSensitivity] = useState("moderate");
  const [showSensitivityModal, setShowSensitivityModal] = useState(false);
  const [preset, setPreset] = useState("Running preset");
  const [isPresetOpen, setIsPresetOpen] = useState(false);

  return (
    <div className="w-full h-full bg-[#2d2d2d] rounded-xl border border-[rgba(255,255,255,0.05)] p-6 font-sans text-sm flex flex-col shadow-2xl relative overflow-hidden">
        {/* Settings Header */}
        <div className="flex items-center text-text-secondary mb-6">
            <Settings className="w-4 h-4 mr-2" />
            <span className="font-semibold text-base text-slate-200">Settings</span>
        </div>

        <div className="space-y-5 flex-1 z-10">
            {/* Presets */}
            <div className="flex items-center justify-between group relative">
                <div className="flex items-center text-[#a1a1aa]">
                    <span>Presets:</span>
                    <Info className="w-3 h-3 ml-1 text-text-muted cursor-help" />
                </div>
                <div
                    className="flex-1 ml-4 bg-[#383838] hover:bg-[#1e1e1e] rounded p-2 flex justify-between items-center text-slate-200 cursor-pointer transition-colors border border-transparent hover:border-[#3b82f6]"
                    onClick={() => setIsPresetOpen(!isPresetOpen)}
                >
                    <span>{preset}</span>
                    <Settings className="w-3 h-3 text-text-muted" />
                </div>
                {/* Preset Dropdown Mock */}
                {isPresetOpen && (
                    <div className="absolute top-full right-0 mt-1 w-48 bg-[#383838] border border-[rgba(255,255,255,0.05)] rounded-md shadow-xl overflow-hidden z-50">
                        {['Default', 'Running preset', 'Sports Mode', 'Portraits'].map(p => (
                            <div
                                key={p}
                                className="px-3 py-2 hover:bg-[#1e1e1e] text-text-secondary cursor-pointer"
                                onClick={() => { setPreset(p); setIsPresetOpen(false); }}
                            >
                                {p}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Max Photos */}
            <div className="flex items-center justify-between">
                <span className="text-[#a1a1aa]">Max Photos Per Batch:</span>
                <input
                    type="text"
                    value={maxPhotos}
                    onChange={(e) => setMaxPhotos(e.target.value)}
                    className="bg-[#383838] rounded px-3 py-1.5 text-slate-200 w-24 text-right border border-transparent focus:border-[#3b82f6] focus:outline-none transition-colors"
                />
            </div>

            {/* Folder Name */}
             <div className="flex items-center justify-between">
                <span className="text-[#a1a1aa]">Folder Name:</span>
                <div className="relative">
                    <input
                        type="text"
                        value={folderName}
                        onChange={(e) => setFolderName(e.target.value)}
                        className="bg-[#383838] rounded px-3 py-1.5 text-slate-200 w-48 text-right border border-transparent focus:border-[#3b82f6] focus:outline-none transition-colors"
                    />
                </div>
            </div>

             {/* Sort */}
             <div className="flex items-center justify-between">
                <div className="flex items-center text-[#a1a1aa]">
                    <ArrowDownAZ className="w-4 h-4 mr-2" /> Sort Photos By:
                </div>
                <select className="bg-[#383838] rounded px-2 py-1.5 text-slate-200 w-48 text-right border border-transparent focus:border-[#3b82f6] focus:outline-none appearance-none cursor-pointer">
                    <option>Date (Oldest First)</option>
                    <option>Date (Newest First)</option>
                    <option>Name (A-Z)</option>
                </select>
            </div>

            {/* Detect Blur */}
            <div className="flex flex-col space-y-3 pt-2 hidden">
                <div className="flex items-center justify-between">
                    <div className="flex items-center text-[#a1a1aa]">
                        <ScanEye className="w-4 h-4 mr-2" /> Detect Blurry Photos:
                    </div>
                    {/* IOS Toggle Switch */}
                    <div
                        className={`w-13 h-6.5 rounded-full relative cursor-pointer transition-all duration-200 ease-in-out ${blurEnabled ? 'bg-linear-to-r from-[#f59e0b] to-[#d97706]' : 'bg-[#383838] border border-[rgba(255,255,255,0.1)]'}`}
                        onClick={() => setBlurEnabled(!blurEnabled)}
                    >
                         <div
                            className={`absolute top-0.75 w-5 h-5 rounded-full shadow-sm transition-all duration-200 ease-in-out ${blurEnabled ? 'translate-x-6.5 left-px bg-white' : 'translate-x-0 left-0.5 bg-[#a1a1aa]'}`}
                        ></div>
                        <span className={`absolute top-1/2 -translate-y-1/2 text-[0.6rem] font-semibold uppercase select-none ${blurEnabled ? 'left-1.75 text-white opacity-100' : 'left-1.75 opacity-0'}`}>On</span>
                        <span className={`absolute top-1/2 -translate-y-1/2 text-[0.6rem] font-semibold uppercase select-none ${blurEnabled ? 'right-1.5 opacity-0' : 'right-1.5 text-[#71717a] opacity-100'}`}>Off</span>
                    </div>
                </div>

                {/* Conditional Sensitivity */}
                {blurEnabled && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="flex items-center justify-between pl-6"
                    >
                        <span className="text-[#a1a1aa] text-xs">Sensitivity:</span>
                        <button
                            className="flex items-center justify-between w-full max-w-55 bg-[#383838] border border-[rgba(255,255,255,0.1)] hover:border-[#3b82f6] rounded-md px-3 py-1.5 transition-colors group"
                            onClick={() => setShowSensitivityModal(true)}
                        >
                            <span className="text-sm text-slate-200 font-medium capitalize">{sensitivity}</span>
                            <ChevronDown className="w-3 h-3 text-text-muted group-hover:text-[#3b82f6]" />
                        </button>
                    </motion.div>
                )}
            </div>

            {/* Sensitivity Modal Overlay */}
            {showSensitivityModal && (
                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center fade-in">
                    <div className="bg-[#2d2d2d] border border-[rgba(255,255,255,0.1)] p-6 rounded-xl w-72 shadow-2xl text-center">
                        <ScanEye className="w-8 h-8 mx-auto mb-3 text-[#3b82f6]" />
                        <h4 className="text-slate-200 font-semibold text-lg mb-1">Blur Detection Sensitivity</h4>
                        <p className="text-text-secondary text-xs mb-4">Choose how aggressively blurry photos are detected.</p>
                        <div className="space-y-2 text-left">
                            {[
                                { val: 'strict', desc: 'Catches most blurry photos.' },
                                { val: 'moderate', desc: 'Balanced detection. Recommended.' },
                                { val: 'lenient', desc: 'Only flags obviously blurry photos.' }
                            ].map((s) => (
                                <button
                                    key={s.val}
                                    onClick={() => { setSensitivity(s.val); setShowSensitivityModal(false); }}
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors border-2 ${sensitivity === s.val ? 'border-[#3b82f6] bg-[rgba(59,130,246,0.1)]' : 'border-transparent bg-[#383838] hover:border-[rgba(255,255,255,0.1)]'}`}
                                >
                                    <div className={`w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center shrink-0 ${sensitivity === s.val ? 'border-[#3b82f6]' : 'border-[#71717a]'}`}>
                                        {sensitivity === s.val && <div className="w-2 h-2 rounded-full bg-[#3b82f6]" />}
                                    </div>
                                    <div>
                                        <span className="text-sm text-slate-200 font-semibold capitalize block">{s.val}</span>
                                        <span className="text-[11px] text-[#71717a]">{s.desc}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

        </div>

         {/* Footer Buttons */}
         <div className="mt-4 pt-4 border-t border-[rgba(255,255,255,0.05)] z-10">
             <div className="flex items-center justify-between mb-2">
                 <span className="text-[#a1a1aa]">Batch Mode:</span>
                 <div className="flex space-x-2">
                     <button
                        className={`px-4 py-2 rounded text-xs font-medium flex items-center gap-1 transition-all border-2 ${batchMode === 'move' ? 'bg-[#3b82f6] border-[#3b82f6] text-white shadow-lg shadow-blue-500/20' : 'bg-[#383838] border-transparent text-[#a1a1aa] hover:bg-[#1e1e1e] hover:text-white'}`}
                        onClick={() => setBatchMode('move')}
                     >
                        <Zap className="w-3 h-3" /> Move (Fast)
                     </button>
                     <button
                        className={`px-4 py-2 rounded text-xs font-medium flex items-center gap-1 transition-all border-2 ${batchMode === 'copy' ? 'bg-[#3b82f6] border-[#3b82f6] text-white shadow-lg shadow-blue-500/20' : 'bg-[#383838] border-transparent text-[#a1a1aa] hover:bg-[#1e1e1e] hover:text-white'}`}
                        onClick={() => setBatchMode('copy')}
                     >
                        <Copy className="w-3 h-3" /> Copy (Safe)
                     </button>
                 </div>
             </div>
             <p className="text-[10px] text-text-muted italic mt-2 flex items-center">
                 {batchMode === 'move' ? (
                     <><Zap className="w-3 h-3 mr-1 text-yellow-500" /> Files will be moved instantly (same drive).</>
                 ) : (
                     <><Copy className="w-3 h-3 mr-1 text-blue-400" /> Files will be copied. Originals remain safe.</>
                 )}
             </p>
         </div>
    </div>
  );
};

const MockWindow = ({ children, title }) => (
    <div className="w-full h-full bg-bg-surface flex flex-col font-sans">
        <div className="h-8 bg-slate-800 flex items-center px-4 space-x-2 border-b border-slate-700">
            <div className="w-3 h-3 rounded-full bg-red-500"/>
            <div className="w-3 h-3 rounded-full bg-yellow-500"/>
            <div className="w-3 h-3 rounded-full bg-green-500"/>
            <span className="ml-4 text-xs text-text-secondary font-medium">{title}</span>
        </div>
        <div className="flex-1 p-6 overflow-hidden relative">
            {children}
        </div>
    </div>
)

// ─── Simple hash for deterministic thumbnail gradients ──────────────────
const simpleHash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0; return Math.abs(h); };
const thumbGradient = (name) => {
    const h = simpleHash(name);
    const a = (h % 360), b = ((h >> 4) + 120) % 360, angle = (h % 4) * 45 + 90;
    return `linear-gradient(${angle}deg, hsl(${a},55%,25%), hsl(${b},60%,35%))`;
};

// ─── Generate mock batch data for landing page ──────────────────────────
const MOCK_BATCHES = Array.from({ length: 11 }, (_, i) => {
    const num = String(i + 1).padStart(3, '0');
    const isLast = i === 10;
    const photoCount = isLast ? 235 : 500;
    return {
        id: i,
        name: `Sample photos_${num}`,
        count: photoCount,
        files: Array.from({ length: photoCount }, (_, j) => {
            const fileNum = String(i * 500 + j + 1).padStart(4, '0');
            return `IMG_${fileNum}.jpg`;
        }),
    };
});

// ─── Interactive Batch Accordion Item ───────────────────────────────────
const INITIAL_FILES = 6;
const LOAD_MORE_FILES = 8;

const MockBatchItem = ({ batch }) => {
    const [expanded, setExpanded] = useState(false);
    const [filesShown, setFilesShown] = useState(INITIAL_FILES);

    const visibleFiles = batch.files.slice(0, filesShown);
    const remaining = batch.files.length - filesShown;

    return (
        <div className="rounded overflow-hidden">
            <button
                className={`w-full px-3 py-2.5 flex justify-between items-center cursor-pointer transition-colors text-left font-sans ${expanded ? 'bg-[#3b82f6]' : 'bg-[#383838] hover:bg-[#3b82f6] group'}`}
                onClick={() => setExpanded(!expanded)}
            >
                <span className={`font-semibold text-sm font-mono ${expanded ? 'text-white' : 'text-slate-200'}`}>{batch.name}</span>
                <div className="flex items-center gap-2">
                    <span className={`text-xs ${expanded ? 'text-blue-100' : 'text-[#a1a1aa] group-hover:text-blue-100'}`}>{batch.count} photos</span>
                    {expanded
                        ? <ChevronDown className="w-3 h-3 text-blue-100" />
                        : <ChevronRight className={`w-3 h-3 ${expanded ? '' : 'text-[#a1a1aa] group-hover:text-blue-100'}`} />
                    }
                </div>
            </button>

            {expanded && (
                <div className="bg-[rgba(0,0,0,0.2)] border-t border-[rgba(255,255,255,0.05)] p-2 space-y-0.5 max-h-56 overflow-y-auto">
                    {visibleFiles.map((name, i) => (
                        <div key={i} className="flex items-center gap-2 py-1 text-[#a1a1aa] font-mono text-xs">
                            <div
                                className="w-8 h-8 rounded shrink-0"
                                style={{ background: thumbGradient(name) }}
                            />
                            <span className="truncate">{name}</span>
                        </div>
                    ))}
                    {remaining > 0 && (
                        <button
                            className="w-full flex items-center justify-center gap-2 py-2 mt-1 bg-[#383838] border border-dashed border-[rgba(255,255,255,0.1)] rounded text-[#a1a1aa] text-xs hover:bg-[#3b82f6] hover:border-[#3b82f6] hover:text-white transition-colors cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); setFilesShown(prev => prev + LOAD_MORE_FILES); }}
                        >
                            Show {Math.min(remaining, LOAD_MORE_FILES)} more files ({remaining} remaining)
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

// ─── Interactive Batch Preview Panel ────────────────────────────────────
const INITIAL_BATCHES = 5;
const LOAD_MORE_BATCHES = 5;

const MockBatchPreview = () => {
    const [batchesShown, setBatchesShown] = useState(INITIAL_BATCHES);

    const visibleBatches = MOCK_BATCHES.slice(0, batchesShown);
    const remainingBatches = MOCK_BATCHES.length - batchesShown;

    return (
        <div className="w-full h-full bg-[#2d2d2d] rounded-lg p-5 font-sans flex flex-col overflow-hidden">
            {/* Header — matching desktop BatchPreview h3 */}
            <div className="flex items-center text-[#a1a1aa] mb-4">
                <Package className="w-4 h-4 mr-2" />
                <span className="font-semibold text-base">Batch Preview</span>
            </div>

            {/* Batch List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {visibleBatches.map(batch => (
                    <MockBatchItem key={batch.id} batch={batch} />
                ))}
                {remainingBatches > 0 && (
                    <button
                        className="w-full flex items-center justify-center gap-2 py-2 mt-1 bg-[#383838] border border-dashed border-[rgba(255,255,255,0.1)] rounded text-[#a1a1aa] text-xs hover:bg-[#3b82f6] hover:border-[#3b82f6] hover:text-white transition-colors cursor-pointer"
                        onClick={() => setBatchesShown(prev => prev + LOAD_MORE_BATCHES)}
                    >
                        <ChevronDown className="w-3 h-3" /> Load {Math.min(remainingBatches, LOAD_MORE_BATCHES)} more batches ({remainingBatches} remaining)
                    </button>
                )}
            </div>
        </div>
    );
};

// ─── Interactive Mock File Explorer for Step 6 ──────────────────────────
const EXPLORER_BATCHES = Array.from({ length: 11 }, (_, i) => {
    const num = String(i + 1).padStart(3, '0');
    const isLast = i === 10;
    const count = isLast ? 235 : 500;
    return {
        id: i,
        name: `Sample photos_${num}`,
        count,
        files: Array.from({ length: Math.min(count, 50) }, (_, j) => {
            const fNum = String(i * 500 + j + 1).padStart(4, '0');
            const sizes = [3.2, 4.1, 2.8, 5.6, 3.9];
            const dims = ['6000×4000', '4032×3024', '5472×3648', '3840×2160'];
            return {
                name: `IMG_${fNum}.jpg`,
                size: `${sizes[j % sizes.length]} MB`,
                dimensions: dims[j % dims.length],
                date: `Jan ${(j % 28) + 1}, 2025`,
            };
        }),
    };
});

const EXPLORER_FILES_PER_PAGE = 18;

const MockFileExplorer = () => {
    const [currentBatch, setCurrentBatch] = useState(null);
    const [viewMode, setViewMode] = useState('grid');
    const [filesShown, setFilesShown] = useState(EXPLORER_FILES_PER_PAGE);

    const goToRoot = () => { setCurrentBatch(null); setFilesShown(EXPLORER_FILES_PER_PAGE); };
    const openFolder = (b) => { setCurrentBatch(b); setFilesShown(EXPLORER_FILES_PER_PAGE); };

    const visibleFiles = currentBatch ? currentBatch.files.slice(0, filesShown) : [];
    const remaining = currentBatch ? currentBatch.files.length - filesShown : 0;

    return (
        <div className="w-full h-full bg-[#1a1a1a] rounded-lg flex flex-col font-sans overflow-hidden">
            {/* ── Title Bar ── */}
            <div className="h-8 bg-[#27272a] flex items-center justify-between px-3 border-b border-[rgba(255,255,255,0.06)] shrink-0">
                <div className="flex items-center gap-2">
                    <Folder className="w-3.5 h-3.5 text-[#fbbf24]" />
                    <span className="text-xs text-text-secondary font-medium truncate">
                        {currentBatch ? currentBatch.name : 'Sample photos'}
                    </span>
                </div>
                <button className="text-text-muted hover:text-white transition-colors" onClick={goToRoot}>
                    <XCircle className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* ── Toolbar ── */}
            <div className="h-9 bg-[#27272a] flex items-center gap-2 px-3 border-b border-[rgba(255,255,255,0.06)] shrink-0">
                <button
                    className={`p-1 rounded transition-colors ${currentBatch ? 'text-text-secondary hover:text-white hover:bg-[#383838]' : 'text-slate-700 cursor-default'}`}
                    onClick={goToRoot}
                    disabled={!currentBatch}
                >
                    <ArrowLeft className="w-4 h-4" />
                </button>

                {/* Breadcrumb */}
                <div className="flex items-center gap-1 text-xs flex-1 min-w-0">
                    <button className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${!currentBatch ? 'text-white bg-[#383838]' : 'text-text-secondary hover:text-white hover:bg-[#383838]'}`} onClick={goToRoot}>
                        <Folder className="w-3 h-3 text-[#fbbf24]" /> Sample photos
                    </button>
                    {currentBatch && (
                        <>
                            <ChevronRight className="w-3 h-3 text-text-muted shrink-0" />
                            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-white bg-[#383838]">
                                <FolderOpen className="w-3 h-3 text-[#fbbf24]" /> {currentBatch.name}
                            </span>
                        </>
                    )}
                </div>

                {/* View toggle */}
                <div className="flex gap-0.5">
                    <button
                        className={`p-1 rounded transition-colors ${viewMode === 'grid' ? 'text-white bg-[#383838]' : 'text-text-muted hover:text-white'}`}
                        onClick={() => setViewMode('grid')}
                    >
                        <Grid3x3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                        className={`p-1 rounded transition-colors ${viewMode === 'list' ? 'text-white bg-[#383838]' : 'text-text-muted hover:text-white'}`}
                        onClick={() => setViewMode('list')}
                    >
                        <List className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* ── Content Area ── */}
            <div className="flex-1 overflow-y-auto p-3">
                {!currentBatch ? (
                    /* Root: Folder Grid */
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-2">
                        {EXPLORER_BATCHES.map(b => (
                            <button
                                key={b.id}
                                className="flex flex-col items-center gap-1 p-3 rounded-lg hover:bg-[rgba(255,255,255,0.04)] transition-colors cursor-pointer group"
                                onClick={() => openFolder(b)}
                            >
                                <Folder className="w-10 h-10 text-[#fbbf24] group-hover:scale-105 transition-transform" />
                                <span className="text-[11px] text-text-secondary text-center leading-tight truncate w-full">{b.name}</span>
                                <span className="text-[10px] text-text-muted">{b.count} photos</span>
                            </button>
                        ))}
                    </div>
                ) : viewMode === 'grid' ? (
                    /* File Grid */
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2">
                        {visibleFiles.map((f, i) => (
                            <div key={i} className="flex flex-col items-center gap-1 cursor-pointer group">
                                <div
                                    className="w-full aspect-[4/3] rounded group-hover:ring-2 ring-[#3b82f6] transition-all"
                                    style={{ background: thumbGradient(f.name) }}
                                />
                                <span className="text-[10px] text-text-secondary truncate w-full text-center">{f.name}</span>
                            </div>
                        ))}
                        {remaining > 0 && (
                            <button
                                className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg border border-dashed border-[rgba(255,255,255,0.1)] text-text-muted hover:text-white hover:border-[#3b82f6] transition-colors cursor-pointer aspect-[4/3]"
                                onClick={() => setFilesShown(p => p + EXPLORER_FILES_PER_PAGE)}
                            >
                                <span className="text-[10px]">+{remaining} more</span>
                            </button>
                        )}
                    </div>
                ) : (
                    /* File List */
                    <div className="space-y-0">
                        <div className="grid grid-cols-[24px_1fr_60px_70px_80px] gap-2 px-2 py-1 text-[10px] text-text-muted font-semibold uppercase tracking-wider border-b border-[rgba(255,255,255,0.06)]">
                            <span /><span>Name</span><span>Size</span><span>Dims</span><span>Date</span>
                        </div>
                        {visibleFiles.map((f, i) => (
                            <div key={i} className="grid grid-cols-[24px_1fr_60px_70px_80px] gap-2 px-2 py-1.5 items-center hover:bg-[rgba(255,255,255,0.03)] rounded cursor-pointer group">
                                <div className="w-5 h-4 rounded-sm" style={{ background: thumbGradient(f.name) }} />
                                <span className="text-[11px] text-text-secondary truncate">{f.name}</span>
                                <span className="text-[10px] text-text-muted font-mono">{f.size}</span>
                                <span className="text-[10px] text-text-muted font-mono">{f.dimensions}</span>
                                <span className="text-[10px] text-text-muted font-mono">{f.date}</span>
                            </div>
                        ))}
                        {remaining > 0 && (
                            <button
                                className="w-full py-2 mt-1 text-[11px] text-text-muted hover:text-white hover:bg-[rgba(255,255,255,0.04)] rounded transition-colors cursor-pointer"
                                onClick={() => setFilesShown(p => p + EXPLORER_FILES_PER_PAGE)}
                            >
                                Load {Math.min(remaining, EXPLORER_FILES_PER_PAGE)} more ({remaining} remaining)
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* ── Status Bar ── */}
            <div className="h-7 bg-[#27272a] flex items-center justify-between px-3 border-t border-[rgba(255,255,255,0.06)] shrink-0">
                <span className="text-[10px] text-text-muted">
                    {currentBatch ? `${currentBatch.count} items` : `${EXPLORER_BATCHES.length} folders`}
                </span>
                <span className="text-[10px] text-text-muted">
                    {currentBatch ? `${(currentBatch.count * 3.8).toFixed(1)} MB` : '20.0 GB'}
                </span>
            </div>
        </div>
    );
};

// ─── FAQ Accordion ──────────────────────────────────────────────────────
const FAQ_ITEMS = [
  {
    q: "Are my photos uploaded anywhere?",
    a: "No. Everything runs locally on your machine. Your files never leave your computer, there is no uploads, no cloud processing, and no third-party access. Ever.",
  },
  {
    q: "How accurate is the live demo compared to the real app?",
    a: "This live demo follows the same workflow and logic as the desktop app, but uses sample data instead of real photos. It’s meant to give you a feel for how everything works. For the best experience with your own files, we recommend downloading the desktop app."
  },
  {
    q: "Can it handle very large folders (10,000+ photos)?",
    a: "Yes. The app is designed for real-world workloads of 5,000 to 20,000+ photos. It processes files directly on your file system, so performance scales with your hardware not a server.",
  },
  {
    q: "What if I don't like the result? Can I undo?",
    a: "Absolutely. Every batch operation is fully reversible. Hit Undo and your files go right back to where they were. You can also re-batch with different settings as many times as you need.",
  },
  {
    q: "Where can I upload my batches after processing?",
    a: "Anywhere. Once your photos are sorted into folders, you can upload them to Google Photos, Dropbox, WeTransfer, social media, any platform that accepts standard files and folders.",
  },
  {
    q: "Is it safe? Will it corrupt or delete my photos?",
    a: "Your photos are never modified. The app only moves or copies files into new folders. You can choose Copy mode to keep originals untouched, and Undo is always one click away.",
  },
  {
    q: "What if the app crashes or I accidentally close it?",
    a: "No worries, your progress is saved automatically. If the app closes, you can resume right where you left off. Files already processed stay in their folders, and Undo still works after a restart.",
  },
  {
    q: "Is it really free?",
    a: "Yes! The app is completely free. You can use it with any folder and process up to a limited number of photos per batch. Upgrade to the Pro plan for unlimited batches and full access to all features.",
  },
];

const FaqItem = ({ item, isOpen, onToggle }) => {
  const { isDark } = useTheme()
  return (
  <div className={`border-b ${isDark ? 'border-white/[0.06]' : 'border-gray-200'}`}>
    <button
      className="w-full flex items-center justify-between py-5 text-left cursor-pointer group"
      onClick={onToggle}
    >
      <span className={`text-base font-medium transition-colors ${isOpen ? (isDark ? 'text-white' : 'text-text-primary-light') : isDark ? 'text-text-secondary group-hover:text-white' : 'text-text-secondary-light group-hover:text-text-primary-light'}`}>
        {item.q}
      </span>
      <ChevronDown
        className={`w-5 h-5 shrink-0 ml-4 transition-all duration-300 ${isOpen ? 'rotate-180 text-accent' : isDark ? 'text-text-muted group-hover:text-text-secondary' : 'text-gray-400 group-hover:text-gray-500'}`}
      />
    </button>
    <div
      className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-40 pb-5' : 'max-h-0'}`}
    >
      <p className={`text-sm ${isDark ? 'text-text-secondary' : 'text-text-secondary-light'} leading-relaxed pr-10`}>{item.a}</p>
    </div>
  </div>
  )
};

const FaqAccordion = () => {
  const [openIndex, setOpenIndex] = useState(null);

  return (
    <div className="divide-y-0">
      {FAQ_ITEMS.map((item, i) => (
        <FaqItem
          key={i}
          item={item}
          isOpen={openIndex === i}
          onToggle={() => setOpenIndex(openIndex === i ? null : i)}
        />
      ))}
    </div>
  );
};

// ─── Scroll-to-top button ───────────────────────────────────────────────────
const ScrollToTop = () => {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Back to top"
      className={`fixed bottom-6 right-6 z-50 w-11 h-11 rounded-full bg-primary hover:bg-primary-hover text-white shadow-lg shadow-primary/25 hover:shadow-primary/40 flex items-center justify-center transition-all duration-300 cursor-pointer ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
    >
      <ArrowUp className="w-5 h-5" />
    </button>
  )
}

// ─── Animated Counter (counts up on scroll into view) ───────────────────────
const AnimatedCounter = ({ target, suffix = '', prefix = '', duration = 1.8 }) => {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, amount: 0.5 })
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!isInView) return
    let startTime = performance.now()
    let animationFrameId
    const step = (now) => {
      const progress = Math.min((now - startTime) / (duration * 1000), 1)
      const eased = 1 - Math.pow(1 - progress, 3) // easeOutCubic
      setCount(Math.floor(eased * target))
      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step)
      }
    }
    animationFrameId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(animationFrameId)
  }, [isInView, target, duration])

  return (
    <span ref={ref}>
      {prefix}{count.toLocaleString()}{suffix}
    </span>
  )
}

// ─── Section Reveal wrapper (scroll-triggered fade-up) ──────────────────────
const SectionReveal = ({ children, className = '', delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 30 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, amount: 0.15 }}
    transition={{ duration: 0.6, ease: 'easeOut', delay }}
    className={className}
  >
    {children}
  </motion.div>
)

export default function LandingPage() {
  const { isDark } = useTheme()
  return (
    <div className={`relative ${isDark ? 'bg-bg-main' : 'bg-bg-main-light'}`}>
      {/* ── Page-wide Mesh Gradient Background ── */}
      <div className="hero-mesh" aria-hidden="true">
        <div className="hero-mesh-blob" />
        <div className="hero-mesh-blob" />
        <div className="hero-mesh-blob" />
        <div className="hero-mesh-blob" />
        <div className="hero-mesh-blob" />
        <div className="hero-mesh-blob" />
        <div className="hero-mesh-blob" />
        <div className="hero-mesh-blob" />
        <div className="hero-mesh-blob" />
        <div className="hero-mesh-blob" />
        <div className="hero-mesh-blob" />
      </div>
      {/* ── Page-wide Floating Particles (rise from bottom to top) ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 1 }} aria-hidden="true">
        {Array.from({ length: 35 }).map((_, i) => (
          <div
            key={i}
            className="hero-particle"
            style={{
              width: `${2.5 + (i % 4) * 1.5}px`,
              height: `${2.5 + (i % 4) * 1.5}px`,
              left: `${1 + (i * 2.85) % 97}%`,
              bottom: `${(i * 2.5) % 40}%`,
              animation: `particleDrift ${14 + (i % 8) * 2}s ease-in-out ${(i * 0.8) % 10}s infinite`,
            }}
          />
        ))}
      </div>

      {/* Hero Section */}
      <div className="relative isolate overflow-hidden" style={{ zIndex: 2 }}>
        <div className={`absolute inset-0 ${isDark ? 'bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(46,91,255,0.08),transparent)]' : 'bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(46,91,255,0.04),transparent)]'}`} />

        <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="mx-auto max-w-3xl pt-32 sm:pt-44 lg:pt-52 pb-24 sm:pb-32 text-center"
          >

            {/* Badge */}
            <div className={`inline-flex items-center gap-2 rounded-full border ${isDark ? 'border-primary/20 bg-primary/10' : 'border-primary/20 bg-primary/5'} px-4 py-1.5 mb-8`}>
              <Zap className="w-3.5 h-3.5 text-accent" />
              <span className={`text-xs font-semibold tracking-wide ${isDark ? 'text-accent' : 'text-primary'}`}>100% local · No uploads · No cloud</span>
            </div>

            {/* Headline */}
            <h1 className={`text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-gray-900'} leading-[1.1]`}>
              BatchMyPhotos — Sort thousands of photos{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#2E5BFF] to-[#00D1FF]">in seconds.</span>
            </h1>

            {/* Sub-headline */}
            <p className={`mt-6 text-lg sm:text-xl leading-8 ${isDark ? 'text-text-secondary' : 'text-text-secondary-light'} max-w-2xl mx-auto`}>
              Drag a folder in, tweak your settings, and let Batch My Photos organize everything into clean, labeled batches right on your machine.
            </p>

            {/* CTA buttons */}
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="/demo"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-2.5 px-8 py-4 rounded-xl bg-primary hover:bg-primary-hover text-white text-base font-semibold shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all"
              >
                <Play className="w-5 h-5" /> Try the Live Demo
              </a>
                <a
                  href="https://apps.microsoft.com/detail/9N1KKMV4NX4J"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center hover:-translate-y-1 transition-transform"
                  aria-label="Get it from Microsoft Store"
                >
                  {/* Official Microsoft Store Badge */}
                  <svg xmlns="http://www.w3.org/2000/svg" width="200" height="58" viewBox="0 0 200 58">
                    <defs><linearGradient id="ms-badge-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={isDark ? '#2a2a2a' : '#111'}/><stop offset="100%" stopColor={isDark ? '#1a1a1a' : '#000'}/></linearGradient></defs>
                    <rect width="200" height="58" rx="8" fill="url(#ms-badge-bg)" stroke="rgba(255,255,255,0.15)" strokeWidth="1"/>
                    <text x="68" y="22" fill="#ccc" fontSize="10" fontFamily="Segoe UI, sans-serif" fontWeight="400">Get it from</text>
                    <text x="68" y="40" fill="#fff" fontSize="16" fontFamily="Segoe UI, sans-serif" fontWeight="600">Microsoft Store</text>
                    {/* Windows logo */}
                    <g transform="translate(18,14)">
                      <rect x="0" y="0" width="13" height="13" rx="1.5" fill="#F25022"/>
                      <rect x="15" y="0" width="13" height="13" rx="1.5" fill="#7FBA00"/>
                      <rect x="0" y="15" width="13" height="13" rx="1.5" fill="#00A4EF"/>
                      <rect x="15" y="15" width="13" height="13" rx="1.5" fill="#FFB900"/>
                    </g>
                  </svg>
                </a>
              </div>

            {/* Trust indicators */}
            <div className={`mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm ${isDark ? 'text-text-muted' : 'text-text-secondary-light'}`}>
              <span className="flex items-center gap-1.5"><ShieldCheck className={`w-4 h-4 ${isDark ? 'text-text-muted' : 'text-gray-400'}`} /> Private &amp; offline</span>
              <span className={`hidden sm:inline ${isDark ? 'text-text-muted' : 'text-gray-300'}`}>·</span>
              <span className="flex items-center gap-1.5"><Undo2 className={`w-4 h-4 ${isDark ? 'text-text-muted' : 'text-gray-400'}`} /> Fully reversible</span>
              <span className={`hidden sm:inline ${isDark ? 'text-text-muted' : 'text-gray-300'}`}>·</span>
              <span className="flex items-center gap-1.5"><Zap className={`w-4 h-4 ${isDark ? 'text-text-muted' : 'text-gray-400'}`} /> Handles 20,000+ photos</span>
            </div>

            {/* Mini preview illustration */}
            <div className="mt-16 relative">
              <div className="hero-shimmer absolute -inset-4 rounded-2xl" />
              <div className={`relative rounded-2xl border ${isDark ? 'border-white/[0.08] bg-white/[0.03] backdrop-blur-sm shadow-2xl shadow-black/40' : 'border-gray-200 bg-bg-surface shadow-2xl shadow-gray-300/30'} p-6 sm:p-8`}>
                <div className="flex items-center gap-3 mb-5">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                    <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                    <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                  </div>
                  <span className="text-xs text-text-muted font-medium ml-2">BatchMyPhotos</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {['Marathon — Batch 1', 'Marathon — Batch 2', 'Marathon — Batch 3', 'Marathon — Batch 4', 'Marathon — Batch 5', 'Marathon — Batch 6'].map((name, i) => (
                    <div key={i} className="rounded-lg bg-white/[0.04] border border-white/[0.06] p-3 text-left">
                      <div className="flex items-center gap-2 mb-2">
                        <Folder className="w-4 h-4 text-accent" />
                        <span className="text-xs font-medium text-white truncate">{name}</span>
                      </div>
                      <div className="text-[11px] text-text-muted">500 photos</div>
                      <div className="mt-2 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-[#2E5BFF] to-[#00D1FF]" style={{ width: `100%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
      {/* ══ Animated Stats Counter ══ */}
      <div className={`${isDark ? 'bg-bg-main' : 'bg-bg-main-light'} border-t ${isDark ? 'border-white/[0.04]' : 'border-gray-200'}`}>
        <div className="mx-auto max-w-5xl px-6 lg:px-8 py-16 sm:py-20">
          <SectionReveal>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
              {[
                { target: 20000, suffix: '+', label: 'Photos handled per session', icon: <Layers className="w-5 h-5" /> },
                { target: 3, suffix: 's', label: 'Average batch time', icon: <Zap className="w-5 h-5" /> },
                { target: 100, suffix: '%', label: 'Offline & private', icon: <ShieldCheck className="w-5 h-5" /> },
                { target: null, label: 'Unlimited undo', icon: <Undo2 className="w-5 h-5" /> },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.5 }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="text-center group"
                >
                  <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl ${isDark ? 'bg-primary/10' : 'bg-primary/5'} mb-4 group-hover:bg-primary/20 transition-colors`}>
                    <span className="text-accent">{stat.icon}</span>
                  </div>
                  <div className={`text-3xl sm:text-4xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} mb-1`}>
                    {stat.target !== null ? (
                      <AnimatedCounter target={stat.target} suffix={stat.suffix} />
                    ) : (
                      <span>∞</span>
                    )}
                  </div>
                  <p className={`text-sm ${isDark ? 'text-text-secondary' : 'text-gray-500'}`}>{stat.label}</p>
                </motion.div>
              ))}
            </div>
          </SectionReveal>
        </div>
      </div>

      {/* Timeline Features Section */}
      <div id="features" className={`relative ${isDark ? 'bg-bg-main' : 'bg-white'} overflow-hidden`}>
        <SectionReveal className="mx-auto max-w-2xl text-center pt-24 sm:pt-32 pb-8 px-6">
          <span className="text-xs font-bold tracking-widest uppercase text-accent">How It Works</span>
          <h2 className={`mt-4 text-3xl sm:text-5xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>From folder to done in 6&nbsp;steps</h2>
          <p className={`mt-4 text-lg ${isDark ? 'text-text-secondary' : 'text-gray-500'}`}>Scroll through each step to see how Batch My Photos organizes thousands of photos effortlessly.</p>
        </SectionReveal>
        <VerticalTimeline content={content} />

        {/* ── CTA after timeline ── */}
        <div className="relative mx-auto max-w-3xl text-center px-6 pt-20 pb-32">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
            <div className="w-80 h-80 rounded-full bg-primary/10 blur-3xl" />
          </div>
          <h3 className={`relative text-3xl sm:text-4xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} mb-4`}>
            See it in action no download needed
          </h3>
          <p className={`relative text-lg ${isDark ? 'text-text-secondary' : 'text-gray-500'} mb-10 max-w-xl mx-auto`}>
            Try the full workflow right in your browser. Drag a folder, tweak settings, preview batches, and watch them process all in our interactive demo.
          </p>
          <div className="relative flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="/demo"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl bg-primary hover:bg-primary-hover text-white text-base font-semibold shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all"
            >
              <Play className="w-5 h-5" /> Try the Live Demo
            </a>
            <a
              href="https://apps.microsoft.com/detail/9N1KKMV4NX4J"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center hover:-translate-y-1 transition-transform"
              aria-label="Get it from Microsoft Store"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="200" height="58" viewBox="0 0 200 58">
                <defs><linearGradient id="ms-badge-bg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={isDark ? '#2a2a2a' : '#111'}/><stop offset="100%" stopColor={isDark ? '#1a1a1a' : '#000'}/></linearGradient></defs>
                <rect width="200" height="58" rx="8" fill="url(#ms-badge-bg2)" stroke="rgba(255,255,255,0.15)" strokeWidth="1"/>
                <text x="68" y="22" fill="#ccc" fontSize="10" fontFamily="Segoe UI, sans-serif" fontWeight="400">Get it from</text>
                <text x="68" y="40" fill="#fff" fontSize="16" fontFamily="Segoe UI, sans-serif" fontWeight="600">Microsoft Store</text>
                <g transform="translate(18,14)">
                  <rect x="0" y="0" width="13" height="13" rx="1.5" fill="#F25022"/>
                  <rect x="15" y="0" width="13" height="13" rx="1.5" fill="#7FBA00"/>
                  <rect x="0" y="15" width="13" height="13" rx="1.5" fill="#00A4EF"/>
                  <rect x="15" y="15" width="13" height="13" rx="1.5" fill="#FFB900"/>
                </g>
              </svg>
            </a>
          </div>
        </div>
      </div>

      {/* ══ Features Section ══ */}
      <div className={`${isDark ? 'bg-bg-main' : 'bg-gray-50'} border-t ${isDark ? 'border-white/[0.04]' : 'border-gray-200'}`}>
        <div className="mx-auto max-w-7xl px-6 lg:px-8 py-24 sm:py-32">

          {/* Section header */}
          <SectionReveal className="mx-auto max-w-2xl text-center mb-16">
            <span className="text-xs font-bold tracking-widest uppercase text-accent">Built for Real Workflows</span>
            <h2 className={`mt-4 text-3xl sm:text-5xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>Features that actually save you time</h2>
            <p className={`mt-4 text-lg ${isDark ? 'text-text-secondary' : 'text-gray-500'}`}>Everything you need to go from a messy photo dump to perfectly organized batches without the headache.</p>
          </SectionReveal>

          {/* Feature cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
            {[
              { icon: Layers, color: 'primary', title: 'Batch Photo Processing', desc: 'Automatically split thousands of photos into clean, manageable batches based on your limits. Set a max per folder to 500, 1000, whatever you need, and we handle the rest.' },
              { icon: Eye, color: 'amber', title: 'Blurry Photo Detection', desc: 'Flag blurry images before they waste your time. Choose strict, moderate, or lenient sensitivity to catch exactly the level of blur you care about.', badge: 'Coming Soon' },
              { icon: Droplets, color: 'cyan', title: 'Watermarking', desc: 'Apply a custom watermark to every photo in a batch, automatically. Toggle it on or off per batch — your brand, your terms, zero manual work.', badge: 'Coming Soon' },
              { icon: Sparkles, color: 'purple', title: 'More Features Coming Soon!', desc: "We're constantly improving Batch My Photos. Exciting new features are on the way — stay tuned for updates!", badge: 'Stay Tuned' },
            ].map((card, i) => {
              const Icon = card.icon
              const colorMap = { primary: 'primary', amber: 'amber-500', cyan: 'cyan-500', purple: 'purple-500' }
              const c = colorMap[card.color]
              return (
                <motion.div
                  key={card.title}
                  initial={{ opacity: 0, y: 25 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className={`group relative rounded-2xl border ${isDark ? 'border-white/[0.06] bg-white/[0.02]' : 'border-gray-200 bg-white shadow-sm'} p-8 hover:border-${c}/30 hover:-translate-y-1 hover:shadow-xl ${isDark ? 'hover:shadow-primary/5' : 'hover:shadow-gray-200/60'} transition-all duration-300`}
                >
                  <div className={`absolute -inset-px rounded-2xl bg-gradient-to-br from-${c}/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`} />
                  <div className="relative">
                    <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-${c}/10 mb-5 group-hover:bg-${c}/20 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                      <Icon className={`w-6 h-6 text-${card.color === 'primary' ? 'accent' : c.replace('-500','') + '-400'}`} />
                    </div>
                    {card.badge ? (
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{card.title}</h3>
                        <span className={`text-[10px] font-bold tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-${c}/10 text-${card.color === 'primary' ? 'accent' : c.replace('-500','') + '-400'} ring-1 ring-${c}/20`}>{card.badge}</span>
                      </div>
                    ) : (
                      <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} mb-2`}>{card.title}</h3>
                    )}
                    <p className={`${isDark ? 'text-text-secondary' : 'text-gray-500'} leading-relaxed`}>{card.desc}</p>
                  </div>
                </motion.div>
              )
            })}
          </div>

          {/* Bottom trust bar */}
          <div className={`flex flex-wrap items-center justify-center gap-x-8 gap-y-4 mt-16 pt-10 border-t ${isDark ? 'border-white/[0.04]' : 'border-gray-200'}`}>
            <div className={`flex items-center gap-2 text-sm ${isDark ? 'text-text-muted' : 'text-gray-400'}`}>
              <Lock className="w-4 h-4" /> 100% Local Processing
            </div>
            <div className={`flex items-center gap-2 text-sm ${isDark ? 'text-text-muted' : 'text-gray-400'}`}>
              <Zap className="w-4 h-4" /> No Uploads Required
            </div>
            <div className={`flex items-center gap-2 text-sm ${isDark ? 'text-text-muted' : 'text-gray-400'}`}>
              <Sparkles className="w-4 h-4" /> Free to Use
            </div>
          </div>
        </div>
      </div>


      {/* ══ Who It's For / Why It Works ══ */}
      <div className={`${isDark ? 'bg-bg-main' : 'bg-white'} border-t ${isDark ? 'border-white/[0.04]' : 'border-gray-200'}`}>
        <div className="mx-auto max-w-7xl px-6 lg:px-8 py-24 sm:py-32">

          {/* ── Two-column layout ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24">

            {/* Left: Who It's For */}
            <SectionReveal>
              <span className="text-xs font-bold tracking-widest uppercase text-accent">Who It's For</span>
              <h2 className={`mt-4 text-3xl sm:text-4xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>Built for people who deal with <em className="not-italic text-accent">way too many photos</em></h2>
              <p className={`mt-4 text-lg ${isDark ? 'text-text-secondary' : 'text-gray-500'} leading-relaxed`}>If you've ever stared at a folder with 10,000 unsorted images and thought "where do I even start?" — this is for you.</p>

              <div className="mt-10 space-y-4">
                {[
                  { icon: Camera, color: 'primary', title: 'Wedding & Event Photographers', desc: 'You shoot 5,000–20,000 photos per event. You need them split into clean, deliverable batches — fast.' },
                  { icon: Upload, color: 'amber-500', title: 'Content Creators & Social Managers', desc: 'You upload to multiple platforms with strict file limits. Split your library into ready-to-upload folders.' },
                  { icon: Heart, color: 'emerald-500', title: 'Anyone Tired of Manual Sorting', desc: "Organizing family vacations, school events, or personal archives? Those late-night sorting sessions are over." },
                  { icon: Monitor, color: 'cyan-500', title: 'Schools & Organizations', desc: 'Yearbook teams, school events, company archives — batch thousands of photos into clean deliverables for your team.' },
                ].map((persona, i) => {
                  const Icon = persona.icon
                  return (
                    <motion.div
                      key={persona.title}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, amount: 0.3 }}
                      transition={{ duration: 0.5, delay: i * 0.1 }}
                      className={`group flex gap-4 p-4 rounded-xl border ${isDark ? 'border-white/[0.04] hover:border-white/[0.1] hover:bg-white/[0.02]' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'} transition-all duration-300`}
                    >
                      <div className="shrink-0 mt-0.5">
                        <div className={`w-10 h-10 rounded-xl bg-${persona.color === 'primary' ? 'primary' : persona.color}/10 flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                          <Icon className={`w-5 h-5 text-${persona.color === 'primary' ? 'accent' : persona.color.replace('-500', '') + '-400'}`} />
                        </div>
                      </div>
                      <div>
                        <h4 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{persona.title}</h4>
                        <p className={`text-sm ${isDark ? 'text-text-secondary' : 'text-gray-500'} mt-1 leading-relaxed`}>{persona.desc}</p>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </SectionReveal>

            {/* Right: Why It Works */}
            <SectionReveal delay={0.15}>
              <span className="text-xs font-bold tracking-widest uppercase text-accent">Why It Works</span>
              <h2 className={`mt-4 text-3xl sm:text-4xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>Because it was built by someone who <em className="not-italic text-accent">actually needed it</em></h2>
              <p className={`mt-4 text-lg ${isDark ? 'text-text-secondary' : 'text-gray-500'} leading-relaxed`}>This isn't a generic file tool with a photo skin. Every feature exists because real workflows demanded it.</p>

              <div className="mt-10 space-y-4">
                {[
                  { icon: Layers, color: 'primary', title: 'Handles Real-World Scale', desc: 'Designed for 5,000 to 20,000+ photos per session. Batch sizes, folder names, and sort order — all under your control.' },
                  { icon: ShieldCheck, color: 'amber-500', title: 'Preview Before You Commit', desc: 'See exactly how your batches will look before a single file moves. No surprises.' },
                  { icon: WifiOff, color: 'emerald-500', title: '100% Offline. Your Files Stay Yours.', desc: 'Nothing gets uploaded. The app works entirely on your local file system — fast, private, always available.' },
                  { icon: SlidersHorizontal, color: 'cyan-500', title: 'Transparent & Fully In Your Control', desc: 'Every setting is visible. Every batch is previewable. Undo anything. This tool works with you.' },
                ].map((reason, i) => {
                  const Icon = reason.icon
                  return (
                    <motion.div
                      key={reason.title}
                      initial={{ opacity: 0, x: 20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, amount: 0.3 }}
                      transition={{ duration: 0.5, delay: i * 0.1 }}
                      className={`group flex gap-4 p-4 rounded-xl border ${isDark ? 'border-white/[0.04] hover:border-white/[0.1] hover:bg-white/[0.02]' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'} transition-all duration-300`}
                    >
                      <div className="shrink-0 mt-0.5">
                        <div className={`w-10 h-10 rounded-xl bg-${reason.color === 'primary' ? 'primary' : reason.color}/10 flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                          <Icon className={`w-5 h-5 text-${reason.color === 'primary' ? 'accent' : reason.color.replace('-500', '') + '-400'}`} />
                        </div>
                      </div>
                      <div>
                        <h4 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{reason.title}</h4>
                        <p className={`text-sm ${isDark ? 'text-text-secondary' : 'text-gray-500'} mt-1 leading-relaxed`}>{reason.desc}</p>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </SectionReveal>
          </div>

          {/* Bottom pull quote */}
          <SectionReveal className={`mt-20 pt-12 border-t ${isDark ? 'border-white/[0.04]' : 'border-gray-200'} text-center`}>
            <p className={`text-xl sm:text-2xl font-medium ${isDark ? 'text-white' : 'text-gray-900'} italic max-w-2xl mx-auto leading-relaxed`}>
              "I just need my photos sorted into folders. That's it."
            </p>
            <p className="mt-3 text-sm text-accent font-semibold">That's exactly what this does. Nothing more, nothing less.</p>
          </SectionReveal>
        </div>
      </div>

      {/* ══ FAQ Section ══ */}
      <div id="faq" className={`${isDark ? 'bg-bg-main' : 'bg-gray-50'} border-t ${isDark ? 'border-white/[0.04]' : 'border-gray-200'}`}>
        <div className="mx-auto max-w-3xl px-6 lg:px-8 py-24 sm:py-32">

          <SectionReveal className="text-center mb-14">
            <span className="text-xs font-bold tracking-widest uppercase text-accent">FAQ</span>
            <h2 className={`mt-4 text-3xl sm:text-4xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>Questions before you start</h2>
            <p className={`mt-3 text-base ${isDark ? 'text-text-secondary' : 'text-gray-500'}`}>Quick answers to the things most people ask first.</p>
          </SectionReveal>

          <FaqAccordion />
        </div>
      </div>

      {/* ══ Final CTA ══ */}
      <div className={`${isDark ? 'bg-bg-main' : 'bg-white'} border-t ${isDark ? 'border-white/[0.04]' : 'border-gray-200'}`}>
        <div className="mx-auto max-w-3xl px-6 lg:px-8 py-28 sm:py-36 text-center">
          <SectionReveal>

          <p className="text-sm font-semibold text-accent mb-4">Ready when you are</p>
          <h2 className={`text-3xl sm:text-4xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Your photos deserve better than manual sorting.
          </h2>
          <p className={`mt-4 text-lg ${isDark ? 'text-text-secondary' : 'text-gray-500'} max-w-xl mx-auto leading-relaxed`}>
            Batch My Photos handles the tedious part so you can get back to what matters. Try it in your browser first, no account, no install, no risk.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="/demo"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl bg-primary hover:bg-primary-hover text-white text-base font-semibold shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all"
            >
              <Play className="w-5 h-5" /> Try the Live Demo
            </a>
            <a
              href="https://apps.microsoft.com/detail/9N1KKMV4NX4J"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center hover:-translate-y-1 transition-transform"
              aria-label="Get it from Microsoft Store"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="200" height="58" viewBox="0 0 200 58">
                <defs><linearGradient id="ms-badge-bg3" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={isDark ? '#2a2a2a' : '#111'}/><stop offset="100%" stopColor={isDark ? '#1a1a1a' : '#000'}/></linearGradient></defs>
                <rect width="200" height="58" rx="8" fill="url(#ms-badge-bg3)" stroke="rgba(255,255,255,0.15)" strokeWidth="1"/>
                <text x="68" y="22" fill="#ccc" fontSize="10" fontFamily="Segoe UI, sans-serif" fontWeight="400">Get it from</text>
                <text x="68" y="40" fill="#fff" fontSize="16" fontFamily="Segoe UI, sans-serif" fontWeight="600">Microsoft Store</text>
                <g transform="translate(18,14)">
                  <rect x="0" y="0" width="13" height="13" rx="1.5" fill="#F25022"/>
                  <rect x="15" y="0" width="13" height="13" rx="1.5" fill="#7FBA00"/>
                  <rect x="0" y="15" width="13" height="13" rx="1.5" fill="#00A4EF"/>
                  <rect x="15" y="15" width="13" height="13" rx="1.5" fill="#FFB900"/>
                </g>
              </svg>
            </a>
          </div>

          <p className={`mt-8 text-sm ${isDark ? 'text-text-muted' : 'text-gray-400'}`}>Free to start · No credit card · Cancel anytime</p>
          </SectionReveal>
        </div>
      </div>

      <Footer />
      <ScrollToTop />
    </div>
  )
}



const content = [
  {
    title: "1. Drag & Drop Import",
    description:
      "Start by dragging a folder containing thousands of photos directly into the app. We instantly scan and prepare them for processing, no uploads required.",
    content: (
        <div className="w-full h-full bg-[#1e1e1e] flex items-center justify-center">
            <div className="w-full max-w-100 aspect-4/3 border-2 border-dashed border-[#71717a] rounded-xl flex items-center justify-center bg-[#2d2d2d] hover:border-[#3b82f6] hover:scale-[1.02] hover:shadow-[0_0_10px_rgba(59,130,246,0.2)] transition-all cursor-pointer relative overflow-hidden group">
                <div className="absolute inset-0 bg-linear-to-br from-[#3b82f6] to-[#2563eb] opacity-0 group-hover:opacity-10 transition-opacity" />
                <div className="text-center z-10">
                    <div className="flex justify-center mb-4 landing-float">
                        <FolderOpen className="w-16 h-16 text-[#a1a1aa]" strokeWidth={1.5} />
                    </div>
                    <p className="text-white text-xl font-semibold mb-1">Drop a Folder Here</p>
                    <p className="text-[#a1a1aa] text-sm">or click to browse</p>
                </div>
            </div>
        </div>
    ),
  },
  {
    title: "2. Smart Settings",
    description:
      "Customize your workflow. Set batch limits (e.g., 500 photos), choose output folders, and sort by 'Shot Date' to keep everything organized.",
    content: <MockSettingsPanel />,
  },
  {
    title: "3. Batch Preview",
    description:
      "Review exactly how your files will be split. Check the file counts, preview images, and ensure everything is 100% accurate before you proceed.",
    content: <MockBatchPreview />,
  },
  {
    title: "4. Creating Batches",
    description:
      "Sit back and watch the magic. We process thousands of files in seconds, moving them instantly to their new folders.",
    content: (
        <div className="w-full h-full bg-[#2d2d2d] rounded-xl flex items-center justify-center font-sans">
             <div className="text-center w-3/4">
                 {/* Box Spinner — CSS rotating cube matching desktop */}
                 <div className="flex justify-center mb-4">
                     <div className="landing-box-spinner" />
                 </div>
                 <h3 className="text-white text-xl font-bold mb-1">Creating Batches...</h3>

                 {/* 8px progress bar matching desktop */}
                 <div className="h-2 bg-[#383838] rounded overflow-hidden my-6">
                    <div className="h-full w-[82%] bg-linear-to-r from-[#3b82f6] to-[#2563eb] rounded transition-all"></div>
                 </div>

                 <p className="text-[#a1a1aa] text-sm"><strong className="text-white">9</strong> of <strong className="text-white">11</strong> folders created</p>

                 {/* Cancel button matching desktop */}
                 <button className="mt-6 px-6 py-2 bg-transparent border-2 border-[#ef4444] rounded-md text-[#ef4444] text-sm font-semibold inline-flex items-center gap-2 hover:bg-[#ef4444] hover:text-white transition-colors cursor-pointer">
                     <XCircle className="w-4 h-4" /> Cancel
                 </button>
             </div>
        </div>
    ),
  },
  {
    title: "5. Batch Complete",
    description:
      "Done! Review your summary, undo if needed, or open your folders immediately. Your photo organization is solved.",
    content: (
        <div className="w-full h-full bg-[#2d2d2d] rounded-xl flex flex-col items-center justify-center font-sans px-6 py-4">
             {/* Success icon — green, matching desktop CompleteCard */}
             <div className="mb-2">
                 <CheckCircle className="w-12 h-12 text-[#10b981]" />
             </div>
             <h3 className="text-white text-lg font-bold">Batching Complete!</h3>
             <p className="text-[#a1a1aa] text-sm mt-1 mb-3">Successfully created <strong className="text-white">11</strong> batch folders.</p>

             {/* Results Summary — matching desktop: bg-tertiary, monospace folder names */}
             <div className="w-full bg-[#383838] rounded-md p-3 mb-3 space-y-0 text-left">
                 {['Sample photos_001', 'Sample photos_002', 'Sample photos_003', 'Sample photos_004', 'Sample photos_005'].map((name, i) => (
                     <div key={i} className={`flex justify-between py-1.5 ${i < 4 ? 'border-b border-[rgba(255,255,255,0.05)]' : ''}`}>
                         <span className="font-mono text-xs text-[#3b82f6]">{name}</span>
                         <span className="text-xs text-[#71717a]">500 files</span>
                     </div>
                 ))}
                 <p className="text-center text-xs text-[#71717a] italic mt-1">... and 6 more folders</p>
             </div>

             {/* Action Buttons — matching desktop CompleteCard layout */}
             <div className="flex flex-wrap gap-2 justify-center w-full">
                 <button className="flex items-center gap-1.5 px-3 py-2 bg-[#383838] text-[#a1a1aa] hover:bg-[#2d2d2d] hover:text-white rounded-md text-xs font-semibold transition-colors cursor-pointer">
                     <Undo2 className="w-3.5 h-3.5" /> Undo
                 </button>
                 <button className="flex items-center gap-1.5 px-3 py-2 bg-[#383838] text-[#a1a1aa] hover:bg-[#2d2d2d] hover:text-white rounded-md text-xs font-semibold transition-colors cursor-pointer">
                     <History className="w-3.5 h-3.5" /> History
                 </button>
                 <button className="flex items-center gap-1.5 px-3 py-2 bg-[#383838] text-[#a1a1aa] hover:bg-[#2d2d2d] hover:text-white rounded-md text-xs font-semibold transition-colors cursor-pointer">
                     <FolderOpen className="w-3.5 h-3.5" /> Open in Explorer
                 </button>
                 <button className="flex items-center gap-1.5 px-4 py-2 bg-linear-to-r from-[#3b82f6] to-[#2563eb] text-white rounded-md text-xs font-semibold shadow-lg shadow-blue-500/20 hover:-translate-y-0.5 transition-all cursor-pointer">
                     <RotateCcw className="w-3.5 h-3.5" /> Process Another Folder
                 </button>
             </div>
        </div>
    ),
  },
  {
    title: "6. The Hard Part Is Over",
    description:
      "Your files are already sorted into clean batches. Open them in the file explorer and upload anywhere, no stress, no late-night manual sorting.",
    content: <MockFileExplorer />,
  },
];
