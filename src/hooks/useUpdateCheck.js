/**
 * useUpdateCheck Hook
 *
 * On mount, pings the backend via IPC to check if a newer app version
 * is available. Exposes the result + a dismiss function so the banner
 * can be hidden for the current session.
 *
 * Safe for offline use — returns updateAvailable: false on any error.
 */

import { useState, useEffect, useCallback } from 'react';

export function useUpdateCheck() {
  const [updateInfo, setUpdateInfo] = useState({
    updateAvailable: false,
    currentVersion: '',
    latestVersion: '',
    downloadUrl: '',
    releaseDate: '',
  });
  const [dismissed, setDismissed] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Only check once per app session
    if (checked) return;

    const check = async () => {
      try {
        if (!window.electronAPI?.checkAppVersion) return;

        const result = await window.electronAPI.checkAppVersion();
        if (result) {
          setUpdateInfo(result);
        }
      } catch {
        // Silently ignore — no update banner shown
      } finally {
        setChecked(true);
      }
    };

    // Small delay so the app finishes rendering first
    const timer = setTimeout(check, 3000);
    return () => clearTimeout(timer);
  }, [checked]);

  const dismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  return {
    ...updateInfo,
    dismissed,
    dismiss,
    showBanner: updateInfo.updateAvailable && !dismissed,
  };
}
