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
        const duration = settings.batchMode === 'move' ? 4000 : 7000; // move is faster
        
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
            setState(SIMULATOR_STATE.COMPLETE);
        });
    }, [photos, batches, stats, selectedFolder, settings.batchMode, simulateProgress]);

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
        settings, selectedFolder, elapsedTime,
        demoFolders: DEMO_FOLDERS,
        selectFolder, startImport, updateSettings, runBatch, cancelProcessing, reset,
    };
};