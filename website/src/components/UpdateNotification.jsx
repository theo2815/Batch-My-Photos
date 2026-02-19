import React from 'react';
import { useAutoUpdater } from '../hooks/useAutoUpdater';
import { ArrowDownCircle, RefreshCw, X } from 'lucide-react';

const UpdateNotification = () => {
  const { updateStatus, downloadUpdate, installUpdate } = useAutoUpdater();
  const [minimized, setMinimized] = React.useState(false);

  // Safely check if running in Electron
  const isElectron = typeof window !== 'undefined' && window.electronAPI;

  // Don't show anything if not in Electron (prevents website bleeding)
  if (!isElectron) return null;

  if (updateStatus.status === 'idle' || updateStatus.status === 'checking' || updateStatus.status === 'not-available' || updateStatus.status === 'error') {
    return null;
  }

  // If user dismissed/minimized
  if (minimized) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] animate-in slide-in-from-right-8 fade-in duration-500">
      <div className="bg-slate-950/90 backdrop-blur-xl border border-white/10 text-white p-5 rounded-2xl shadow-2xl shadow-black/50 max-w-sm w-80 ring-1 ring-white/5">
        
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${updateStatus.status === 'downloading' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'}`}>
              <RefreshCw className={`w-5 h-5 ${updateStatus.status === 'downloading' ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <h3 className="font-semibold text-white leading-tight">Update Available</h3>
              <p className="text-xs text-slate-400 font-medium">Version {updateStatus.version}</p>
            </div>
          </div>
          <button 
            onClick={() => setMinimized(true)} 
            className="text-slate-400 hover:text-white hover:bg-white/10 p-1 rounded-full transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="text-sm text-slate-300 mb-5 leading-relaxed">
          {updateStatus.status === 'available' && (
            <p>A new version of BatchMyPhotos is ready. Download now for the latest features.</p>
          )}
          {updateStatus.status === 'downloading' && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium text-slate-400">
                <span>Downloading...</span>
                <span>{Math.round(updateStatus.progress || 0)}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div 
                  className="bg-indigo-500 h-full rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                  style={{ width: `${updateStatus.progress || 0}%` }}
                />
              </div>
            </div>
          )}
          {updateStatus.status === 'downloaded' && (
            <p>Download complete. Restart the application to apply changes.</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          {updateStatus.status === 'available' && (
            <button 
              onClick={downloadUpdate}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 hover:-translate-y-0.5 transition-all flex justify-center items-center gap-2 group"
            >
              <ArrowDownCircle className="w-4 h-4 group-hover:animate-bounce" />
              Download Update
            </button>
          )}
          {updateStatus.status === 'downloaded' && (
            <button 
              onClick={installUpdate}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 hover:-translate-y-0.5 transition-all"
            >
              Restart & Install
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default UpdateNotification;
