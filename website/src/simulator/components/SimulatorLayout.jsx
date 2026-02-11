import React from 'react';
import { Camera, X, Minus, Square, Command, History, Sun } from 'lucide-react';
import { Link } from 'react-router-dom';
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
const SimulatorLayout = ({ children, scrollMain = false }) => {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans selection:bg-indigo-500/30">
      <div className="sim-app w-full max-w-[900px] h-[700px] bg-[#1e1e1e] rounded-xl border border-[#27272a] shadow-2xl flex flex-col overflow-hidden relative">
        
        {/* ─── macOS Title Bar ────────────────────────────────────────── */}
        <div className="h-10 bg-[#27272a] flex items-center justify-between px-4 border-b border-[#3f3f46] shrink-0 select-none">
          <div className="flex items-center space-x-2 text-slate-400 text-xs font-medium">
            <div className="flex space-x-2 mr-4">
              <div className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500 transition-colors cursor-pointer group flex items-center justify-center">
                <Link to="/" className="opacity-0 group-hover:opacity-100 text-black">
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
            <Command size={14} className="text-indigo-400" />
            <span>BatchMyPhotos - Demo Mode</span>
          </div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
            Interactive Web Demo
          </div>
        </div>

        {/* ─── Desktop App Interior ──────────────────────────────────── */}
        <div className="sim-app-inner overflow-y-auto">
          
          {/* App Header — gradient title + subtitle (matches desktop layout.css) */}
          <div className="sim-header">
            <h1>
              <Camera size={28} />
              Batch My Photos
            </h1>
            <p>Organize your photos into batch folders</p>
            <div className="header-actions">
              <button className="header-btn" title="Operation History"><History size={20} /></button>
              <button className="header-btn" title="Toggle theme"><Sun size={20} /></button>
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
      </div>

      {/* ─── Mobile Warning ─────────────────────────────────────────── */}
      <div className="fixed inset-0 bg-slate-950 z-50 flex items-center justify-center lg:hidden p-8 text-center">
        <div>
          <h2 className="text-2xl font-bold text-white mb-4">Desktop Experience Required</h2>
          <p className="text-slate-400 mb-6">
            This interactive demo simulates a complex desktop workflow.
            Please open it on a larger screen for the full experience.
          </p>
          <div className="flex flex-col gap-3 items-center">
            <Link to="/" className="text-indigo-400 underline hover:text-indigo-300 transition-colors">
              ← Back to Home
            </Link>
            <Link to="/register" className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-lg font-semibold text-sm transition-colors">
              Get the Real App Instead
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimulatorLayout;
