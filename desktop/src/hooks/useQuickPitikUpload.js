import { useState, useEffect, useCallback } from 'react';

/**
 * State machine for the QuickPitik Upload view. Owns every window.electronAPI.qp*
 * call; the renderer only ever sees { connected, email, name }, never a token.
 *
 * status: disconnected | connecting | ready | scanning | reviewing | uploading | done | error
 */
export function useQuickPitikUpload({ onBusyChange } = {}) {
  const [status, setStatus] = useState('disconnected');
  const [session, setSession] = useState(null);   // { email, name }
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState('');
  const [scan, setScan] = useState(null);         // qpScanFolder result
  const [selected, setSelected] = useState([]);   // ticked relPaths
  const [progress, setProgress] = useState(null); // last qp-upload-progress event
  const [error, setError] = useState(null);       // { code, message }
  const [isDragOver, setIsDragOver] = useState(false);

  const loadEvents = useCallback(async () => {
    const result = await window.electronAPI.qpListEvents();
    if (result.success) { setEvents(result.events); return; }
    if (result.authRejected) { setSession(null); setStatus('disconnected'); }
    setError({ code: result.authRejected ? 'SESSION_EXPIRED' : 'EVENTS', message: result.error });
  }, []);

  // Session on mount, and the hand-off result when the browser comes back.
  useEffect(() => {
    let alive = true;
    window.electronAPI.qpSessionStatus().then((current) => {
      if (!alive || !current.connected) return;
      setSession({ email: current.email, name: current.name });
      setStatus('ready');
      loadEvents();
    }).catch(() => {});
    const stop = window.electronAPI.onQpConnectResult((result) => {
      if (result.success) {
        setSession({ email: result.email, name: result.name });
        setError(null);
        setStatus('ready');
        loadEvents();
      } else {
        setError({ code: 'CONNECT', message: result.error });
        setStatus('disconnected');
      }
    });
    return () => { alive = false; stop(); };
  }, [loadEvents]);

  useEffect(() => {
    const stop = window.electronAPI.onQpUploadProgress((event) => {
      setProgress(event);
      if (event.phase === 'done' || event.phase === 'cancelled') setStatus('done');
      else if (event.phase === 'error') { setError(event.error); setStatus('error'); }
    });
    return stop;
  }, []);

  useEffect(() => { onBusyChange?.(status === 'uploading' || status === 'scanning'); }, [status, onBusyChange]);

  const connect = useCallback(async () => {
    setError(null);
    setStatus('connecting');
    const result = await window.electronAPI.qpConnectStart();
    if (!result.success) { setError({ code: 'CONNECT', message: result.error }); setStatus('disconnected'); }
  }, []);

  const disconnect = useCallback(async () => {
    await window.electronAPI.qpDisconnect();
    setSession(null); setEvents([]); setEventId(''); setScan(null); setSelected([]); setProgress(null); setError(null);
    setStatus('disconnected');
  }, []);

  const scanPath = useCallback(async (folderPath) => {
    setStatus('scanning'); setError(null); setProgress(null);
    const result = await window.electronAPI.qpScanFolder(folderPath);
    if (!result.success) { setError({ code: 'SCAN', message: result.error }); setStatus('ready'); return; }
    setScan(result);
    setSelected(result.folders.filter(f => f.defaultSelected && f.uploadable.count > 0).map(f => f.relPath));
    setStatus('reviewing');
  }, []);

  // selectFolder registers the path with securityManager before the scan.
  const chooseFolder = useCallback(async () => {
    const folderPath = await window.electronAPI.selectFolder();
    if (folderPath) await scanPath(folderPath);
  }, [scanPath]);

  const dropFolder = useCallback(async (folderPath) => {
    const registered = await window.electronAPI.registerDroppedFolder(folderPath);
    if (!registered.success) { setError({ code: 'SCAN', message: registered.error || 'Could not open the dropped folder.' }); return; }
    await scanPath(folderPath);
  }, [scanPath]);

  const handleDragOver = useCallback((e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback((e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); }, []);
  const handleDrop = useCallback(async (e) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
    const item = e.dataTransfer?.items?.[0];
    const entry = item?.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
    const file = e.dataTransfer?.files?.[0];
    if (entry?.isDirectory && file?.path) await dropFolder(file.path);
    else setError({ code: 'SCAN', message: 'Please drop a folder, not a file.' });
  }, [dropFolder]);

  const toggleFolder = useCallback((relPath) => {
    setSelected((prev) => (prev.includes(relPath) ? prev.filter(p => p !== relPath) : [...prev, relPath]));
  }, []);

  const startUpload = useCallback(async (folders = selected) => {
    if (!scan || !eventId || folders.length === 0) return;
    setError(null); setProgress(null); setStatus('uploading');
    const result = await window.electronAPI.qpUploadStart({ rootPath: scan.root, eventId, folders });
    if (!result.success) { setError({ code: 'UPLOAD', message: result.error }); setStatus('reviewing'); }
  }, [scan, eventId, selected]);

  const cancelUpload = useCallback(() => window.electronAPI.qpUploadCancel(), []);

  // Re-run only the folders that had failures; the server's duplicate check skips what already arrived.
  const retryFailed = useCallback(() => {
    const failed = [...new Set((progress?.failures || []).map(f => f.relPath))];
    return startUpload(failed.length > 0 ? failed : selected);
  }, [progress, selected, startUpload]);

  const reset = useCallback(() => {
    setScan(null); setSelected([]); setProgress(null); setError(null);
    setStatus(session ? 'ready' : 'disconnected');
  }, [session]);

  const selectedCount = (scan?.folders || [])
    .filter(f => selected.includes(f.relPath))
    .reduce((sum, f) => sum + f.uploadable.count, 0);

  return {
    status, session, events, eventId, setEventId, scan, selected, selectedCount, progress, error, isDragOver,
    connect, disconnect, loadEvents, chooseFolder, handleDragOver, handleDragLeave, handleDrop, toggleFolder,
    startUpload, cancelUpload, retryFailed, reset,
  };
}
