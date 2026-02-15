import { useState, useCallback, useEffect, useRef } from 'react';
import { generateMockPhotos, createBatches, DEMO_FOLDERS } from './mockData';
import { trackStepReached, trackSettingChanged, trackDemoCompleted, trackDemoReset } from './analytics';

export const SIMULATOR_STATE = {
    IDLE: 'idle',
    IMPORTING: 'importing',
    ANALYZING: 'analyzing',
    READY: 'ready',
    PROCESSING: 'processing',
    COMPLETE: 'complete',
};

export const useAppSimulator = () => {
    const [state, setState] = useState(SIMULATOR_STATE.IDLE);
    const [progress, setProgress] = useState(0);
    const [currentFile, setCurrentFile] = useState('');
    const [photos, setPhotos] = useState([]);
    const [groups, setGroups] = useState([]);
    const [stats, setStats] = useState(null);
    const [batches, setBatches] = useState([]);
    const [selectedFolder, setSelectedFolder] = useState(null);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [settings, setSettings] = useState({
        maxPhotos: 500,
        folderName: 'Batch Folder',
        blurEnabled: false,
        sensitivity: 'moderate',
        batchMode: 'move',
        sortBy: 'date-asc',
    });

    const cancelRef = useRef(false);
    const rafRef = useRef(null);
    const startTimeRef = useRef(null);
    const timerRef = useRef(null);

    // ─── Tick-based progress simulation using requestAnimationFrame ────
    const simulateProgress = useCallback((duration, fileNames, onTick, onComplete) => {
        setProgress(0);
        cancelRef.current = false;
        const startTime = performance.now();
        const totalFiles = fileNames.length;
        
        const tick = (now) => {
            if (cancelRef.current) {
                setProgress(0);
                setCurrentFile('');
                return;
            }
            
            const elapsed = now - startTime;
            const pct = Math.min((elapsed / duration) * 100, 100);
            const fileIdx = Math.min(Math.floor((pct / 100) * totalFiles), totalFiles - 1);
            
            setProgress(pct);
            setCurrentFile(fileNames[fileIdx] || '');
            if (onTick) onTick(pct, fileIdx);
            
            if (pct >= 100) {
                setCurrentFile('');
                if (onComplete) onComplete();
                return;
            }
            
            rafRef.current = requestAnimationFrame(tick);
        };
        
        rafRef.current = requestAnimationFrame(tick);
    }, []);

    // ─── Select a demo folder (user-triggered) ─────────────────────────
    const selectFolder = useCallback((folder) => {
        setSelectedFolder(folder);
        trackStepReached('folder_selected');
    }, []);

    // ─── Start the import/analysis simulation ──────────────────────────
    const startImport = useCallback(() => {
        if (!selectedFolder) return;
        
        trackStepReached('importing');
        setState(SIMULATOR_STATE.IMPORTING);
        
        // Phase 1: "Scanning" directory (1.5s)
        const scanFileNames = Array.from({ length: 200 }, (_, i) => 
            `Scanning directory... (${(i * Math.floor(selectedFolder.count / 200)).toLocaleString()} items found)`
        );
        
        simulateProgress(1500, scanFileNames, null, () => {
            // Phase 2: "Analyzing" photos (2.5s with file names flickering)
            trackStepReached('analyzing');
            setState(SIMULATOR_STATE.ANALYZING);
            
            // Generate the mock data
            const data = generateMockPhotos(selectedFolder, settings.sensitivity);
            
            // Use first 300 file names for the analysis flicker
            const analyzeNames = data.photos.slice(0, 300).map(p => p.name);
            
            simulateProgress(2500, analyzeNames, null, () => {
                setPhotos(data.photos);
                setGroups(data.groups);
                setStats(data.stats);
                trackStepReached('ready');
                setState(SIMULATOR_STATE.READY);
            });
        });
    }, [selectedFolder, settings.sensitivity, simulateProgress]);

    // ─── Recompute batches when settings or data change ────────────────
    useEffect(() => {
        if (state !== SIMULATOR_STATE.READY || groups.length === 0) return;
        const newBatches = createBatches(groups, settings);
        setBatches(newBatches);
    }, [settings.maxPhotos, settings.folderName, settings.sortBy, settings.blurEnabled, settings.sensitivity, groups, state]);

    const [history, setHistory] = useState([]);

    // ─── Undo State (mirrors desktop useRollback pattern) ──────────────
    const [pendingHistoryUndo, setPendingHistoryUndo] = useState(null);
    const [showHistoryUndoConfirmation, setShowHistoryUndoConfirmation] = useState(false);
    const [isRollingBack, setIsRollingBack] = useState(false);
    const [undoCompleteResult, setUndoCompleteResult] = useState(null);

    // ─── History Management ────────────────────────────────────────────
    const addToHistory = useCallback((batchedResults) => {
        if (settings.batchMode === 'copy') return; // Only track 'move' operations for history

        const newEntry = {
            operationId: Date.now().toString(),
            createdAt: new Date().toISOString(),
            sourceFolder: selectedFolder?.path || 'Demo Folder',
            totalFiles: photos.length,
            batchFolderCount: batchedResults.length,
            batchResults: batchedResults.map(b => ({ folder: b.name, fileCount: b.count })),
            maxFilesPerBatch: settings.maxPhotos,
            outputPrefix: settings.folderName,
            sortBy: settings.sortBy,
        };

        setHistory(prev => [newEntry, ...prev]);
    }, [photos, selectedFolder, settings]);

    const deleteHistory = useCallback((operationId) => {
        setHistory(prev => prev.filter(h => h.operationId !== operationId));
    }, []);

    const clearHistory = useCallback(() => {
        setHistory([]);
    }, []);

    // ─── Undo Flow (3-step: click → confirm → execute) ────────────────

    /** Step 1: User clicks Undo on a history entry → show confirmation */
    const handleHistoryUndoClick = useCallback((entry) => {
        setPendingHistoryUndo(entry);
        setShowHistoryUndoConfirmation(true);
    }, []);

    /** Step 2: User cancels the confirmation */
    const cancelHistoryUndo = useCallback(() => {
        setShowHistoryUndoConfirmation(false);
        setPendingHistoryUndo(null);
    }, []);

    /** Step 3: User confirms → simulate rollback */
    const confirmHistoryUndo = useCallback(() => {
        const entry = pendingHistoryUndo;
        if (!entry) return;

        setShowHistoryUndoConfirmation(false);
        setPendingHistoryUndo(null);
        setIsRollingBack(true);
        setState(SIMULATOR_STATE.PROCESSING);
        setProgress(0);

        // Simulate rollback progress over ~2 seconds
        const startTime = performance.now();
        const duration = 2000;

        const tick = (now) => {
            const elapsed = now - startTime;
            const pct = Math.min((elapsed / duration) * 100, 100);
            setProgress(pct);
            setCurrentFile(`Restoring file ${Math.floor((pct / 100) * entry.totalFiles)} of ${entry.totalFiles}...`);

            if (pct >= 100) {
                // Remove entry from history
                setHistory(prev => prev.filter(h => h.operationId !== entry.operationId));
                setIsRollingBack(false);
                setCurrentFile('');
                setProgress(0);
                // Show undo complete result
                setUndoCompleteResult({
                    restoredFiles: entry.totalFiles,
                    totalFiles: entry.totalFiles,
                    sourceFolder: entry.sourceFolder,
                    deletedFolders: entry.batchFolderCount,
                });
                setState(SIMULATOR_STATE.COMPLETE);
                return;
            }

            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
    }, [pendingHistoryUndo]);

    /** Clear undo complete result and return to idle */
    const clearUndoComplete = useCallback(() => {
        setUndoCompleteResult(null);
    }, []);

    /** Validate a history entry (simulated) */
    const validateHistoryEntry = useCallback(async (operationId) => {
        const entry = history.find(h => h.operationId === operationId);
        if (!entry) return { valid: false, error: 'Entry not found' };

        // Simulate async check
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    valid: true,
                    found: entry.totalFiles,
                    checked: entry.totalFiles,
                });
            }, 1500);
        });
    }, [history]);

    // ─── Run the "batch creation" processing ───────────────────────────
    const runBatch = useCallback(() => {
        trackStepReached('processing');
        setState(SIMULATOR_STATE.PROCESSING);
        startTimeRef.current = Date.now();
        setElapsedTime(0);
        
        // Timer for elapsed seconds
        timerRef.current = setInterval(() => {
            setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }, 1000);
        
        // Simulate processing with real file names
        const processingFiles = photos.slice(0, 500).map(p => p.name);
        // const duration = settings.batchMode === 'move' ? 4000 : 7000; // move is faster - ORIGINAL
        const duration = settings.batchMode === 'move' ? 2500 : 4500; // Speed up a bit for demo feel

        simulateProgress(duration, processingFiles, null, () => {
            clearInterval(timerRef.current);
            setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
            trackStepReached('complete');
            trackDemoCompleted({
                batches: batches.length,
                photos: photos.length,
                blurry: stats?.blurryCount || 0,
                folder: selectedFolder?.id,
            });
            
            // Add to history
            addToHistory(batches);
            
            setState(SIMULATOR_STATE.COMPLETE);
        });
    }, [photos, batches, stats, selectedFolder, settings.batchMode, simulateProgress, addToHistory]);

    // ─── Cancel processing ─────────────────────────────────────────────
    const cancelProcessing = useCallback(() => {
        cancelRef.current = true;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        if (timerRef.current) clearInterval(timerRef.current);
        setState(SIMULATOR_STATE.READY);
        setProgress(0);
        setCurrentFile('');
    }, []);

    // ─── Update a setting ──────────────────────────────────────────────
    const updateSettings = useCallback((newSettings) => {
        setSettings(prev => {
            const updated = { ...prev, ...newSettings };
            // Track setting changes
            Object.keys(newSettings).forEach(key => {
                trackSettingChanged(key, newSettings[key]);
            });
            return updated;
        });
    }, []);

    // ─── Regenerate data when sensitivity changes while in READY state ─
    useEffect(() => {
        if (state !== SIMULATOR_STATE.READY || !selectedFolder) return;
        const data = generateMockPhotos(selectedFolder, settings.sensitivity);
        setPhotos(data.photos);
        setGroups(data.groups);
        setStats(data.stats);
    }, [settings.sensitivity, selectedFolder, state]);

    // ─── Reset everything ──────────────────────────────────────────────
    const reset = useCallback(() => {
        cancelRef.current = true;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        if (timerRef.current) clearInterval(timerRef.current);
        setState(SIMULATOR_STATE.IDLE);
        setPhotos([]);
        setGroups([]);
        setStats(null);
        setBatches([]);
        setProgress(0);
        setCurrentFile('');
        setSelectedFolder(null);
        setElapsedTime(0);
        trackDemoReset();
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    return {
        state, progress, currentFile, photos, groups, stats, batches,
        settings, selectedFolder, elapsedTime, history,
        demoFolders: DEMO_FOLDERS,
        selectFolder, startImport, updateSettings, runBatch, cancelProcessing, reset,
        deleteHistory, clearHistory, validateHistoryEntry,
        // Undo flow
        handleHistoryUndoClick, confirmHistoryUndo, cancelHistoryUndo,
        pendingHistoryUndo, showHistoryUndoConfirmation,
        isRollingBack, undoCompleteResult, clearUndoComplete,
    };
};