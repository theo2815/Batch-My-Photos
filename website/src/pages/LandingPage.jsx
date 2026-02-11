import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTheme } from '../context/ThemeContext'
import { Zap, FolderOpen, Folder, Settings, ScanEye, CheckCircle, Copy, ArrowDownAZ, Trash2, Save, Info, Package, ChevronRight, ChevronDown, XCircle, RotateCcw, Undo2, History, ArrowLeft, Grid3x3, List, Play, Layers, Eye, Droplets, Users, Lock, Sparkles, Camera, Upload, WifiOff, ShieldCheck, SlidersHorizontal, Heart, Monitor, ArrowRight, ArrowUp } from 'lucide-react'
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
        <div className="flex items-center text-slate-400 mb-6">
            <Settings className="w-4 h-4 mr-2" />
            <span className="font-semibold text-base text-slate-200">Settings</span>
        </div>

        <div className="space-y-5 flex-1 z-10">
            {/* Presets */}
            <div className="flex items-center justify-between group relative">
                <div className="flex items-center text-[#a1a1aa]">
                    <span>Presets:</span>
                    <Info className="w-3 h-3 ml-1 text-slate-600 cursor-help" />
                </div>
                <div
                    className="flex-1 ml-4 bg-[#383838] hover:bg-[#1e1e1e] rounded p-2 flex justify-between items-center text-slate-200 cursor-pointer transition-colors border border-transparent hover:border-[#3b82f6]"
                    onClick={() => setIsPresetOpen(!isPresetOpen)}
                >
                    <span>{preset}</span>
                    <Settings className="w-3 h-3 text-slate-500" />
                </div>
                {/* Preset Dropdown Mock */}
                {isPresetOpen && (
                    <div className="absolute top-full right-0 mt-1 w-48 bg-[#383838] border border-[rgba(255,255,255,0.05)] rounded-md shadow-xl overflow-hidden z-50">
                        {['Default', 'Running preset', 'Sports Mode', 'Portraits'].map(p => (
                            <div
                                key={p}
                                className="px-3 py-2 hover:bg-[#1e1e1e] text-slate-300 cursor-pointer"
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
            <div className="flex flex-col space-y-3 pt-2">
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
                            <ChevronDown className="w-3 h-3 text-slate-500 group-hover:text-[#3b82f6]" />
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
                        <p className="text-slate-400 text-xs mb-4">Choose how aggressively blurry photos are detected.</p>
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
             <p className="text-[10px] text-slate-500 italic mt-2 flex items-center">
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
    <div className="w-full h-full bg-slate-900 flex flex-col font-sans">
        <div className="h-8 bg-slate-800 flex items-center px-4 space-x-2 border-b border-slate-700">
            <div className="w-3 h-3 rounded-full bg-red-500"/>
            <div className="w-3 h-3 rounded-full bg-yellow-500"/>
            <div className="w-3 h-3 rounded-full bg-green-500"/>
            <span className="ml-4 text-xs text-slate-400 font-medium">{title}</span>
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
                    <span className="text-xs text-slate-300 font-medium truncate">
                        {currentBatch ? currentBatch.name : 'Sample photos'}
                    </span>
                </div>
                <button className="text-slate-500 hover:text-white transition-colors" onClick={goToRoot}>
                    <XCircle className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* ── Toolbar ── */}
            <div className="h-9 bg-[#27272a] flex items-center gap-2 px-3 border-b border-[rgba(255,255,255,0.06)] shrink-0">
                <button
                    className={`p-1 rounded transition-colors ${currentBatch ? 'text-slate-400 hover:text-white hover:bg-[#383838]' : 'text-slate-700 cursor-default'}`}
                    onClick={goToRoot}
                    disabled={!currentBatch}
                >
                    <ArrowLeft className="w-4 h-4" />
                </button>

                {/* Breadcrumb */}
                <div className="flex items-center gap-1 text-xs flex-1 min-w-0">
                    <button className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${!currentBatch ? 'text-white bg-[#383838]' : 'text-slate-400 hover:text-white hover:bg-[#383838]'}`} onClick={goToRoot}>
                        <Folder className="w-3 h-3 text-[#fbbf24]" /> Sample photos
                    </button>
                    {currentBatch && (
                        <>
                            <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
                            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-white bg-[#383838]">
                                <FolderOpen className="w-3 h-3 text-[#fbbf24]" /> {currentBatch.name}
                            </span>
                        </>
                    )}
                </div>

                {/* View toggle */}
                <div className="flex gap-0.5">
                    <button
                        className={`p-1 rounded transition-colors ${viewMode === 'grid' ? 'text-white bg-[#383838]' : 'text-slate-500 hover:text-white'}`}
                        onClick={() => setViewMode('grid')}
                    >
                        <Grid3x3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                        className={`p-1 rounded transition-colors ${viewMode === 'list' ? 'text-white bg-[#383838]' : 'text-slate-500 hover:text-white'}`}
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
                                <span className="text-[11px] text-slate-300 text-center leading-tight truncate w-full">{b.name}</span>
                                <span className="text-[10px] text-slate-600">{b.count} photos</span>
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
                                <span className="text-[10px] text-slate-400 truncate w-full text-center">{f.name}</span>
                            </div>
                        ))}
                        {remaining > 0 && (
                            <button
                                className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg border border-dashed border-[rgba(255,255,255,0.1)] text-slate-500 hover:text-white hover:border-[#3b82f6] transition-colors cursor-pointer aspect-[4/3]"
                                onClick={() => setFilesShown(p => p + EXPLORER_FILES_PER_PAGE)}
                            >
                                <span className="text-[10px]">+{remaining} more</span>
                            </button>
                        )}
                    </div>
                ) : (
                    /* File List */
                    <div className="space-y-0">
                        <div className="grid grid-cols-[24px_1fr_60px_70px_80px] gap-2 px-2 py-1 text-[10px] text-slate-600 font-semibold uppercase tracking-wider border-b border-[rgba(255,255,255,0.06)]">
                            <span /><span>Name</span><span>Size</span><span>Dims</span><span>Date</span>
                        </div>
                        {visibleFiles.map((f, i) => (
                            <div key={i} className="grid grid-cols-[24px_1fr_60px_70px_80px] gap-2 px-2 py-1.5 items-center hover:bg-[rgba(255,255,255,0.03)] rounded cursor-pointer group">
                                <div className="w-5 h-4 rounded-sm" style={{ background: thumbGradient(f.name) }} />
                                <span className="text-[11px] text-slate-300 truncate">{f.name}</span>
                                <span className="text-[10px] text-slate-500 font-mono">{f.size}</span>
                                <span className="text-[10px] text-slate-500 font-mono">{f.dimensions}</span>
                                <span className="text-[10px] text-slate-500 font-mono">{f.date}</span>
                            </div>
                        ))}
                        {remaining > 0 && (
                            <button
                                className="w-full py-2 mt-1 text-[11px] text-slate-500 hover:text-white hover:bg-[rgba(255,255,255,0.04)] rounded transition-colors cursor-pointer"
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
                <span className="text-[10px] text-slate-500">
                    {currentBatch ? `${currentBatch.count} items` : `${EXPLORER_BATCHES.length} folders`}
                </span>
                <span className="text-[10px] text-slate-600">
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
    a: "No. Everything runs locally on your machine. Your files never leave your computer—there are no uploads, no cloud processing, and no third-party access. Ever.",
  },
  {
    q: "How accurate is the live demo compared to the real app?",
    a: "The demo simulates the exact same workflow and logic as the desktop app. The only difference is it uses generated sample data instead of your real photos. What you see in the demo is what you get.",
  },
  {
    q: "Can it handle very large folders (10,000+ photos)?",
    a: "Yes. The app is designed for real-world workloads of 5,000 to 20,000+ photos. It processes files directly on your file system, so performance scales with your hardware—not a server.",
  },
  {
    q: "What if I don't like the result? Can I undo?",
    a: "Absolutely. Every batch operation is fully reversible. Hit Undo and your files go right back to where they were. You can also re-batch with different settings as many times as you need.",
  },
  {
    q: "Where can I upload my batches after processing?",
    a: "Anywhere. Once your photos are sorted into folders, you can upload them to Google Photos, Dropbox, WeTransfer, social media—any platform that accepts standard files and folders.",
  },
  {
    q: "Is it safe? Will it corrupt or delete my photos?",
    a: "Your photos are never modified. The app only moves or copies files into new folders. You can choose Copy mode to keep originals untouched, and Undo is always one click away.",
  },
  {
    q: "What if the app crashes or I accidentally close it?",
    a: "No worries—your progress is saved automatically. If the app closes, you can resume right where you left off. Files already processed stay in their folders, and Undo still works after a restart.",
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
      <span className={`text-base font-medium transition-colors ${isOpen ? (isDark ? 'text-white' : 'text-gray-900') : isDark ? 'text-slate-300 group-hover:text-white' : 'text-gray-600 group-hover:text-gray-900'}`}>
        {item.q}
      </span>
      <ChevronDown
        className={`w-5 h-5 shrink-0 ml-4 transition-all duration-300 ${isOpen ? 'rotate-180 text-indigo-400' : isDark ? 'text-slate-600 group-hover:text-slate-400' : 'text-gray-400 group-hover:text-gray-500'}`}
      />
    </button>
    <div
      className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-40 pb-5' : 'max-h-0'}`}
    >
      <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'} leading-relaxed pr-10`}>{item.a}</p>
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
      className={`fixed bottom-6 right-6 z-50 w-11 h-11 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 flex items-center justify-center transition-all duration-300 cursor-pointer ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
    >
      <ArrowUp className="w-5 h-5" />
    </button>
  )
}

export default function LandingPage() {
  const { isDark } = useTheme()
  return (
    <div className={isDark ? 'bg-slate-950' : 'bg-white'}>
      {/* Hero Section */}
      <div className="relative isolate overflow-hidden">
        {/* Animated background orbs */}
        <div className="absolute inset-0 -z-10" aria-hidden="true">
          <div className={`hero-orb-1 absolute top-20 left-1/4 w-96 h-96 rounded-full ${isDark ? 'bg-indigo-500/20' : 'bg-indigo-200/40'} blur-3xl`} />
          <div className={`hero-orb-2 absolute bottom-10 right-1/4 w-80 h-80 rounded-full ${isDark ? 'bg-purple-500/15' : 'bg-purple-200/30'} blur-3xl`} />
          <div className={`absolute inset-0 ${isDark ? 'bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(99,102,241,0.12),transparent)]' : 'bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(99,102,241,0.06),transparent)]'}`} />
        </div>

        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-3xl pt-32 sm:pt-44 lg:pt-52 pb-24 sm:pb-32 text-center">

            {/* Badge */}
            <div className={`inline-flex items-center gap-2 rounded-full border ${isDark ? 'border-indigo-500/20 bg-indigo-500/10' : 'border-indigo-200 bg-indigo-50'} px-4 py-1.5 mb-8`}>
              <Zap className="w-3.5 h-3.5 text-indigo-400" />
              <span className={`text-xs font-semibold tracking-wide ${isDark ? 'text-indigo-300' : 'text-indigo-600'}`}>100% local · No uploads · No cloud</span>
            </div>

            {/* Headline */}
            <h1 className={`text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-gray-900'} leading-[1.1]`}>
              Sort thousands of photos{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">in minutes.</span>
            </h1>

            {/* Sub-headline */}
            <p className={`mt-6 text-lg sm:text-xl leading-8 ${isDark ? 'text-slate-400' : 'text-gray-500'} max-w-2xl mx-auto`}>
              Drag a folder in, tweak your settings, and let Batch My Photos organize everything into clean, labeled batches — right on your machine.
            </p>

            {/* CTA buttons */}
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="/demo"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-2.5 px-8 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-base font-semibold shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 transition-all"
              >
                <Play className="w-5 h-5" /> Try the Live Demo
              </a>
              <Link
                to="/register"
                className={`inline-flex items-center gap-2 px-8 py-4 rounded-xl border ${isDark ? 'border-slate-700 hover:border-indigo-500 text-slate-300' : 'border-gray-300 hover:border-indigo-500 text-gray-600'} hover:text-white text-base font-semibold transition-all`}
              >
                <Monitor className="w-4.5 h-4.5" /> Download for Free
              </Link>
            </div>

            {/* Trust indicators */}
            <div className={`mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
              <span className="flex items-center gap-1.5"><ShieldCheck className={`w-4 h-4 ${isDark ? 'text-slate-600' : 'text-gray-400'}`} /> Private &amp; offline</span>
              <span className={`hidden sm:inline ${isDark ? 'text-slate-700' : 'text-gray-300'}`}>·</span>
              <span className="flex items-center gap-1.5"><Undo2 className={`w-4 h-4 ${isDark ? 'text-slate-600' : 'text-gray-400'}`} /> Fully reversible</span>
              <span className={`hidden sm:inline ${isDark ? 'text-slate-700' : 'text-gray-300'}`}>·</span>
              <span className="flex items-center gap-1.5"><Zap className={`w-4 h-4 ${isDark ? 'text-slate-600' : 'text-gray-400'}`} /> Handles 20,000+ photos</span>
            </div>

            {/* Mini preview illustration */}
            <div className="mt-16 relative">
              <div className="hero-shimmer absolute -inset-4 rounded-2xl" />
              <div className={`relative rounded-2xl border ${isDark ? 'border-white/[0.08] bg-white/[0.03] backdrop-blur-sm shadow-2xl shadow-black/40' : 'border-gray-200 bg-slate-900 shadow-2xl shadow-gray-300/30'} p-6 sm:p-8`}>
                <div className="flex items-center gap-3 mb-5">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                    <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                    <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                  </div>
                  <span className="text-xs text-slate-500 font-medium ml-2">Batch My Photos</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {['Marathon — Batch 1', 'Marathon — Batch 2', 'Marathon — Batch 3'].map((name, i) => (
                    <div key={i} className="rounded-lg bg-white/[0.04] border border-white/[0.06] p-3 text-left">
                      <div className="flex items-center gap-2 mb-2">
                        <Folder className="w-4 h-4 text-indigo-400" />
                        <span className="text-xs font-medium text-white truncate">{name}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">{500 - i * 12} photos</div>
                      <div className="mt-2 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500" style={{ width: `${100 - i * 15}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline Features Section */}
      <div id="features" className={`relative ${isDark ? 'bg-slate-950' : 'bg-white'} overflow-hidden`}>
        <div className="mx-auto max-w-2xl text-center pt-24 sm:pt-32 pb-8 px-6">
          <span className="text-xs font-bold tracking-widest uppercase text-indigo-400">How It Works</span>
          <h2 className={`mt-4 text-3xl sm:text-5xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>From folder to done in 6&nbsp;steps</h2>
          <p className={`mt-4 text-lg ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Scroll through each step to see how Batch My Photos organizes thousands of photos effortlessly.</p>
        </div>
        <VerticalTimeline content={content} />

        {/* ── CTA after timeline ── */}
        <div className="relative mx-auto max-w-3xl text-center px-6 pt-20 pb-32">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
            <div className="w-80 h-80 rounded-full bg-indigo-500/10 blur-3xl" />
          </div>
          <h3 className={`relative text-3xl sm:text-4xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} mb-4`}>
            See it in action — no download needed
          </h3>
          <p className={`relative text-lg ${isDark ? 'text-slate-400' : 'text-gray-500'} mb-10 max-w-xl mx-auto`}>
            Try the full workflow right in your browser. Drag a folder, tweak settings, preview batches, and watch them process — all in our interactive demo.
          </p>
          <div className="relative flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="/demo"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-base font-semibold shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 transition-all"
            >
              <Play className="w-5 h-5" /> Try the Live Demo
            </a>
            <Link
              to="/register"
              className={`inline-flex items-center gap-2 px-8 py-4 rounded-xl border ${isDark ? 'border-slate-700 hover:border-indigo-500 text-slate-300 hover:text-white' : 'border-gray-300 hover:border-indigo-500 text-gray-600 hover:text-white'} text-base font-semibold transition-all`}
            >
              Download for Free
            </Link>
          </div>
        </div>
      </div>

      {/* ══ Features Section ══ */}
      <div className={`${isDark ? 'bg-slate-950' : 'bg-gray-50'} border-t ${isDark ? 'border-white/[0.04]' : 'border-gray-200'}`}>
        <div className="mx-auto max-w-7xl px-6 lg:px-8 py-24 sm:py-32">

          {/* Section header */}
          <div className="mx-auto max-w-2xl text-center mb-16">
            <span className="text-xs font-bold tracking-widest uppercase text-indigo-400">Built for Real Workflows</span>
            <h2 className={`mt-4 text-3xl sm:text-5xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>Features that actually save you time</h2>
            <p className={`mt-4 text-lg ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Everything you need to go from a messy photo dump to perfectly organized batches—without the headache.</p>
          </div>

          {/* Feature cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">

            {/* ── Card 1: Batch Photo Processing ── */}
            <div className={`group relative rounded-2xl border ${isDark ? 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]' : 'border-gray-200 bg-white hover:bg-gray-50 shadow-sm'} p-8 hover:border-indigo-500/30 transition-all duration-300`}>
              <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="relative">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-500/10 mb-5 group-hover:bg-indigo-500/20 transition-colors">
                  <Layers className="w-6 h-6 text-indigo-400" />
                </div>
                <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} mb-2`}>Batch Photo Processing</h3>
                <p className={`${isDark ? 'text-slate-400' : 'text-gray-500'} leading-relaxed`}>Automatically split thousands of photos into clean, manageable batches based on your limits. Set a max per folder—500, 1000, whatever you need—and we handle the rest.</p>
              </div>
            </div>

            {/* ── Card 2: Blurry Photo Detection ── */}
            <div className={`group relative rounded-2xl border ${isDark ? 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]' : 'border-gray-200 bg-white hover:bg-gray-50 shadow-sm'} p-8 hover:border-amber-500/30 transition-all duration-300`}>
              <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="relative">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/10 mb-5 group-hover:bg-amber-500/20 transition-colors">
                  <Eye className="w-6 h-6 text-amber-400" />
                </div>
                <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'} mb-2`}>Blurry Photo Detection</h3>
                <p className={`${isDark ? 'text-slate-400' : 'text-gray-500'} leading-relaxed`}>Flag blurry images before they waste your time. Choose Strict, Moderate, or Lenient sensitivity to catch exactly the level of blur you care about—then review or remove in one click.</p>
                {/* Sensitivity pills */}
                <div className="flex gap-2 mt-4">
                  {['Strict', 'Moderate', 'Lenient'].map(s => (
                    <span key={s} className={`text-[11px] font-semibold px-3 py-1 rounded-full ${
                      s === 'Moderate'
                        ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30'
                        : isDark ? 'bg-white/[0.04] text-slate-500' : 'bg-gray-100 text-gray-500'
                    }`}>{s}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Card 3: Watermarking (Coming Soon) ── */}
            <div className={`group relative rounded-2xl border ${isDark ? 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]' : 'border-gray-200 bg-white hover:bg-gray-50 shadow-sm'} p-8 hover:border-cyan-500/30 transition-all duration-300`}>
              <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="relative">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-cyan-500/10 mb-5 group-hover:bg-cyan-500/20 transition-colors">
                  <Droplets className="w-6 h-6 text-cyan-400" />
                </div>
                <div className="flex items-center gap-3 mb-2">
                  <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Watermarking</h3>
                  <span className="text-[10px] font-bold tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/20">Coming Soon</span>
                </div>
                <p className={`${isDark ? 'text-slate-400' : 'text-gray-500'} leading-relaxed`}>Apply a custom watermark to every photo in a batch, automatically. Toggle it on or off per batch—your brand, your terms, zero manual work.</p>
              </div>
            </div>

            {/* ── Card 4: Face Recognition (Coming Soon) ── */}
            <div className={`group relative rounded-2xl border ${isDark ? 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]' : 'border-gray-200 bg-white hover:bg-gray-50 shadow-sm'} p-8 hover:border-purple-500/30 transition-all duration-300`}>
              <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="relative">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-purple-500/10 mb-5 group-hover:bg-purple-500/20 transition-colors">
                  <Users className="w-6 h-6 text-purple-400" />
                </div>
                <div className="flex items-center gap-3 mb-2">
                  <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Face Recognition</h3>
                  <span className="text-[10px] font-bold tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 ring-1 ring-purple-500/20">Coming Soon</span>
                </div>
                <p className={`${isDark ? 'text-slate-400' : 'text-gray-500'} leading-relaxed`}>Group photos by the people in them. Identify faces across thousands of images so you can sort, review, and deliver faster than ever.</p>
              </div>
            </div>
          </div>

          {/* Bottom trust bar */}
          <div className={`flex flex-wrap items-center justify-center gap-x-8 gap-y-4 mt-16 pt-10 border-t ${isDark ? 'border-white/[0.04]' : 'border-gray-200'}`}>
            <div className={`flex items-center gap-2 text-sm ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
              <Lock className="w-4 h-4" /> 100% Local Processing
            </div>
            <div className={`flex items-center gap-2 text-sm ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
              <Zap className="w-4 h-4" /> No Uploads Required
            </div>
            <div className={`flex items-center gap-2 text-sm ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
              <Sparkles className="w-4 h-4" /> Free to Use
            </div>
          </div>
        </div>
      </div>

      {/* ══ Who It's For / Why It Works ══ */}
      <div className={isDark ? 'bg-slate-950' : 'bg-white'}>
        <div className="mx-auto max-w-7xl px-6 lg:px-8 py-24 sm:py-32">

          {/* ── Two-column layout ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24">

            {/* Left: Who It's For */}
            <div>
              <span className="text-xs font-bold tracking-widest uppercase text-indigo-400">Who It's For</span>
              <h2 className={`mt-4 text-3xl sm:text-4xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>Built for people who deal with <em className="not-italic text-indigo-400">way too many photos</em></h2>
              <p className={`mt-4 text-lg ${isDark ? 'text-slate-400' : 'text-gray-500'} leading-relaxed`}>If you've ever stared at a folder with 10,000 unsorted images and thought "where do I even start?"—this is for you.</p>

              <div className="mt-10 space-y-6">
                {/* Persona 1 */}
                <div className="flex gap-4">
                  <div className="shrink-0 mt-1">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                      <Camera className="w-5 h-5 text-indigo-400" />
                    </div>
                  </div>
                  <div>
                    <h4 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Wedding &amp; Event Photographers</h4>
                    <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'} mt-1 leading-relaxed`}>You shoot 5,000–20,000 photos per event. You need them split into clean, deliverable batches—fast. No second-guessing, no miscounts.</p>
                  </div>
                </div>

                {/* Persona 2 */}
                <div className="flex gap-4">
                  <div className="shrink-0 mt-1">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                      <Upload className="w-5 h-5 text-amber-400" />
                    </div>
                  </div>
                  <div>
                    <h4 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Content Creators &amp; Social Managers</h4>
                    <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'} mt-1 leading-relaxed`}>You upload to multiple platforms with strict file limits. Batch My Photos splits your library into ready-to-upload folders so you never hit a cap mid-upload again.</p>
                  </div>
                </div>

                {/* Persona 3 */}
                <div className="flex gap-4">
                  <div className="shrink-0 mt-1">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                      <Heart className="w-5 h-5 text-emerald-400" />
                    </div>
                  </div>
                  <div>
                    <h4 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Anyone Tired of Manual Sorting</h4>
                    <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'} mt-1 leading-relaxed`}>Maybe you're organizing family vacations, school events, or personal archives. If you've ever spent an evening dragging files into folders one by one—those days are over.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Why It Works */}
            <div>
              <span className="text-xs font-bold tracking-widest uppercase text-indigo-400">Why It Works</span>
              <h2 className={`mt-4 text-3xl sm:text-4xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>Because it was built by someone who <em className="not-italic text-indigo-400">actually needed it</em></h2>
              <p className={`mt-4 text-lg ${isDark ? 'text-slate-400' : 'text-gray-500'} leading-relaxed`}>This isn't a generic file tool with a photo skin. Every feature exists because real workflows demanded it.</p>

              <div className="mt-10 space-y-6">
                {/* Reason 1 */}
                <div className="flex gap-4">
                  <div className="shrink-0 mt-1">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                      <Layers className="w-5 h-5 text-indigo-400" />
                    </div>
                  </div>
                  <div>
                    <h4 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Handles Real-World Scale</h4>
                    <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'} mt-1 leading-relaxed`}>Designed for 5,000 to 20,000+ photos per session. Batch sizes, folder names, and sort order are all under your control—no arbitrary limits.</p>
                  </div>
                </div>

                {/* Reason 2 */}
                <div className="flex gap-4">
                  <div className="shrink-0 mt-1">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5 text-amber-400" />
                    </div>
                  </div>
                  <div>
                    <h4 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Preview Before You Commit</h4>
                    <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'} mt-1 leading-relaxed`}>See exactly how your batches will look before a single file moves. Check counts, review file lists, and confirm everything is right. No surprises.</p>
                  </div>
                </div>

                {/* Reason 3 */}
                <div className="flex gap-4">
                  <div className="shrink-0 mt-1">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                      <WifiOff className="w-5 h-5 text-emerald-400" />
                    </div>
                  </div>
                  <div>
                    <h4 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>100% Offline. Your Files Stay Yours.</h4>
                    <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'} mt-1 leading-relaxed`}>Nothing gets uploaded. Nothing leaves your machine. The app works entirely on your local file system—fast, private, and always available.</p>
                  </div>
                </div>

                {/* Reason 4 */}
                <div className="flex gap-4">
                  <div className="shrink-0 mt-1">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                      <SlidersHorizontal className="w-5 h-5 text-cyan-400" />
                    </div>
                  </div>
                  <div>
                    <h4 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Transparent &amp; Fully In Your Control</h4>
                    <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'} mt-1 leading-relaxed`}>Every setting is visible. Every batch is previewable. Undo anything. This tool works with you, not behind your back.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom pull quote */}
          <div className={`mt-20 pt-12 border-t ${isDark ? 'border-white/[0.04]' : 'border-gray-200'} text-center`}>
            <p className={`text-xl sm:text-2xl font-medium ${isDark ? 'text-white' : 'text-gray-900'} italic max-w-2xl mx-auto leading-relaxed`}>
              "I just need my photos sorted into folders. That's it."
            </p>
            <p className="mt-3 text-sm text-indigo-400 font-semibold">That's exactly what this does. Nothing more, nothing less.</p>
          </div>
        </div>
      </div>

      {/* ══ FAQ Section ══ */}
      <div id="faq" className={`${isDark ? 'bg-slate-950' : 'bg-gray-50'} border-t ${isDark ? 'border-white/[0.04]' : 'border-gray-200'}`}>
        <div className="mx-auto max-w-3xl px-6 lg:px-8 py-24 sm:py-32">

          <div className="text-center mb-14">
            <span className="text-xs font-bold tracking-widest uppercase text-indigo-400">FAQ</span>
            <h2 className={`mt-4 text-3xl sm:text-4xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>Questions before you start</h2>
            <p className={`mt-3 text-base ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Quick answers to the things most people ask first.</p>
          </div>

          <FaqAccordion />
        </div>
      </div>

      {/* ══ Final CTA ══ */}
      <div className={`${isDark ? 'bg-slate-950' : 'bg-white'} border-t ${isDark ? 'border-white/[0.04]' : 'border-gray-200'}`}>
        <div className="mx-auto max-w-3xl px-6 lg:px-8 py-28 sm:py-36 text-center">

          <p className="text-sm font-semibold text-indigo-400 mb-4">Ready when you are</p>
          <h2 className={`text-3xl sm:text-4xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Your photos deserve better than manual sorting.
          </h2>
          <p className={`mt-4 text-lg ${isDark ? 'text-slate-400' : 'text-gray-500'} max-w-xl mx-auto leading-relaxed`}>
            Batch My Photos handles the tedious part so you can get back to what matters. Try it in your browser first — no account, no install, no risk.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="/demo"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-base font-semibold shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 transition-all"
            >
              <Play className="w-5 h-5" /> Try the Live Demo
            </a>
            <Link
              to="/register"
              className={`inline-flex items-center gap-2 px-8 py-4 rounded-xl border ${isDark ? 'border-slate-700 hover:border-indigo-500 text-slate-300 hover:text-white' : 'border-gray-300 hover:border-indigo-500 text-gray-600 hover:text-white'} text-base font-semibold transition-all`}
            >
              Get Full Access
            </Link>
          </div>

          <p className={`mt-8 text-sm ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>Free to start · No credit card · Cancel anytime</p>
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
      "Start by dragging a folder containing thousands of photos directly into the app. We instantly scan and prepare them for processing—no uploads required.",
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
      "Sit back and watch the magic. We process thousands of files in minutes, moving them instantly to their new folders.",
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
      "Your files are already sorted into clean batches. Open them in the file explorer and upload anywhere—no stress, no late-night manual sorting.",
    content: <MockFileExplorer />,
  },
];
