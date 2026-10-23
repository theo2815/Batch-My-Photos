import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Runs the real App with a fake React whose hooks respect their dependency lists.
const r = vi.hoisted(() => ({ slots: [], cursor: 0, effects: [], dirty: false }));
vi.mock('react', () => {
  const slot = (init) => { const i = r.cursor++; if (!(i in r.slots)) r.slots[i] = init(); return r.slots[i]; };
  const changed = (old, deps) => !old || !deps || deps.some((v, i) => !Object.is(v, old[i]));
  const useState = (initial) => {
    const s = slot(() => {
      const st = { value: typeof initial === 'function' ? initial() : initial };
      st.set = (v) => { const next = typeof v === 'function' ? v(st.value) : v; if (!Object.is(next, st.value)) { st.value = next; r.dirty = true; } };
      return st;
    });
    return [s.value, s.set];
  };
  const useRef = (initial) => slot(() => ({ current: initial }));
  const useMemo = (fn, deps) => { const s = slot(() => ({})); if (changed(s.deps, deps)) { s.deps = deps; s.value = fn(); } return s.value; };
  const useCallback = (fn, deps) => useMemo(() => fn, deps);
  const useEffect = (fn, deps) => { const s = slot(() => ({})); if (changed(s.deps, deps)) { s.deps = deps; r.effects.push(() => { s.cleanup?.(); s.cleanup = fn(); }); } };
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), Component: class {}, useState, useRef, useMemo, useCallback, useEffect };
  return { default: React, ...React };
});

// Each hook returns the same objects and functions on every call, so App's effects settle.
const m = vi.hoisted(() => {
  const noop = () => {};
  return {
    settings: {
      maxFilesPerBatch: '5', outputPrefix: 'Run', batchMode: 'copy', sortBy: 'name-asc', outputDir: null,
      selectedPresetName: '', blurDetectionEnabled: true, blurSensitivity: 'moderate', blurCategories: [],
      setRefreshingField: noop, setSelectedPresetName: noop, resetSettings: noop, handleSettingsChange: noop, handleSelectOutputFolder: noop,
    },
    blur: { state: null, fns: { runBlurAnalysis: noop, resetBlurState: noop, clearAnalysisCache: noop } },
    batch: { handleExecuteBatch: vi.fn(), setShowConfirmation: noop, checkInterruptedProgress: noop, progress: {} },
    rollback: { operationHistory: [], checkInterruptedRollback: noop },
    folder: { scanFolder: null, result: { loadRecentFolders: noop, recentFolders: [] } },
    theme: { theme: 'light', toggleTheme: noop },
    update: { showBanner: false },
  };
});
vi.mock('../src/hooks/useSettings', () => ({ useSettings: () => m.settings }));
vi.mock('../src/hooks/useBlurDetection', () => ({ useBlurDetection: () => m.blur.state }));
vi.mock('../src/hooks/useBatchExecution', () => ({ useBatchExecution: () => m.batch.result }));
vi.mock('../src/hooks/useRollback', () => ({ useRollback: () => m.rollback }));
vi.mock('../src/hooks/useFolderSelection', () => ({ useFolderSelection: (args) => { m.folder.scanFolder = args.scanFolder; return m.folder.result; } }));
vi.mock('../src/hooks/useTheme', () => ({ useTheme: () => m.theme }));
vi.mock('../src/hooks/useUpdateCheck', () => ({ useUpdateCheck: () => m.update }));

import App from '../src/App.jsx';
import { ConfirmationModal } from '../src/components/Modals';

let tree;
async function settle() {
  for (let round = 0; round < 20; round++) {
    r.dirty = false; r.cursor = 0; tree = App();
    const pending = r.effects.splice(0);
    pending.forEach((fn) => fn());
    await new Promise((done) => setImmediate(done));
    if (!pending.length && !r.dirty) return tree;
  }
  throw new Error('App kept re-rendering');
}
async function ready() {
  await settle();
  const scan = m.folder.scanFolder('C:/shoot');
  await settle();
  await scan;
  return settle();
}
function nodes(node) { return !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]; }

beforeEach(() => {
  Object.assign(r, { slots: [], cursor: 0, effects: [], dirty: false });
  m.settings.blurDetectionEnabled = true;
  m.blur.state = { blurryGroups: [], isAnalyzing: false, ...m.blur.fns };
  m.batch.handleExecuteBatch.mockClear();
  m.batch.result = { handleExecuteBatch: m.batch.handleExecuteBatch, showConfirmation: false, setShowConfirmation: m.batch.setShowConfirmation, checkInterruptedProgress: m.batch.checkInterruptedProgress, progress: m.batch.progress, batchLimitExceeded: null };
  m.folder.scanFolder = null;
  vi.stubGlobal('window', { electronAPI: {
    getBlurDetectionEnabled: vi.fn().mockResolvedValue({ betaEnabled: true }),
    authCheckStatus: vi.fn().mockResolvedValue({ isAuthenticated: true, user: { email: 'tester@example.com' }, subscription: null }),
    scanFolder: vi.fn().mockResolvedValue({ success: true }),
    previewBatches: vi.fn().mockResolvedValue({ success: true, batchCount: 1, batchDetails: [] }),
  } });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('App blur wiring', () => {
  it('builds the batch preview once when the blur list changes', async () => {
    await ready();
    globalThis.window.electronAPI.previewBatches.mockClear();
    m.blur.state = { ...m.blur.state, blurryGroups: ['IMG_2'] };   // analysis finished
    await settle();
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(globalThis.window.electronAPI.previewBatches).toHaveBeenCalledTimes(1);
  });

  it('sends the flagged groups to the batch run', async () => {
    m.blur.state = { ...m.blur.state, blurryGroups: ['IMG_2'] };
    const tree = await ready();
    nodes(tree).find((n) => n.type === ConfirmationModal).props.onConfirm();
    expect(m.batch.handleExecuteBatch).toHaveBeenCalledWith(expect.objectContaining({ folderPath: 'C:/shoot', outputPrefix: 'Run', batchMode: 'copy', blurryGroups: ['IMG_2'] }));
  });

  it('sends the flagged groups to the preview', async () => {
    await ready();
    m.blur.state = { ...m.blur.state, blurryGroups: ['IMG_2'] };
    await settle();
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(globalThis.window.electronAPI.previewBatches).toHaveBeenLastCalledWith('C:/shoot', 10, 'name-asc', ['IMG_2']);
  });

  it('sends no blur list when blur detection is off', async () => {
    m.settings.blurDetectionEnabled = false;
    m.blur.state = { ...m.blur.state, blurryGroups: ['IMG_2'] };
    const tree = await ready();
    nodes(tree).find((n) => n.type === ConfirmationModal).props.onConfirm();
    expect(m.batch.handleExecuteBatch).toHaveBeenCalledWith(expect.objectContaining({ blurryGroups: null }));
    m.blur.state = { ...m.blur.state, blurryGroups: ['IMG_3'] };
    await settle();
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(globalThis.window.electronAPI.previewBatches.mock.lastCall.at(-1)).toBeNull();
  });
});
