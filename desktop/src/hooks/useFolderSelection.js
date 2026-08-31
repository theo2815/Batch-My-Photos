import { useState, useCallback } from 'react';
import { STATES } from '../constants/appStates';

/**
 * Hook for managing folder selection, drag-and-drop, and recent folders.
 */
export function useFolderSelection({ setAppState, setError, scanFolder }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [recentFolders, setRecentFolders] = useState([]);

  // Load recent folders on mount (called from parent useEffect)
  const loadRecentFolders = useCallback(async () => {
    if (window.electronAPI?.cleanupRecentFolders) {
      const validFolders = await window.electronAPI.cleanupRecentFolders();
      setRecentFolders(validFolders);
    } else if (window.electronAPI?.getRecentFolders) {
      const folders = await window.electronAPI.getRecentFolders();
      setRecentFolders(folders);
    }
  }, []);

  const addRecentFolder = useCallback(async (path) => {
    if (window.electronAPI?.addRecentFolder) {
      const updated = await window.electronAPI.addRecentFolder(path);
      setRecentFolders(updated);
    }
  }, []);

  const handleSelectFolder = useCallback(async () => {
    try {
      const selectedPath = await window.electronAPI.selectFolder();
      if (selectedPath) {
        await scanFolder(selectedPath);
      }
    } catch (err) {
      setError(err.message);
      setAppState(STATES.ERROR);
    }
  }, [scanFolder, setAppState, setError]);

  const handleSelectRecentFolder = useCallback(async (path) => {
    try {
      const registerResult = await window.electronAPI.registerDroppedFolder(path);
      if (registerResult.success) {
        await scanFolder(path);
      } else {
        setError(`The folder "${path.split(/[/\\]/).pop()}" no longer exists or is inaccessible.`);
        setAppState(STATES.ERROR);

        if (window.electronAPI?.getRecentFolders) {
          const currentFolders = await window.electronAPI.getRecentFolders();
          setRecentFolders(currentFolders.filter((f) => f !== path));
        }
      }
    } catch (err) {
      setError(err.message);
      setAppState(STATES.ERROR);
    }
  }, [scanFolder, setAppState, setError]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      const item = items[0];
      const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;

      if (entry && entry.isDirectory) {
        const file = e.dataTransfer.files[0];
        if (file && file.path) {
          try {
            const registerResult = await window.electronAPI.registerDroppedFolder(file.path);
            if (registerResult.success) {
              await scanFolder(file.path);
            } else {
              setError(registerResult.error || 'Failed to access the dropped folder');
              setAppState(STATES.ERROR);
            }
          } catch (err) {
            setError(err.message);
            setAppState(STATES.ERROR);
          }
        }
      } else {
        setError('Please drop a folder, not a file.');
        setAppState(STATES.ERROR);
      }
    }
  }, [scanFolder, setAppState, setError]);

  return {
    isDragOver,
    recentFolders,
    loadRecentFolders,
    addRecentFolder,
    handleSelectFolder,
    handleSelectRecentFolder,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
