import { useState, useEffect } from 'react';

export function useAutoUpdater() {
  const [updateStatus, setUpdateStatus] = useState({ status: 'idle' });

  useEffect(() => {
    // Debug log to confirm hook execution
    console.log('🔌 [UPDATER] Hook initialized');

    if (!window.electronAPI) {
      console.error('❌ [UPDATER] window.electronAPI is missing!');
      return;
    }

    const handleUpdateStatus = (data) => {
      console.log('📦 [UPDATER] Status received:', data);
      setUpdateStatus(data);
    };

    // Use the specific API exposed in preload.js
    const unsubscribe = window.electronAPI.onUpdateStatus(handleUpdateStatus);

    return () => {
      unsubscribe();
    };
  }, []);

  const checkForUpdates = () => {
    if (window.electronAPI) {
      console.log('🔍 [UPDATER] Checking for updates...');
      window.electronAPI.checkForUpdates();
    }
  };

  const downloadUpdate = () => {
    if (window.electronAPI) {
      console.log('⬇️ [UPDATER] Downloading update...');
      window.electronAPI.downloadUpdate();
    }
  };

  const installUpdate = () => {
    if (window.electronAPI) {
      console.log('🔄 [UPDATER] Installing update...');
      window.electronAPI.installUpdate();
    }
  };

  return {
    updateStatus,
    checkForUpdates,
    downloadUpdate,
    installUpdate
  };
}
