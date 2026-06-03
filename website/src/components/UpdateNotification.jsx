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
      <div className="bg-bg-main/90 backdrop-blur-xl border border-border-subtle text-text-primary p-5 rounded-2xl shadow-2xl shadow-black/50 max-w-sm w-80 ring-1 ring-border-subtle">
        
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${updateStatus.status === 'downloading' ? 'bg-primary/10 text-accent' : 'bg-primary text-white shadow-lg shadow-primary/20'}`}>
              <RefreshCw className={`w-5 h-5 ${updateStatus.status === 'downloading' ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <h3 className="font-semibold text-text-primary leading-tight">Update Available</h3>
              <p className="text-xs text-text-secondary font-medium">Version {updateStatus.version}</p>
            </div>
          </div>
          <button 
            onClick={() => setMinimized(true)} 
            className="text-text-secondary hover:text-text-primary hover:bg-bg-surface p-1 rounded-full transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="text-sm text-text-secondary mb-5 leading-relaxed">
          {updateStatus.status === 'available' && (
            <p>A new version of BatchMyPhotos is ready. Download now for the latest features.</p>
          )}
          {updateStatus.status === 'downloading' && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium text-text-secondary">
                <span>Downloading...</span>
                <span>{Math.round(updateStatus.progress || 0)}%</span>
              </div>
              <div className="w-full bg-bg-elevated rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-primary h-full rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(255,122,69,0.5)]"
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
              className="flex-1 bg-primary hover:bg-primary-hover text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/30 hover:-translate-y-0.5 transition-all flex justify-center items-center gap-2 group"
            >
              <ArrowDownCircle className="w-4 h-4 group-hover:animate-bounce" />
              Download Update
            </button>
          )}
          {updateStatus.status === 'downloaded' && (
            <button 
              onClick={installUpdate}
              className="flex-1 bg-success hover:bg-success/90 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-success/20 hover:shadow-success/30 hover:-translate-y-0.5 transition-all"
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
