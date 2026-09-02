'use client'

import React from 'react';
import { X, Minus, Square, Command, History, Sun, Moon, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import '../styles/desktop.css';

/**
 * SimulatorLayout — macOS-style window chrome wrapping the desktop app's
 * exact header / main / footer structure.
 *
 * Props
 * ─────
 * children   — Current step component
 * scrollMain — If true, the main area scrolls naturally (for PreviewStep)
 *              instead of flex-centering content vertically.
 */
const SimulatorLayout = ({ children, scrollMain = false, onShowHistory, hasHistory = false, modals, simTheme = 'dark', onToggleTheme }) => {
  return (
    <div className="min-h-screen bg-bg-main flex items-center justify-center p-4 font-sans selection:bg-primary/30">
      <div className={`sim-app ${simTheme === 'light' ? 'light' : ''} w-full max-w-[900px] h-[700px] rounded-xl border shadow-2xl flex flex-col overflow-hidden relative`}
           style={{ background: simTheme === 'light' ? '#f8f5ee' : '#15130e', borderColor: simTheme === 'light' ? '#e5e2d9' : '#2a251c' }}>
        
        {/* ─── macOS Title Bar ────────────────────────────────────────── */}
        <div className="h-10 flex items-center justify-between px-4 border-b shrink-0 select-none"
             style={{ background: simTheme === 'light' ? '#efeae0' : '#201c15', borderColor: simTheme === 'light' ? '#e5e2d9' : '#2a251c' }}>
          <div className="flex items-center space-x-2 text-xs font-medium" style={{ color: simTheme === 'light' ? '#475569' : '#b8b0a0' }}>
            <div className="flex space-x-2 mr-4">
              <div className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500 transition-colors cursor-pointer group flex items-center justify-center">
                <Link href="/" className="opacity-0 group-hover:opacity-100 text-black">
                  <X size={8} strokeWidth={3} />
                </Link>
              </div>
              <div className="w-3 h-3 rounded-full bg-yellow-500/80 hover:bg-yellow-500 transition-colors cursor-pointer flex items-center justify-center">
                <Minus size={8} strokeWidth={3} className="opacity-0 hover:opacity-100 text-black" />
              </div>
              <div className="w-3 h-3 rounded-full bg-green-500/80 hover:bg-green-500 transition-colors cursor-pointer flex items-center justify-center">
                <Square size={6} fill="black" className="opacity-0 hover:opacity-100 text-black" />
              </div>
            </div>
            <Command size={14} className="text-accent" />
            <span>BatchMyPhotos - Demo Mode</span>
          </div>
          <div className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: simTheme === 'light' ? '#64748b' : '#8a8272' }}>
            Interactive Web Demo
          </div>
        </div>

        {/* ─── Desktop App Interior ──────────────────────────────────── */}
        <div className="sim-app-inner overflow-y-auto">
          
          {/* App Header — gradient title + subtitle (matches desktop layout.css) */}
          <div className="sim-header">
            <h1>
              <img src="/app_icon.png" alt="" />
              Batch My Photos
            </h1>
            <p>Organize your photos into batch folders</p>
            <div className="header-actions">
              <button
                className="header-btn"
                title="Operation History"
                onClick={onShowHistory}
              >
                <History size={20} />
              </button>
              <button className="header-btn" title="Toggle theme" onClick={onToggleTheme}>
                {simTheme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
              </button>
            </div>
          </div>

          {/* Main content — each step renders here */}
          <div className={`sim-main${scrollMain ? ' scroll' : ''}`}>
            {children}
          </div>

          {/* Footer — matches desktop footer */}
          <div className="sim-footer">
            Smart file pairing keeps your RAW + JPG together &nbsp;·&nbsp;
            <a className="email-link" href="mailto:batchmyphotos@gmail.com">
              batchmyphotos@gmail.com
            </a>
          </div>
        </div>

        {/* ─── Modals (inside .sim-app so they inherit CSS variables) ── */}
        {modals}
      </div>

      {/* ─── Mobile Warning ─────────────────────────────────────────── */}
      <div className="fixed inset-0 bg-bg-main z-50 flex items-center justify-center lg:hidden p-8 text-center">
        <div>
          <h2 className="text-2xl font-bold text-white mb-4">Desktop Experience Required</h2>
          <p className="text-text-secondary mb-6">
            This interactive demo simulates a complex desktop workflow.
            Please open it on a larger screen for the full experience.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-accent transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SimulatorLayout;
