'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Folder, FolderOpen, ArrowLeft, Grid3x3, List, XCircle, ChevronRight, ChevronDown,
  Package, CheckCircle, Undo2, History, RotateCcw, Play, Camera, Upload, Heart, Monitor, ArrowUp,
} from 'lucide-react'
import HeroBeforeAfter from '../components/landing/HeroBeforeAfter'
import Footer from '../components/Footer'

// ─── Deterministic thumbnail gradients ──────────────────────────────────────
const simpleHash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0; return Math.abs(h); };
const thumbGradient = (name) => {
    const h = simpleHash(name);
    const a = (h % 360), b = ((h >> 4) + 120) % 360, angle = (h % 4) * 45 + 90;
    return `linear-gradient(${angle}deg, hsl(${a},35%,72%), hsl(${b},40%,80%))`;
};

// ─── Batch preview mock ─────────────────────────────────────────────────────
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
                className={`w-full px-3 py-2.5 flex justify-between items-center cursor-pointer transition-colors text-left font-sans ${expanded ? 'bg-primary' : 'bg-bg-surface hover:bg-primary group'}`}
                onClick={() => setExpanded(!expanded)}
            >
                <span className={`font-semibold text-sm font-mono ${expanded ? 'text-white' : 'text-text-primary group-hover:text-white'}`}>{batch.name}</span>
                <div className="flex items-center gap-2">
                    <span className={`text-xs tnum ${expanded ? 'text-white/90' : 'text-text-muted group-hover:text-white/90'}`}>{batch.count} photos</span>
                    {expanded
                        ? <ChevronDown className="w-3 h-3 text-white/90" />
                        : <ChevronRight className={`w-3 h-3 ${expanded ? '' : 'text-text-muted group-hover:text-white/90'}`} />
                    }
                </div>
            </button>
            {expanded && (
                <div className="bg-bg-main border-t border-border-subtle p-2 space-y-0.5 max-h-56 overflow-y-auto">
                    {visibleFiles.map((name, i) => (
                        <div key={i} className="flex items-center gap-2 py-1 text-text-muted font-mono text-xs">
                            <div className="w-8 h-8 rounded shrink-0" style={{ background: thumbGradient(name) }} />
                            <span className="truncate">{name}</span>
                        </div>
                    ))}
                    {remaining > 0 && (
                        <button
                            className="w-full flex items-center justify-center gap-2 py-2 mt-1 bg-bg-surface border border-dashed border-border-subtle rounded text-text-muted text-xs hover:bg-primary hover:border-primary hover:text-white transition-colors cursor-pointer"
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

const INITIAL_BATCHES = 5;
const LOAD_MORE_BATCHES = 5;

const MockBatchPreview = () => {
    const [batchesShown, setBatchesShown] = useState(INITIAL_BATCHES);
    const visibleBatches = MOCK_BATCHES.slice(0, batchesShown);
    const remainingBatches = MOCK_BATCHES.length - batchesShown;
    return (
        <div className="w-full h-full bg-bg-elevated rounded-2xl border border-border-subtle shadow-card p-5 font-sans flex flex-col overflow-hidden">
            <div className="flex items-center text-text-secondary mb-4">
                <Package className="w-4 h-4 mr-2" />
                <span className="font-semibold text-base">Batch Preview</span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {visibleBatches.map(batch => (<MockBatchItem key={batch.id} batch={batch} />))}
                {remainingBatches > 0 && (
                    <button
                        className="w-full flex items-center justify-center gap-2 py-2 mt-1 bg-bg-surface border border-dashed border-border-subtle rounded text-text-muted text-xs hover:bg-primary hover:border-primary hover:text-white transition-colors cursor-pointer"
                        onClick={() => setBatchesShown(prev => prev + LOAD_MORE_BATCHES)}
                    >
                        <ChevronDown className="w-3 h-3" /> Load {Math.min(remainingBatches, LOAD_MORE_BATCHES)} more batches ({remainingBatches} remaining)
                    </button>
                )}
            </div>
        </div>
    );
};

// ─── File explorer mock ─────────────────────────────────────────────────────
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
        <div className="w-full h-full bg-bg-elevated rounded-2xl border border-border-subtle shadow-card flex flex-col font-sans overflow-hidden">
            <div className="h-8 bg-bg-surface flex items-center justify-between px-3 border-b border-border-subtle shrink-0">
                <div className="flex items-center gap-2">
                    <Folder className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs text-text-secondary font-medium truncate">{currentBatch ? currentBatch.name : 'Sample photos'}</span>
                </div>
                <button className="text-text-muted hover:text-text-primary transition-colors" onClick={goToRoot}>
                    <XCircle className="w-3.5 h-3.5" />
                </button>
            </div>
            <div className="h-9 bg-bg-surface flex items-center gap-2 px-3 border-b border-border-subtle shrink-0">
                <button className={`p-1 rounded transition-colors ${currentBatch ? 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated' : 'text-text-muted cursor-default'}`} onClick={goToRoot} disabled={!currentBatch}>
                    <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-1 text-xs flex-1 min-w-0">
                    <button className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${!currentBatch ? 'text-text-primary bg-bg-elevated' : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'}`} onClick={goToRoot}>
                        <Folder className="w-3 h-3 text-primary" /> Sample photos
                    </button>
                    {currentBatch && (
                        <>
                            <ChevronRight className="w-3 h-3 text-text-muted shrink-0" />
                            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-text-primary bg-bg-elevated">
                                <FolderOpen className="w-3 h-3 text-primary" /> {currentBatch.name}
                            </span>
                        </>
                    )}
                </div>
                <div className="flex gap-0.5">
                    <button className={`p-1 rounded transition-colors ${viewMode === 'grid' ? 'text-text-primary bg-bg-elevated' : 'text-text-muted hover:text-text-primary'}`} onClick={() => setViewMode('grid')}>
                        <Grid3x3 className="w-3.5 h-3.5" />
                    </button>
                    <button className={`p-1 rounded transition-colors ${viewMode === 'list' ? 'text-text-primary bg-bg-elevated' : 'text-text-muted hover:text-text-primary'}`} onClick={() => setViewMode('list')}>
                        <List className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
                {!currentBatch ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-2">
                        {EXPLORER_BATCHES.map(b => (
                            <button key={b.id} className="flex flex-col items-center gap-1 p-3 rounded-lg hover:bg-bg-surface transition-colors cursor-pointer group" onClick={() => openFolder(b)}>
                                <Folder className="w-10 h-10 text-primary group-hover:scale-105 transition-transform" />
                                <span className="text-[11px] text-text-secondary text-center leading-tight truncate w-full">{b.name}</span>
                                <span className="text-[10px] text-text-muted tnum">{b.count} photos</span>
                            </button>
                        ))}
                    </div>
                ) : viewMode === 'grid' ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2">
                        {visibleFiles.map((f, i) => (
                            <div key={i} className="flex flex-col items-center gap-1 cursor-pointer group">
                                <div className="w-full aspect-[4/3] rounded group-hover:ring-2 ring-primary transition-all" style={{ background: thumbGradient(f.name) }} />
                                <span className="text-[10px] text-text-secondary truncate w-full text-center">{f.name}</span>
                            </div>
                        ))}
                        {remaining > 0 && (
                            <button className="flex flex-col items-center justify-center gap-1 p-2 rounded-lg border border-dashed border-border-subtle text-text-muted hover:text-text-primary hover:border-primary transition-colors cursor-pointer aspect-[4/3]" onClick={() => setFilesShown(p => p + EXPLORER_FILES_PER_PAGE)}>
                                <span className="text-[10px] tnum">+{remaining} more</span>
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-0">
                        <div className="grid grid-cols-[24px_1fr_60px_70px_80px] gap-2 px-2 py-1 text-[10px] text-text-muted font-semibold uppercase tracking-wider border-b border-border-subtle">
                            <span /><span>Name</span><span>Size</span><span>Dims</span><span>Date</span>
                        </div>
                        {visibleFiles.map((f, i) => (
                            <div key={i} className="grid grid-cols-[24px_1fr_60px_70px_80px] gap-2 px-2 py-1.5 items-center hover:bg-bg-surface rounded cursor-pointer group">
                                <div className="w-5 h-4 rounded-sm" style={{ background: thumbGradient(f.name) }} />
                                <span className="text-[11px] text-text-secondary truncate">{f.name}</span>
                                <span className="text-[10px] text-text-muted font-mono tnum">{f.size}</span>
                                <span className="text-[10px] text-text-muted font-mono tnum">{f.dimensions}</span>
                                <span className="text-[10px] text-text-muted font-mono tnum">{f.date}</span>
                            </div>
                        ))}
                        {remaining > 0 && (
                            <button className="w-full py-2 mt-1 text-[11px] text-text-muted hover:text-text-primary hover:bg-bg-surface rounded transition-colors cursor-pointer" onClick={() => setFilesShown(p => p + EXPLORER_FILES_PER_PAGE)}>
                                Load {Math.min(remaining, EXPLORER_FILES_PER_PAGE)} more ({remaining} remaining)
                            </button>
                        )}
                    </div>
                )}
            </div>
            <div className="h-7 bg-bg-surface flex items-center justify-between px-3 border-t border-border-subtle shrink-0">
                <span className="text-[10px] text-text-muted tnum">{currentBatch ? `${currentBatch.count} items` : `${EXPLORER_BATCHES.length} folders`}</span>
                <span className="text-[10px] text-text-muted tnum">{currentBatch ? `${(currentBatch.count * 3.8).toFixed(1)} MB` : '20.0 GB'}</span>
            </div>
        </div>
    );
};

// ─── Compact scene visuals ──────────────────────────────────────────────────
const DropZonePanel = () => (
  <div className="w-full bg-bg-elevated rounded-2xl border border-border-subtle shadow-card p-8 flex items-center justify-center aspect-[4/3]">
    <div className="w-full max-w-sm aspect-[4/3] border-2 border-dashed border-border-subtle rounded-xl flex items-center justify-center bg-bg-surface">
      <div className="text-center px-4">
        <FolderOpen className="w-14 h-14 text-text-muted mx-auto mb-3" strokeWidth={1.5} />
        <p className="text-text-primary text-lg font-semibold">Drop a folder here</p>
        <p className="text-text-muted text-sm font-mono mt-1 tnum">12,480 photos · scanned locally</p>
      </div>
    </div>
  </div>
)

const CompletePanel = () => (
  <div className="w-full bg-bg-elevated rounded-2xl border border-border-subtle shadow-card p-8 flex flex-col items-center justify-center aspect-[4/3]">
    <CheckCircle className="w-12 h-12 text-success mb-2" />
    <h3 className="text-text-primary text-lg font-bold">Batching complete</h3>
    <p className="text-text-muted text-sm mt-1 mb-5">Created <span className="font-mono text-text-secondary tnum">25</span> batch folders in <span className="font-mono text-text-secondary tnum">3.1s</span>.</p>
    <div className="flex flex-wrap gap-2 justify-center">
      <button className="flex items-center gap-1.5 px-3 py-2 bg-bg-surface text-text-secondary hover:text-text-primary rounded-full text-xs font-semibold transition-colors"><Undo2 className="w-3.5 h-3.5" /> Undo</button>
      <button className="flex items-center gap-1.5 px-3 py-2 bg-bg-surface text-text-secondary hover:text-text-primary rounded-full text-xs font-semibold transition-colors"><History className="w-3.5 h-3.5" /> History</button>
      <button className="flex items-center gap-1.5 px-3 py-2 bg-bg-surface text-text-secondary hover:text-text-primary rounded-full text-xs font-semibold transition-colors"><FolderOpen className="w-3.5 h-3.5" /> Open</button>
      <button className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-full text-xs font-semibold transition-colors"><RotateCcw className="w-3.5 h-3.5" /> Process another</button>
    </div>
  </div>
)

// ─── Alternating demonstration scene ────────────────────────────────────────
const Scene = ({ eyebrow, title, body, visual, reverse }) => (
  <div className="border-t border-border-subtle">
    <div className="mx-auto max-w-7xl px-6 lg:px-8 py-20 sm:py-28">
      <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className={reverse ? 'lg:order-2' : ''}
        >
          <span className="inline-flex items-center gap-3">
            <span className="race-stripe" aria-hidden="true"><span className="bg-primary" /><span className="bg-accent-strong" /><span className="bg-deep-ember" /></span>
            <span className="kicker">{eyebrow}</span>
          </span>
          <h2 className="font-display mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-text-primary">{title}</h2>
          <p className="mt-4 text-lg text-text-secondary leading-relaxed">{body}</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.05 }}
          className={reverse ? 'lg:order-1' : ''}
        >
          <div className="h-[380px] sm:h-[440px]">{visual}</div>
        </motion.div>
      </div>
    </div>
  </div>
)

const PERSONAS = [
  { icon: Camera, label: 'Event photographers' },
  { icon: Upload, label: 'Content creators' },
  { icon: Heart, label: 'Manual-sort refugees' },
  { icon: Monitor, label: 'Schools & teams' },
]

// ─── FAQ ────────────────────────────────────────────────────────────────────
const FAQ_ITEMS = [
  { q: 'Are my photos uploaded anywhere?', a: "No. Photos are processed on your computer and are never uploaded. There's no cloud step and no third-party access." },
  { q: 'How accurate is the live demo compared to the real app?', a: 'The demo runs the same workflow as the desktop app, on sample photos instead of your own. Download the app to use it on your real files.' },
  { q: 'Can it handle very large folders (10,000+ photos)?', a: "Yes. It's built for 5,000–20,000+ photos and processes files directly on your drive, so speed depends on your hardware, not a server." },
  { q: "What if I don't like the result? Can I undo?", a: 'Yes. Every batch is reversible — Undo puts files back where they were. You can re-batch with different settings as often as you want.' },
  { q: 'Where can I upload my batches after processing?', a: 'Anywhere. Sorted folders work with Google Photos, Drive, Dropbox, WeTransfer, or a client gallery — any service that takes standard folders.' },
  { q: 'Is it safe? Will it corrupt or delete my photos?', a: 'Your photos are never edited. The app only moves or copies files into new folders. Use Copy mode to keep originals, and Undo is always one click away.' },
  { q: 'What if the app crashes or I accidentally close it?', a: 'Your progress is saved automatically. Reopen the app and pick up where you left off — processed files stay put, and Undo still works after a restart.' },
  { q: 'Is it really free?', a: 'Yes. The free plan covers 2 batches a month and needs an internet connection. Pro removes the batch limit, adds offline batching and a second device — ₱299/month, cancel anytime.' },
]

const FaqItem = ({ item, isOpen, onToggle }) => (
  <div className="border-b border-border-subtle">
    <button className="w-full flex items-center justify-between py-5 text-left cursor-pointer group" onClick={onToggle}>
      <span className={`text-base font-medium transition-colors ${isOpen ? 'text-text-primary' : 'text-text-secondary group-hover:text-text-primary'}`}>{item.q}</span>
      <ChevronDown className={`w-5 h-5 shrink-0 ml-4 transition-all duration-300 ${isOpen ? 'rotate-180 text-accent' : 'text-text-muted group-hover:text-text-secondary'}`} />
    </button>
    <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-40 pb-5' : 'max-h-0'}`}>
      <p className="text-sm text-text-secondary leading-relaxed pr-10">{item.a}</p>
    </div>
  </div>
)

const FaqAccordion = () => {
  const [openIndex, setOpenIndex] = useState(null)
  return (
    <div>
      {FAQ_ITEMS.map((item, i) => (
        <FaqItem key={i} item={item} isOpen={openIndex === i} onToggle={() => setOpenIndex(openIndex === i ? null : i)} />
      ))}
    </div>
  )
}

// ─── Microsoft Store badge ──────────────────────────────────────────────────
const StoreBadge = () => (
  <a href="https://apps.microsoft.com/detail/9N1KKMV4NX4J" target="_blank" rel="noopener noreferrer" className="inline-flex items-center hover:-translate-y-1 transition-transform" aria-label="Get it from Microsoft Store">
    <svg xmlns="http://www.w3.org/2000/svg" width="200" height="58" viewBox="0 0 200 58">
      <defs><linearGradient id="ms-badge-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2a2a2a" /><stop offset="100%" stopColor="#1a1a1a" /></linearGradient></defs>
      <rect width="200" height="58" rx="8" fill="url(#ms-badge-bg)" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      <text x="68" y="22" fill="#ccc" fontSize="10" fontFamily="Segoe UI, sans-serif" fontWeight="400">Get it from</text>
      <text x="68" y="40" fill="#fff" fontSize="16" fontFamily="Segoe UI, sans-serif" fontWeight="600">Microsoft Store</text>
      <g transform="translate(18,14)">
        <rect x="0" y="0" width="13" height="13" rx="1.5" fill="#F25022" />
        <rect x="15" y="0" width="13" height="13" rx="1.5" fill="#7FBA00" />
        <rect x="0" y="15" width="13" height="13" rx="1.5" fill="#00A4EF" />
        <rect x="15" y="15" width="13" height="13" rx="1.5" fill="#FFB900" />
      </g>
    </svg>
  </a>
)

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
      className={`fixed bottom-6 right-6 z-50 w-11 h-11 rounded-full bg-primary hover:bg-primary-hover text-white shadow-card flex items-center justify-center transition-all duration-300 cursor-pointer ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}
    >
      <ArrowUp className="w-5 h-5" />
    </button>
  )
}

export default function LandingPage() {
  return (
    <div className="relative bg-bg-main">
      <div className="contact-sheet-grid absolute inset-0 pointer-events-none" style={{ zIndex: 0 }} aria-hidden="true" />

      {/* Hero */}
      <HeroBeforeAfter />

      {/* Honest one-liner */}
      <div className="relative z-10 border-t border-border-subtle">
        <p className="mx-auto max-w-3xl px-6 py-10 text-center text-lg text-text-secondary">
          <span className="font-mono text-text-muted tnum">1–2 hours</span> of sorting by hand becomes <span className="font-mono text-accent">a few seconds</span>.
        </p>
      </div>

      {/* Demonstration scenes */}
      <div className="relative z-10">
        <Scene
          eyebrow="01 · Import"
          title="Drag a folder in. It scans on your drive."
          body="Drop a folder of thousands of photos onto the app. It reads them straight from your file system — nothing is uploaded."
          visual={<DropZonePanel />}
        />
        <Scene
          reverse
          eyebrow="02 · Preview"
          title="Set how it splits, then preview every folder."
          body="Choose the photos-per-folder limit and sort order, and see the exact batches and file counts before a single file moves."
          visual={<MockBatchPreview />}
        />
        <Scene
          eyebrow="03 · Run"
          title="It runs in seconds. Reversible in one click."
          body="Move files for speed or copy to keep originals. Changed your mind? Undo puts every file back where it was."
          visual={<CompletePanel />}
        />
        <Scene
          reverse
          eyebrow="04 · Done"
          title="Open the folders and upload anywhere."
          body="Your photos sit in numbered folders, ready for Google Photos, Drive, or a client gallery — any service that takes standard folders."
          visual={<MockFileExplorer />}
        />
      </div>

      {/* Who it's for — quiet strip */}
      <div className="relative z-10 border-t border-border-subtle">
        <div className="mx-auto max-w-5xl px-6 py-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          <span className="kicker">Made for</span>
          {PERSONAS.map(({ icon: Icon, label }) => (
            <span key={label} className="flex items-center gap-2 text-sm text-text-secondary">
              <Icon className="w-4 h-4 text-accent" /> {label}
            </span>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div id="faq" className="relative z-10 border-t border-border-subtle">
        <div className="mx-auto max-w-3xl px-6 lg:px-8 py-24">
          <div className="text-center mb-12">
            <span className="inline-flex items-center gap-3">
              <span className="race-stripe" aria-hidden="true"><span className="bg-primary" /><span className="bg-accent-strong" /><span className="bg-deep-ember" /></span>
              <span className="kicker">FAQ</span>
            </span>
            <h2 className="font-display mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-text-primary">Questions before you start</h2>
          </div>
          <FaqAccordion />
        </div>
      </div>

      {/* Final CTA */}
      <div className="relative z-10 border-t border-border-subtle">
        <div className="mx-auto max-w-3xl px-6 py-28 text-center">
          <span className="inline-flex items-center gap-3 mb-4">
            <span className="race-stripe" aria-hidden="true"><span className="bg-primary" /><span className="bg-accent-strong" /><span className="bg-deep-ember" /></span>
            <span className="kicker">Get started</span>
          </span>
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-text-primary">Stop sorting photos by hand.</h2>
          <p className="mt-4 text-lg text-text-secondary max-w-xl mx-auto leading-relaxed">Try it in the browser, then install from the Microsoft Store. Free to start.</p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="/demo" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2.5 px-8 py-4 rounded-full bg-primary hover:bg-primary-hover text-white text-base font-bold transition-colors">
              <Play className="w-5 h-5" /> Try the demo
            </a>
            <StoreBadge />
          </div>
          <p className="mt-8 text-sm text-text-muted">Free to start · Cancel anytime</p>
        </div>
      </div>

      <Footer />
      <ScrollToTop />
    </div>
  )
}
