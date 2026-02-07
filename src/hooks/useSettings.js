import { useState, useCallback } from 'react';

/**
 * Hook for managing batch settings (maxFilesPerBatch, outputPrefix, batchMode, sortBy, outputDir, presets).
 */
export function useSettings() {
  const [maxFilesPerBatch, setMaxFilesPerBatch] = useState('500');
  const [outputPrefix, setOutputPrefix] = useState('Batch');
  const [batchMode, setBatchMode] = useState('move');
  const [sortBy, setSortBy] = useState('name-asc');
  const [outputDir, setOutputDir] = useState(null);
  const [selectedPresetName, setSelectedPresetName] = useState('');
  const [refreshingField, setRefreshingField] = useState(null);

  const resetSettings = useCallback(() => {
    setMaxFilesPerBatch('500');
    setOutputPrefix('Batch');
    setBatchMode('move');
    setSortBy('name-asc');
    setOutputDir(null);
    setSelectedPresetName('');
    setRefreshingField(null);
  }, []);

  const handleSettingsChange = useCallback((key, value) => {
    // Handle bulk updates (object passed as first argument)
    if (typeof key === 'object' && key !== null) {
      const settings = key;
      if (settings.maxFilesPerBatch !== undefined) setMaxFilesPerBatch(settings.maxFilesPerBatch);
      if (settings.outputPrefix !== undefined) setOutputPrefix(settings.outputPrefix);
      if (settings.sortBy !== undefined) setSortBy(settings.sortBy);

      if (settings.batchMode !== undefined) {
        setBatchMode(settings.batchMode);
        if (settings.batchMode === 'move') {
          setOutputDir(null);
        }
      }

      if (settings.outputDir !== undefined) {
        setOutputDir(settings.outputDir);
      }
      return;
    }

    switch (key) {
      case 'maxFilesPerBatch':
        setMaxFilesPerBatch(value);
        setRefreshingField('maxFilesPerBatch');
        break;
      case 'outputPrefix':
        setOutputPrefix(value);
        break;
      case 'batchMode':
        setBatchMode(value);
        if (value === 'move') setOutputDir(null);
        break;
      case 'sortBy':
        setSortBy(value);
        setRefreshingField('sortBy');
        break;
      case 'outputDir':
        setOutputDir(value);
        break;
      default:
        break;
    }
  }, []);

  const handleSelectOutputFolder = useCallback(async () => {
    try {
      const selected = await window.electronAPI.selectOutputFolder();
      if (selected) setOutputDir(selected);
    } catch (err) {
      console.error('Failed to select output folder:', err);
    }
  }, []);

  return {
    maxFilesPerBatch,
    outputPrefix,
    batchMode,
    sortBy,
    outputDir,
    selectedPresetName,
    refreshingField,
    setRefreshingField,
    setSelectedPresetName,
    resetSettings,
    handleSettingsChange,
    handleSelectOutputFolder,
  };
}
