import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckCircle } from 'lucide-react';

// Same Node-only element approach as blurAdvisoryModal; retain hook state across interactions.
const hooks = vi.hoisted(() => ({ values: [], cursor: 0, effects: [], deps: [], cleanups: [] }));
vi.mock('react', () => {
  const useState = initial => {
    const i = hooks.cursor++;
    const values = hooks.values;
    if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial;
    return [values[i], value => { values[i] = typeof value === 'function' ? value(values[i]) : value; }];
  };
  const useRef = initial => useState(() => ({ current: initial }))[0];
  const useEffect = (fn, deps) => {
    const i = hooks.cursor++;
    if (!hooks.deps[i] || deps.some((value, j) => value !== hooks.deps[i][j])) {
      hooks.effects.push(() => { hooks.cleanups[i]?.(); hooks.cleanups[i] = fn(); });
      hooks.deps[i] = deps;
    }
  };
  const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useRef };
  return { default: react, useState, useRef, useEffect, useCallback: fn => fn, useMemo: fn => fn() };
});

import ImagePreviewModal from '../src/components/Modals/ImagePreviewModal.jsx';
import BatchPreview from '../src/components/PreviewPanel/BatchPreview.jsx';
import SettingsPanel from '../src/components/PreviewPanel/SettingsPanel.jsx';
import { ConfirmDialog } from '../src/components/Modals';
import StatsGrid from '../src/components/PreviewPanel/StatsGrid.jsx';
import PreviewPanel from '../src/components/PreviewPanel/PreviewPanel.jsx';
import { useBlurDetection } from '../src/hooks/useBlurDetection.js';
import CompleteCard from '../src/components/StatusCards/CompleteCard.jsx';

function render(component, props) { hooks.cursor = 0; return component(props); }
// The parent hook outlives each modal instance; resetting modal hooks truly discards its state.
let feedbackHooks;
function renderPreview(props) {
  const modalHooks = { ...hooks };
  Object.assign(hooks, feedbackHooks);
  const feedback = render(useBlurDetection, { folderPath: props.folderPath, isBeta: props.isBeta });
  Object.assign(feedbackHooks, hooks);
  Object.assign(hooks, modalHooks);
  return render(ImagePreviewModal, { ...props, getSubmission: feedback.getSubmission,
    onSubmit: feedback.submitExample,
    onLabel: (file, label) => { feedback.setLabel(file, label); props.onLabel?.(file, label); } });
}
async function effects() { const pending = hooks.effects.splice(0); pending.forEach(fn => fn()); await Promise.resolve(); await Promise.resolve(); }
function nodes(node) { return !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]; }
function text(node) { return typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : ''; }
function button(tree, label) { return nodes(tree).find(n => n.type === 'button' && text(n) === label); }

const info = { 'flagged.jpg': { baseName: 'flagged', score: 0.8, predictedClass: 'motion_blurred', isBlurry: true }, 'missed.jpg': { baseName: 'missed', score: 0.1, predictedClass: 'sharp', isBlurry: false } };
const props = { isOpen: true, isBeta: true, folderPath: 'C:/fixture', fileName: 'flagged.jpg', fileList: Object.keys(info), blurInfoMap: info, labels: new Map(), onClose: vi.fn() };

beforeEach(() => {
  hooks.values = []; hooks.cursor = 0; hooks.effects = []; hooks.deps = []; hooks.cleanups = [];
  feedbackHooks = { values: [], cursor: 0, effects: [], deps: [], cleanups: [] };
  vi.stubGlobal('window', { electronAPI: { submitBlurExample: vi.fn().mockResolvedValue({ success: true }), getImagePreview: vi.fn().mockResolvedValue({ success: true, dataUrl: 'data:image/jpeg;base64,test', width: 512, height: 512, contentHash: 'a'.repeat(64) }), blurBetaKey: vi.fn().mockResolvedValue({ enabled: true, configured: false }), getBlurDetectionEnabled: vi.fn().mockResolvedValue(true), cancelBlurAnalysis: vi.fn().mockResolvedValue({ success: true }) }, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('document', { activeElement: { focus: vi.fn() }, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

describe('explicit beta feedback consent', () => {
  it('labels locally, survives close/reopen, then submits exactly the displayed analyzed file', async () => {
    const labels = new Map();
    const p = { ...props, labels, onLabel: (file, label) => labels.set(file, label) };
    let tree = renderPreview(p);
    await effects(); tree = renderPreview(p);
    expect(button(tree, 'Sharp')).toBeDefined();
    expect(button(tree, 'Submit this example').props.disabled).toBe(true);
    button(tree, 'Sharp').props.onClick();
    renderPreview({ ...p, isOpen: false }); await effects();
    tree = renderPreview(p); await effects(); tree = renderPreview(p);
    expect(button(tree, 'Sharp').props['aria-pressed']).toBe(true);
    expect(globalThis.window.electronAPI.submitBlurExample).not.toHaveBeenCalled();
    expect(text(tree)).toMatch(/private/i);
    expect(text(tree)).toMatch(/30 days/i);
    expect(text(tree)).toMatch(/improve blur detection/i);
    expect(text(tree)).toContain('flagged.jpg');
    await button(tree, 'Submit this example').props.onClick();
    expect(globalThis.window.electronAPI.submitBlurExample).toHaveBeenCalledWith({ folderPath: 'C:/fixture', fileName: 'flagged.jpg', label: 'sharp', displayedHash: 'a'.repeat(64) });
    expect(text(renderPreview(p))).toMatch(/submitted/i);
  });

  it('allows a model-sharp miss, shows progress, and offers an explicit retry after failure', async () => {
    const p = { ...props, fileName: 'missed.jpg', labels: new Map([['missed.jpg', 'blurry']]), onLabel: vi.fn() };
    let finish;
    globalThis.window.electronAPI.submitBlurExample.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    let tree = renderPreview(p); await effects(); tree = renderPreview(p);
    const request = button(tree, 'Submit this example').props.onClick();
    tree = renderPreview(p);
    expect(text(tree)).toMatch(/submitting/i);
    finish({ success: false, error: 'Could not save this example. Please sign in and try again.' }); await request;
    tree = renderPreview(p);
    expect(nodes(tree).find(n => n.props.role === 'alert')).toBeDefined();
    expect(globalThis.window.electronAPI.submitBlurExample).toHaveBeenCalledTimes(1);
    await button(tree, 'Submit this example').props.onClick();
    expect(globalThis.window.electronAPI.submitBlurExample).toHaveBeenLastCalledWith({ folderPath: 'C:/fixture', fileName: 'missed.jpg', label: 'blurry', displayedHash: 'a'.repeat(64) });
  });

  it('keeps the local label after a rejected upload promise and permits retry', async () => {
    const p = { ...props, labels: new Map([['flagged.jpg', 'sharp']]), onLabel: vi.fn() };
    globalThis.window.electronAPI.submitBlurExample.mockRejectedValueOnce(new Error('offline'));
    renderPreview(p); await effects();
    await button(renderPreview(p), 'Submit this example').props.onClick();
    const tree = renderPreview(p);
    expect(text(tree)).toContain('Check your connection');
    expect(button(tree, 'Sharp').props['aria-pressed']).toBe(true);
    expect(button(tree, 'Submit this example').props.disabled).toBe(false);
    await button(tree, 'Submit this example').props.onClick();
    expect(text(renderPreview(p))).toContain('Example submitted');
  });

  it('keeps a deferred submission across an actual modal unmount and reopen', async () => {
    const p = { ...props, labels: new Map([['flagged.jpg', 'sharp']]), onLabel: vi.fn() };
    let finish;
    globalThis.window.electronAPI.submitBlurExample.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    renderPreview(p); await effects();
    const submit = button(renderPreview(p), 'Submit this example');
    const pending = submit.props.onClick();
    await submit.props.onClick(); // Same-render rapid repeat must also be blocked synchronously.
    expect(globalThis.window.electronAPI.submitBlurExample).toHaveBeenCalledTimes(1);
    hooks.cleanups.forEach(cleanup => cleanup?.());
    hooks.values = []; hooks.deps = []; hooks.cleanups = []; hooks.effects = [];
    renderPreview(p); await effects();
    let reopened = renderPreview(p);
    expect(button(reopened, 'Submitting...')?.props.disabled).toBe(true);
    expect(globalThis.window.electronAPI.submitBlurExample).toHaveBeenCalledTimes(1);
    finish({ success: true }); await pending;
    reopened = renderPreview(p);
    expect(text(reopened)).toContain('Example submitted');
    expect(button(reopened, 'Submit this example').props.disabled).toBe(true);
  });

  it('isolates submission status for identical filenames in different folders', async () => {
    const p = { folderPath: 'C:/first', isBeta: true };
    let finish;
    globalThis.window.electronAPI.submitBlurExample.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = render(useBlurDetection, p).submitExample('same.jpg', 'sharp');
    expect(render(useBlurDetection, { ...p, folderPath: 'C:/second' }).getSubmission('same.jpg')).toBeUndefined();
    expect(render(useBlurDetection, p).getSubmission('same.jpg').status).toBe('pending');
    finish({ success: false, error: 'Try again' }); await pending;
    expect(render(useBlurDetection, { ...p, folderPath: 'C:/second' }).getSubmission('same.jpg')).toBeUndefined();
    expect(render(useBlurDetection, p).getSubmission('same.jpg')).toEqual({ status: 'error', error: 'Try again' });
  });

  it('shows a recoverable beta key status error and retries without exposing a key', async () => {
    globalThis.window.electronAPI.blurBetaKey.mockRejectedValueOnce(new Error('private implementation detail'));
    render(SettingsPanel, { isBeta: true }); await effects();
    const tree = render(SettingsPanel, { isBeta: true });
    expect(text(tree)).toContain('Could not check the beta key');
    expect(text(tree)).not.toContain('private implementation detail');
    expect(nodes(tree).some(n => n.type === 'input' && n.props.type === 'password')).toBe(false);
    await button(tree, 'Retry key status').props.onClick();
    const retried = render(SettingsPanel, { isBeta: true });
    expect(nodes(retried).some(n => n.type === 'input' && n.props.type === 'password')).toBe(true);
    expect(text(retried)).not.toContain('Could not check the beta key');
    expect(globalThis.window.electronAPI.blurBetaKey).toHaveBeenCalledTimes(2);
    expect(globalThis.window.electronAPI.blurBetaKey).toHaveBeenLastCalledWith();
  });

  it('keeps the blur switch off until a beta key is saved', async () => {
    const blurSwitch = tree => nodes(tree).find(n => n.type === 'input' && n.props.role === 'switch');
    render(SettingsPanel, { isBeta: true }); await effects();
    expect(blurSwitch(render(SettingsPanel, { isBeta: true })).props.disabled).toBe(true);
    hooks.values = []; hooks.deps = []; hooks.effects = [];
    globalThis.window.electronAPI.blurBetaKey.mockResolvedValue({ enabled: true, configured: true });
    render(SettingsPanel, { isBeta: true }); await effects();
    expect(blurSwitch(render(SettingsPanel, { isBeta: true })).props.disabled).toBe(false);
  });

  it('hides key setup outside beta', async () => {
    globalThis.window.electronAPI.blurBetaKey.mockResolvedValue({ enabled: false, configured: false });
    render(SettingsPanel, {}); await effects();
    expect(nodes(render(SettingsPanel, {})).some(n => n.type === 'input' && n.props.type === 'password')).toBe(false);
  });

  it('does not expose feedback controls for a RAW sibling or outside beta', () => {
    expect(button(renderPreview({ ...props, isBeta: false }), 'Sharp')).toBeUndefined();
    hooks.values = [];
    expect(button(renderPreview({ ...props, fileName: 'flagged.CR3' }), 'Sharp')).toBeUndefined();
  });

  it('maps exact analyzed files into ordinary batch previews, including sharp predictions', () => {
    const blurResults = Object.fromEntries(Object.entries(info).map(([file, result]) => [result.baseName, { ...result, analyzedFile: file }]));
    const tree = render(BatchPreview, { batchDetails: [{ batchNumber: 1, fileCount: 3, allFiles: ['flagged.jpg', 'flagged.CR3', 'missed.jpg'] }], expandedBatch: 1, folderPath: 'C:/fixture', blurDetection: { isBeta: true, blurResults, labels: new Map(), setLabel: vi.fn() } });
    const preview = nodes(tree).find(n => n.type === 'button' && n.props['aria-label'] === 'Preview missed.jpg');
    preview.props.onClick();
    const modal = nodes(render(BatchPreview, { batchDetails: [{ batchNumber: 1, fileCount: 3, allFiles: ['flagged.jpg', 'flagged.CR3', 'missed.jpg'] }], expandedBatch: 1, folderPath: 'C:/fixture', blurDetection: { isBeta: true, blurResults, labels: new Map(), setLabel: vi.fn() } })).find(n => n.type === ImagePreviewModal);
    expect(modal.props.blurInfoMap['missed.jpg'].predictedClass).toBe('sharp');
    expect(modal.props.blurInfoMap['flagged.CR3']).toBeUndefined();
    expect(nodes(tree).filter(n => n.type === 'button' && n.props['aria-label']?.startsWith('Preview '))).toHaveLength(3);
  });

  it('explains offline analysis without disabling normal batching', () => {
    const state = { aiUnavailable: true, blurryGroups: [], blurResults: null, unflaggedGroups: new Set() };
    const tree = render(BatchPreview, { batchDetails: [{ batchNumber: 1, fileCount: 1, allFiles: ['missed.jpg'] }], blurDetectionEnabled: true, blurDetection: state });
    const section = nodes(tree).find(n => n.type?.name === 'BlurryPhotosSection');
    hooks.values = [];
    const notice = render(section.type, section.props);
    expect(notice.props.role).toBe('status');
    expect(text(notice)).toContain('You can still batch your photos');
  });

  it('says it is waiting for the blur service while the service is busy', () => {
    const section = progress => {
      const state = { isAnalyzing: true, blurProgress: progress, blurryGroups: [], blurResults: null, unflaggedGroups: new Set() };
      const tree = render(BatchPreview, { batchDetails: [{ batchNumber: 1, fileCount: 1, allFiles: ['missed.jpg'] }], blurDetectionEnabled: true, blurDetection: state });
      const node = nodes(tree).find(n => n.type?.name === 'BlurryPhotosSection');
      hooks.values = [];
      return text(render(node.type, node.props));
    };
    expect(section({ current: 0, total: 2, waiting: true })).toContain('Waiting for the blur service…');
    expect(section({ current: 1, total: 2 })).toContain('Analyzing image quality...');
    expect(section({ current: 1, total: 2 })).not.toContain('Waiting for the blur service');
  });

  it('shows Cancel while analysing and cancels through the blur hook', () => {
    const cancelAnalysis = vi.fn();
    const state = { isAnalyzing: true, blurProgress: { current: 0, total: 2 }, blurryGroups: [], blurResults: null, unflaggedGroups: new Set(), cancelAnalysis };
    const tree = render(BatchPreview, { batchDetails: [{ batchNumber: 1, fileCount: 1, allFiles: ['missed.jpg'] }], blurDetectionEnabled: true, blurDetection: state });
    const node = nodes(tree).find(n => n.type?.name === 'BlurryPhotosSection');
    hooks.values = [];
    button(render(node.type, node.props), 'Cancel').props.onClick();
    expect(cancelAnalysis).toHaveBeenCalledTimes(1);
  });

  it('cancel ends the analysis quietly, then a new analysis can start', async () => {
    const p = { folderPath: 'C:/fixture', blurDetectionEnabled: true, blurSensitivity: 'moderate', isBeta: true };
    let finishOld;
    globalThis.window.electronAPI.analyzeBlur = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
      .mockResolvedValueOnce({ success: true, blurResults: { NEW: { predictedClass: 'sharp' } } });
    globalThis.window.electronAPI.cancelBlurAnalysis = vi.fn().mockResolvedValue({ success: true });
    const old = render(useBlurDetection, p).runBlurAnalysis();
    expect(render(useBlurDetection, p).isAnalyzing).toBe(true);
    render(useBlurDetection, p).cancelAnalysis();
    expect(globalThis.window.electronAPI.cancelBlurAnalysis).toHaveBeenCalledTimes(1);
    expect(render(useBlurDetection, p).isAnalyzing).toBe(false);
    finishOld({ success: false, aiUnavailable: true, error: 'cancelled' });
    await old;
    let state = render(useBlurDetection, p);
    expect([state.blurResults, state.aiUnavailable, state.isAnalyzing]).toEqual([null, false, false]);
    await state.runBlurAnalysis();
    state = render(useBlurDetection, p);
    expect(state.blurResults).toEqual({ NEW: { predictedClass: 'sharp' } });
  });

  it.each([
    ['RAW-only', { RAW1: { score: -1, isBlurry: false }, RAW2: { score: -1, isBlurry: false } }, ['RAW1.CR3', 'RAW2.CR3'], 'No blur results available', '0 groups analyzed · 2 could not be analyzed'],
    ['mixed', { A: { score: 0.8, isBlurry: true, analyzedFile: 'A.jpg' }, B: { score: 0.1, isBlurry: false, analyzedFile: 'B.jpg' }, RAW: { score: -1, isBlurry: false } }, ['A.jpg', 'A.CR3', 'B.jpg', 'RAW.CR3'], 'Blur suggestions (1 groups)', '2 groups analyzed · 1 could not be analyzed'],
    ['analyzed without suggestions', { A: { score: 0.1, isBlurry: false, analyzedFile: 'A.jpg' } }, ['A.jpg', 'A.CR3'], 'No blur suggestions', '1 group analyzed · 0 could not be analyzed'],
  ])('shows %s coverage while preserving ordinary batch controls', async (_case, blurResults, allFiles, heading, coverage) => {
    const p = { folderPath: 'C:/fixture', blurDetectionEnabled: true, blurSensitivity: 'moderate' };
    globalThis.window.electronAPI.analyzeBlur = vi.fn().mockResolvedValue({ success: true, blurResults, totalAnalyzed: 999 });
    await render(useBlurDetection, p).runBlurAnalysis();
    const blurDetection = render(useBlurDetection, p);
    hooks.values = []; hooks.deps = []; hooks.cleanups = []; hooks.effects = [];
    const tree = render(BatchPreview, { batchDetails: [{ batchNumber: 1, fileCount: allFiles.length, allFiles }], outputPrefix: 'Batch', expandedBatch: null, onToggleBatch: vi.fn(), folderPath: 'C:/fixture', blurDetectionEnabled: true, blurDetection });
    const section = nodes(tree).find(n => n.type?.name === 'BlurryPhotosSection');
    hooks.values = []; hooks.deps = []; hooks.cleanups = []; hooks.effects = [];
    const advisory = render(section.type, section.props);
    expect(text(advisory)).toContain(heading);
    const status = nodes(advisory).find(n => n.props.role === 'status' && text(n).includes(coverage));
    expect(status).toBeDefined();
    expect(status.props.className).toBe('blurry-coverage-note');
    expect(text(tree)).toContain(`${allFiles.length} files`);
    const batchButton = nodes(tree).find(n => n.type === 'button' && n.props.className?.includes('batch-header'));
    expect(batchButton).toBeDefined();
    expect(batchButton.props.onClick).toBeTypeOf('function');
    if (_case === 'RAW-only') expect(text(advisory)).not.toContain('No blur suggestions');
  });

  it('does not show success icons when one analyzed group has no suggestions and one group is unknown', async () => {
    const p = { folderPath: 'C:/fixture', blurDetectionEnabled: true, blurSensitivity: 'moderate' };
    globalThis.window.electronAPI.analyzeBlur = vi.fn().mockResolvedValue({ success: true, blurResults: {
      A: { score: 0.1, isBlurry: false, analyzedFile: 'A.jpg' },
      RAW: { score: -1, isBlurry: false },
    } });
    await render(useBlurDetection, p).runBlurAnalysis();
    const blurDetection = render(useBlurDetection, p);
    hooks.values = []; hooks.deps = []; hooks.cleanups = []; hooks.effects = [];
    const tree = render(BatchPreview, { batchDetails: [{ batchNumber: 1, fileCount: 3, allFiles: ['A.jpg', 'A.CR3', 'RAW.CR3'] }], outputPrefix: 'Batch', expandedBatch: null, onToggleBatch: vi.fn(), folderPath: 'C:/fixture', blurDetectionEnabled: true, blurDetection });
    const section = nodes(tree).find(n => n.type?.name === 'BlurryPhotosSection');
    hooks.values = []; hooks.deps = []; hooks.cleanups = []; hooks.effects = [];
    let advisory = render(section.type, section.props);
    expect(text(advisory)).toContain('1 group analyzed · 1 could not be analyzed');
    expect(text(advisory)).toContain('No blur suggestions');
    expect(nodes(advisory).filter(n => n.type === CheckCircle)).toHaveLength(0);
    nodes(advisory).find(n => n.type === 'button').props.onClick();
    advisory = render(section.type, section.props);
    expect(text(advisory)).toContain('No blur suggestions for this analysis.');
    expect(nodes(advisory).filter(n => n.type === CheckCircle)).toHaveLength(0);
    expect(nodes(advisory).find(n => n.props.className?.includes('blurry-empty'))?.props.className)
      .toBe('blurry-empty blurry-empty-unknown');
    expect(text(tree)).toContain('3 files');
  });

  it('keeps service failure distinct from per-group unknown results', async () => {
    const p = { folderPath: 'C:/fixture', blurDetectionEnabled: true, blurSensitivity: 'moderate' };
    globalThis.window.electronAPI.analyzeBlur = vi.fn().mockResolvedValue({ success: false, aiUnavailable: true });
    await render(useBlurDetection, p).runBlurAnalysis();
    const blurDetection = render(useBlurDetection, p);
    hooks.values = []; hooks.deps = []; hooks.cleanups = []; hooks.effects = [];
    const tree = render(BatchPreview, { batchDetails: [{ batchNumber: 1, fileCount: 1, allFiles: ['A.CR3'] }], outputPrefix: 'Batch', expandedBatch: null, onToggleBatch: vi.fn(), folderPath: 'C:/fixture', blurDetectionEnabled: true, blurDetection });
    const section = nodes(tree).find(n => n.type?.name === 'BlurryPhotosSection');
    hooks.values = []; hooks.deps = []; hooks.cleanups = []; hooks.effects = [];
    const advisory = render(section.type, section.props);
    expect(text(advisory)).toContain('Blur analysis is unavailable');
    expect(text(advisory)).not.toContain('could not be analyzed');
    expect(text(advisory)).toContain('You can still batch your photos');
    expect(text(tree)).toContain('1 files');
  });

  it('clears labels at reanalysis and folder reset, including an unavailable AI response', async () => {
    const p = { folderPath: 'C:/fixture', blurDetectionEnabled: true, blurSensitivity: 'moderate', isBeta: true };
    let state = render(useBlurDetection, p);
    expect(state.setLabel).toBeTypeOf('function');
    state.setLabel('missed.jpg', 'blurry'); state = render(useBlurDetection, p);
    expect(state.labels.get('missed.jpg')).toBe('blurry');
    globalThis.window.electronAPI.analyzeBlur = vi.fn().mockResolvedValue({ success: false, aiUnavailable: true });
    await state.runBlurAnalysis(); state = render(useBlurDetection, p);
    expect(state.labels.size).toBe(0); expect(state.aiUnavailable).toBe(true);
    state.setLabel('missed.jpg', 'blurry'); state.resetBlurState();
    expect(render(useBlurDetection, { ...p, folderPath: 'C:/next' }).labels.size).toBe(0);
    expect(globalThis.window.electronAPI.submitBlurExample).not.toHaveBeenCalled();
  });

  it('saves the beta key once and clears the password field', async () => {
    const p = { isBeta: true, maxFilesPerBatch: 10, outputPrefix: 'Batch', batchMode: 'copy' };
    render(SettingsPanel, p); await effects();
    let tree = render(SettingsPanel, p);
    const input = nodes(tree).find(n => n.type === 'input' && n.props.type === 'password');
    expect(input).toBeDefined();
    input.props.onChange({ target: { value: 'test-beta-key' } });
    globalThis.window.electronAPI.blurBetaKey.mockResolvedValue({ enabled: true, configured: true });
    tree = render(SettingsPanel, p); await button(tree, 'Save beta key').props.onClick();
    expect(globalThis.window.electronAPI.blurBetaKey).toHaveBeenLastCalledWith('test-beta-key');
    expect(nodes(render(SettingsPanel, p)).find(n => n.type === 'input' && n.props.type === 'password')).toBeUndefined();
  });
  it('shows the typed beta key only on request and hides it again after saving', async () => {
    const p = { isBeta: true };
    const field = tree => nodes(tree).find(n => n.type === 'input' && n.props.id === 'blur-beta-key');
    const eye = tree => nodes(tree).find(n => n.type === 'button' && /beta key$/.test(n.props['aria-label'] || ''));
    render(SettingsPanel, p); await effects();
    let tree = render(SettingsPanel, p);
    expect(field(tree).props.type).toBe('password');
    expect(eye(tree).props['aria-label']).toBe('Show beta key');
    eye(tree).props.onClick();
    tree = render(SettingsPanel, p);
    expect(field(tree).props).toMatchObject({ type: 'text', spellCheck: false });
    expect(eye(tree).props['aria-label']).toBe('Hide beta key');
    field(tree).props.onChange({ target: { value: 'test-beta-key' } });
    globalThis.window.electronAPI.blurBetaKey.mockResolvedValue({ enabled: true, configured: true });
    await button(render(SettingsPanel, p), 'Save beta key').props.onClick();
    button(render(SettingsPanel, p), 'Replace beta key').props.onClick();
    expect(field(render(SettingsPanel, p)).props.type).toBe('password');
  });
  it('shows why a key was not saved, keeps what was typed, and keeps blur locked', async () => {
    const p = { isBeta: true };
    const field = tree => nodes(tree).find(n => n.type === 'input' && n.props.id === 'blur-beta-key');
    const blurSwitch = tree => nodes(tree).find(n => n.type === 'input' && n.props.role === 'switch');
    render(SettingsPanel, p); await effects();
    field(render(SettingsPanel, p)).props.onChange({ target: { value: 'wrong-key' } });
    globalThis.window.electronAPI.blurBetaKey.mockResolvedValue(
      { enabled: true, configured: false, error: 'This beta key was not accepted. Check it and try again.' });
    await button(render(SettingsPanel, p), 'Save beta key').props.onClick();
    const tree = render(SettingsPanel, p);
    expect(text(tree)).toContain('This beta key was not accepted');
    expect(field(tree).props.value).toBe('wrong-key');
    expect(blurSwitch(tree).props.disabled).toBe(true);
  });
  it('turns blur off whenever no beta key is saved (a preset, or a key the server rejected)', async () => {
    const onChange = vi.fn();
    const p = { isBeta: true, blurDetectionEnabled: true, onChange };
    render(SettingsPanel, p); await effects();
    render(SettingsPanel, p); await effects();
    expect(onChange).toHaveBeenCalledWith('blurDetectionEnabled', false);
    expect(text(render(SettingsPanel, p))).toContain('needs a valid beta key');
    hooks.values = []; hooks.deps = []; hooks.effects = []; onChange.mockClear();
    globalThis.window.electronAPI.blurBetaKey.mockResolvedValue({ enabled: true, configured: true });
    render(SettingsPanel, p); await effects();
    render(SettingsPanel, p); await effects();
    expect(onChange).not.toHaveBeenCalled();
  });
  it('checks the key again when an analysis ends, so a rejected key locks blur', async () => {
    const calls = () => globalThis.window.electronAPI.blurBetaKey.mock.calls.length;
    // This harness re-runs the mount check on every effects() call, so compare increments.
    render(SettingsPanel, { isBeta: true, isAnalyzingBlur: true }); await effects();
    render(SettingsPanel, { isBeta: true, isAnalyzingBlur: true }); await effects();
    const steady = calls();
    render(SettingsPanel, { isBeta: true, isAnalyzingBlur: true }); await effects();
    const perRender = calls() - steady;
    render(SettingsPanel, { isBeta: true, isAnalyzingBlur: false }); await effects();
    expect(calls() - steady - perRender).toBe(perRender + 1);
  });
  it('reloads the selected beta preview when a new analysis replaces results', async () => {
    const firstVersion = {};
    renderPreview({ ...props, previewVersion: firstVersion }); await effects();
    expect(globalThis.window.electronAPI.getImagePreview).toHaveBeenCalledTimes(1);
    renderPreview({ ...props, previewVersion: {} }); await effects();
    expect(globalThis.window.electronAPI.getImagePreview).toHaveBeenCalledTimes(2);
  });
  it('does not treat a replacement image as already submitted at the same filename', async () => {
    const p = { folderPath: 'C:/fixture', isBeta: true };
    await render(useBlurDetection, p).submitExample('same.jpg', 'sharp', 'a'.repeat(64));
    expect(render(useBlurDetection, p).getSubmission('same.jpg', 'a'.repeat(64)).status).toBe('success');
    expect(render(useBlurDetection, p).getSubmission('same.jpg', 'b'.repeat(64))).toBeUndefined();
  });

  it('a folder change, blur off or Reset also stops a running analysis in main', async () => {
    const p = { folderPath: 'C:/fixture', blurDetectionEnabled: true, blurSensitivity: 'moderate', isBeta: true };
    let finishOld;
    globalThis.window.electronAPI.analyzeBlur = vi.fn(() => new Promise(resolve => { finishOld = resolve; }));
    const old = render(useBlurDetection, p).runBlurAnalysis();
    render(useBlurDetection, p).resetBlurState();
    expect(globalThis.window.electronAPI.cancelBlurAnalysis).toHaveBeenCalledTimes(1);
    finishOld({ success: false, error: 'cancelled' });
    await old;
    render(useBlurDetection, p).resetBlurState();
    expect(globalThis.window.electronAPI.cancelBlurAnalysis).toHaveBeenCalledTimes(1);
  });

  it('queues a restart after toggle reset until the old main request settles', async () => {
    const p = { folderPath: 'C:/fixture', blurDetectionEnabled: true, blurSensitivity: 'moderate', isBeta: true };
    let finishOld;
    globalThis.window.electronAPI.analyzeBlur = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
      .mockResolvedValueOnce({ success: true, blurResults: { NEW: { predictedClass: 'sharp' } } });
    const old = render(useBlurDetection, p).runBlurAnalysis();
    render(useBlurDetection, p).resetBlurState();
    const restarted = render(useBlurDetection, p).runBlurAnalysis();
    expect(globalThis.window.electronAPI.analyzeBlur).toHaveBeenCalledTimes(1);
    finishOld({ success: true, blurResults: { OLD: { predictedClass: 'sharp' } } });
    await old;
    await restarted;
    expect(globalThis.window.electronAPI.analyzeBlur).toHaveBeenCalledTimes(2);
    expect(render(useBlurDetection, p).blurResults).toEqual({ NEW: { predictedClass: 'sharp' } });
  });
  it('runs later queued Start Analysis choices after an obsolete request settles', async () => {
    const p = { folderPath: 'C:/fixture', blurDetectionEnabled: true, blurSensitivity: 'moderate', isBeta: true };
    let finishOld, finishStrict;
    globalThis.window.electronAPI.analyzeBlur = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { finishStrict = resolve; }))
      .mockResolvedValueOnce({ success: true, blurResults: { LENIENT: { predictedClass: 'sharp' } } });
    const old = render(useBlurDetection, p).runBlurAnalysis();
    render(useBlurDetection, p).resetBlurState();
    const strict = render(useBlurDetection, { ...p, blurSensitivity: 'strict' }).runBlurAnalysis();
    const lenient = render(useBlurDetection, { ...p, blurSensitivity: 'lenient' }).runBlurAnalysis();
    finishOld({ success: true, blurResults: { OLD: { predictedClass: 'sharp' } } });
    await old;
    await Promise.resolve();
    expect(globalThis.window.electronAPI.analyzeBlur.mock.calls.map(([, sensitivity]) => sensitivity))
      .toEqual(['moderate', 'strict']);
    finishStrict({ success: true, blurResults: { STRICT: { predictedClass: 'sharp' } } });
    await Promise.all([strict, lenient]);
    expect(globalThis.window.electronAPI.analyzeBlur.mock.calls.map(([, sensitivity]) => sensitivity))
      .toEqual(['moderate', 'strict', 'lenient']);
    expect(render(useBlurDetection, { ...p, blurSensitivity: 'lenient' }).blurResults)
      .toEqual({ LENIENT: { predictedClass: 'sharp' } });
  });
  it.each(['disabled', 'folder changed'])(
    'cancels a later queued start when blur is %s after the first queued start begins', async change => {
      const p = { folderPath: 'C:/fixture', blurDetectionEnabled: true, blurSensitivity: 'moderate', isBeta: true };
      let finishOld, finishStrict;
      globalThis.window.electronAPI.analyzeBlur = vi.fn()
        .mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
        .mockImplementationOnce(() => new Promise(resolve => { finishStrict = resolve; }))
        .mockResolvedValueOnce({ success: true, blurResults: { STALE: { predictedClass: 'sharp' } } });
      const old = render(useBlurDetection, p).runBlurAnalysis();
      render(useBlurDetection, p).resetBlurState();
      const strict = render(useBlurDetection, { ...p, blurSensitivity: 'strict' }).runBlurAnalysis();
      const lenient = render(useBlurDetection, { ...p, blurSensitivity: 'lenient' }).runBlurAnalysis();
      finishOld({ success: true, blurResults: { OLD: { predictedClass: 'sharp' } } });
      await old;
      await Promise.resolve();
      const current = change === 'disabled'
        ? { ...p, blurDetectionEnabled: false }
        : { ...p, folderPath: 'C:/next' };
      render(useBlurDetection, current).resetBlurState();
      finishStrict({ success: true, blurResults: { STRICT: { predictedClass: 'sharp' } } });
      await Promise.all([strict, lenient]);
      expect(globalThis.window.electronAPI.analyzeBlur.mock.calls.map(([, sensitivity]) => sensitivity))
        .toEqual(['moderate', 'strict']);
      expect(render(useBlurDetection, current).blurResults).toBeNull();
    },
  );
  it('drops a queued restart when blur is switched off again', async () => {
    const p = { folderPath: 'C:/fixture', blurDetectionEnabled: true, blurSensitivity: 'moderate', isBeta: true };
    let finishOld;
    globalThis.window.electronAPI.analyzeBlur = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
      .mockResolvedValueOnce({ success: true, blurResults: { STALE: { predictedClass: 'sharp' } } });
    const old = render(useBlurDetection, p).runBlurAnalysis();
    render(useBlurDetection, p).resetBlurState();
    const queued = render(useBlurDetection, p).runBlurAnalysis();
    render(useBlurDetection, { ...p, blurDetectionEnabled: false }).resetBlurState();
    finishOld({ success: true, blurResults: { OLD: { predictedClass: 'sharp' } } });
    await Promise.all([old, queued]);
    expect(globalThis.window.electronAPI.analyzeBlur).toHaveBeenCalledTimes(1);
    expect(render(useBlurDetection, { ...p, blurDetectionEnabled: false }).blurResults).toBeNull();
  });
  it('drops a queued restart when the selected folder changes again', async () => {
    const p = { folderPath: 'C:/first', blurDetectionEnabled: true, blurSensitivity: 'moderate', isBeta: true };
    let finishOld;
    globalThis.window.electronAPI.analyzeBlur = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
      .mockResolvedValueOnce({ success: true, blurResults: { STALE: { predictedClass: 'sharp' } } });
    const old = render(useBlurDetection, p).runBlurAnalysis();
    render(useBlurDetection, p).resetBlurState();
    const queued = render(useBlurDetection, { ...p, folderPath: 'C:/second' }).runBlurAnalysis();
    render(useBlurDetection, { ...p, folderPath: 'C:/third' }).resetBlurState();
    finishOld({ success: true, blurResults: { OLD: { predictedClass: 'sharp' } } });
    await Promise.all([old, queued]);
    expect(globalThis.window.electronAPI.analyzeBlur).toHaveBeenCalledTimes(1);
    expect(render(useBlurDetection, { ...p, folderPath: 'C:/third' }).blurResults).toBeNull();
  });
  it('hides time left while waiting and leaves the waiting time out of the estimate', async () => {
    vi.useFakeTimers();
    try {
      const p = { folderPath: 'C:/fixture', blurDetectionEnabled: true, blurSensitivity: 'moderate', isBeta: true };
      const etaAfter = async (steps) => {
        hooks.values = []; hooks.cursor = 0; hooks.effects = []; hooks.deps = []; hooks.cleanups = [];
        let emit;
        globalThis.window.electronAPI.onBlurProgress = callback => { emit = callback; return () => {}; };
        globalThis.window.electronAPI.analyzeBlur = vi.fn(() => new Promise(() => {}));
        render(useBlurDetection, p); await effects();
        render(useBlurDetection, p).runBlurAnalysis();
        for (const [ms, progress] of steps) { vi.advanceTimersByTime(ms); emit({ requestId: 1, ...progress }); }
        return render(useBlurDetection, p).blurEta;
      };
      const waiting = await etaAfter([[10000, { current: 1, total: 2, waiting: true }]]);
      expect(waiting).toMatchObject({ pct: 0.5, label: null });   // the bar stays, the time left hides
      const plain = await etaAfter([[10000, { current: 1, total: 2 }]]);
      const afterWait = await etaAfter([
        [5000, { current: 0, total: 2, waiting: true }],
        [60000, { current: 0, total: 2 }],
        [5000, { current: 1, total: 2 }],
      ]);
      expect(plain.label).toBe('~10s remaining');
      expect(afterWait.label).toBe(plain.label);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores progress from an obsolete run after the blur toggle resets', async () => {
    let emit, finish;
    globalThis.window.electronAPI.onBlurProgress = callback => { emit = callback; return () => {}; };
    globalThis.window.electronAPI.analyzeBlur = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const p = { folderPath: 'C:/fixture', blurDetectionEnabled: true, blurSensitivity: 'moderate', isBeta: true };
    render(useBlurDetection, p); await effects();
    const pending = render(useBlurDetection, p).runBlurAnalysis();
    emit({ requestId: 1, current: 1, total: 2 });
    expect(render(useBlurDetection, p).blurProgress.current).toBe(1);
    render(useBlurDetection, p).resetBlurState();
    emit({ requestId: 1, current: 2, total: 2 });
    expect(render(useBlurDetection, p).blurProgress).toBeNull();
    finish({ success: true, blurResults: {} }); await pending;
  });

  it('can replace a stored beta key without reading or prefilling the old key', async () => {
    globalThis.window.electronAPI.blurBetaKey.mockResolvedValue({ enabled: true, configured: true });
    const p = { isBeta: true };
    render(SettingsPanel, p); await effects();
    let tree = render(SettingsPanel, p);
    expect(button(tree, 'Replace beta key')).toBeDefined();
    expect(nodes(tree).find(n => n.type === 'input' && n.props.type === 'password')).toBeUndefined();
    button(tree, 'Replace beta key').props.onClick();
    tree = render(SettingsPanel, p);
    const field = nodes(tree).find(n => n.type === 'input' && n.props.type === 'password');
    expect(field.props.value).toBe('');
    field.props.onChange({ target: { value: 'new-beta-key' } });
    await button(render(SettingsPanel, p), 'Save beta key').props.onClick();
    expect(globalThis.window.electronAPI.blurBetaKey).toHaveBeenLastCalledWith('new-beta-key');
    expect(nodes(render(SettingsPanel, p)).find(n => n.type === 'input' && n.props.type === 'password')).toBeUndefined();
  });

  describe('removing a saved beta key', () => {
    const dialog = tree => nodes(tree).find(n => n.type === ConfirmDialog);
    async function savedCard(extra = {}) {
      globalThis.window.electronAPI.blurBetaKey.mockResolvedValue({ enabled: true, configured: true });
      const p = { isBeta: true, ...extra };
      render(SettingsPanel, p); await effects();
      return p;
    }
    it('offers Remove key next to Replace, and disables it during an analysis', async () => {
      const p = await savedCard();
      const tree = render(SettingsPanel, p);
      expect(button(tree, 'Replace beta key')).toBeDefined();
      expect(button(tree, 'Remove key').props.disabled).toBeFalsy();
      expect(button(render(SettingsPanel, { ...p, isAnalyzingBlur: true }), 'Remove key').props.disabled).toBe(true);
    });
    it('asks first, and Cancel in the dialog keeps the key', async () => {
      const p = await savedCard();
      expect(dialog(render(SettingsPanel, p)).props.isOpen).toBe(false);
      button(render(SettingsPanel, p), 'Remove key').props.onClick();
      const open = dialog(render(SettingsPanel, p));
      expect(open.props).toMatchObject({ isOpen: true, danger: true, title: 'Remove the blur beta key?', confirmLabel: 'Remove key', cancelLabel: 'Cancel' });
      expect(globalThis.window.electronAPI.blurBetaKey).not.toHaveBeenCalledWith(null);
      open.props.onCancel();
      const tree = render(SettingsPanel, p);
      expect(dialog(tree).props.isOpen).toBe(false);
      expect(globalThis.window.electronAPI.blurBetaKey).not.toHaveBeenCalledWith(null);
      expect(text(tree)).toContain('Beta key saved on this device.');
    });
    it('Confirm removes the key, shows the empty form, and switches blur off', async () => {
      const onChange = vi.fn();
      const p = await savedCard({ blurDetectionEnabled: true, onChange });
      button(render(SettingsPanel, p), 'Remove key').props.onClick();
      globalThis.window.electronAPI.blurBetaKey.mockResolvedValue({ enabled: true, configured: false });
      await dialog(render(SettingsPanel, p)).props.onConfirm();
      expect(globalThis.window.electronAPI.blurBetaKey).toHaveBeenCalledWith(null);
      let tree = render(SettingsPanel, p); await effects();
      tree = render(SettingsPanel, p);
      expect(dialog(tree).props.isOpen).toBe(false);
      expect(nodes(tree).find(n => n.type === 'input' && n.props.type === 'password')).toBeDefined();
      expect(onChange).toHaveBeenCalledWith('blurDetectionEnabled', false);
    });
    it('Replace then Cancel returns to the saved state without a save call', async () => {
      const p = await savedCard();
      const calls = () => globalThis.window.electronAPI.blurBetaKey.mock.calls.length;
      const before = calls();
      button(render(SettingsPanel, p), 'Replace beta key').props.onClick();
      let tree = render(SettingsPanel, p);
      nodes(tree).find(n => n.type === 'input' && n.props.type === 'password').props.onChange({ target: { value: 'typed-key' } });
      button(render(SettingsPanel, p), 'Cancel').props.onClick();
      tree = render(SettingsPanel, p);
      expect(text(tree)).toContain('Beta key saved on this device.');
      expect(calls()).toBe(before);
      button(tree, 'Replace beta key').props.onClick();
      expect(nodes(render(SettingsPanel, p)).find(n => n.props.id === 'blur-beta-key').props.value).toBe('');
    });
    it('shows a failed removal in the saved card, and Replace clears that message', async () => {
      const p = await savedCard();
      button(render(SettingsPanel, p), 'Remove key').props.onClick();
      globalThis.window.electronAPI.blurBetaKey.mockRejectedValue(new Error('private detail'));
      await dialog(render(SettingsPanel, p)).props.onConfirm();
      let tree = render(SettingsPanel, p);
      expect(text(tree)).toContain('Beta key saved on this device.');
      expect(text(tree)).toContain('Could not remove the beta key. Try again.');
      button(tree, 'Replace beta key').props.onClick();
      expect(text(render(SettingsPanel, p))).not.toContain('Could not remove the beta key');
    });
    it('keeps the Remove question outside the key card, so the card styles do not shrink it', async () => {
      const p = await savedCard();
      const tree = render(SettingsPanel, p);
      const card = nodes(tree).find(n => n.type === 'div' && String(n.props.className).startsWith('blur-beta-key'));
      expect(card).toBeDefined();
      expect(dialog(tree)).toBeDefined();
      expect(nodes(card).includes(dialog(tree))).toBe(false);
    });
    it('shows no Cancel on the first-time key form', async () => {
      render(SettingsPanel, { isBeta: true }); await effects();
      expect(button(render(SettingsPanel, { isBeta: true }), 'Cancel')).toBeUndefined();
    });
  });

  it('uses advisory beta stats while preserving release wording', () => {
    expect(text(StatsGrid({ blurDetectionEnabled: true, isBeta: true }))).toContain('Blur suggestions');
    expect(text(StatsGrid({ blurDetectionEnabled: true, isBeta: false }))).toContain('Blurry Photos');
  });
  it('names the _Blurry folder at batch confirmation, or warns while analysis is running', () => {
    const settings = { outputPrefix: 'Batch', batchMode: 'copy' };
    const flagged = text(render(PreviewPanel, { settings, blurDetection: { isBeta: false, blurryCount: 2 } }));
    expect(flagged).toContain('2 flagged groups will go to Batch_Blurry. Review that folder after the batch.');
    expect(text(render(PreviewPanel, { settings, blurDetection: { blurryCount: 1 } })))
      .toContain('1 flagged group will go to Batch_Blurry.');
    expect(text(render(PreviewPanel, { settings, blurDetection: { isAnalyzing: true, blurryCount: 2 } })))
      .toContain('Blur analysis is still running. No photos will go to Batch_Blurry.');
    const none = text(render(PreviewPanel, { settings, blurDetection: { blurryCount: 0 } }));
    expect(none).not.toContain('_Blurry');
    expect(none).not.toContain('Blur analysis is still running');
  });
  it('shows where a flagged group will go and lets the user restore it', () => {
    const toggleBlurFlag = vi.fn();
    const blurDetection = { blurResults: { A: { score: 0.8, isBlurry: true, analyzedFile: 'A.jpg' } }, blurryGroups: ['A'], blurryCount: 1,
      analyzedCount: 1, unanalyzedCount: 0, isAnalyzing: false, unflaggedGroups: new Set(), toggleBlurFlag };
    const batch = { batchDetails: [{ batchNumber: 1, fileCount: 1, allFiles: ['A.jpg'] }], outputPrefix: 'Beta', expandedBatch: null, onToggleBatch: vi.fn(), folderPath: 'C:/fixture', blurDetectionEnabled: true, blurDetection };
    const section = nodes(render(BatchPreview, batch)).find(n => n.type?.name === 'BlurryPhotosSection');
    hooks.values = [true]; hooks.deps = []; hooks.cleanups = []; hooks.effects = [];
    const tree = render(section.type, section.props);
    expect(text(tree)).toContain('Will be placed in Beta_Blurry');
    const restore = nodes(tree).find(n => n.type === 'button' && n.props.title === 'Restore to normal batches');
    expect(restore.props['aria-label']).toBe('Restore A to normal batches');
    restore.props.onClick({ detail: 1 });
    expect(toggleBlurFlag).toHaveBeenCalledWith('A');

    const onImageClick = vi.fn();
    const again = render(section.type, { ...section.props, onImageClick });
    nodes(again).find(n => n.type === 'button' && n.props['aria-label'] === 'Preview A.jpg').props.onClick();
    expect(onImageClick.mock.calls[0][2]).toBe(toggleBlurFlag);
  });
  it('restores a group from the photo preview once and closes the preview', () => {
    const toggleBlurFlag = vi.fn();
    const blurDetection = { blurResults: { A: { score: 0.8, isBlurry: true, analyzedFile: 'A.jpg' } }, blurryGroups: ['A'], blurryCount: 1,
      analyzedCount: 1, unanalyzedCount: 0, isAnalyzing: false, unflaggedGroups: new Set(), toggleBlurFlag };
    const batch = { batchDetails: [{ batchNumber: 1, fileCount: 1, allFiles: ['A.jpg'] }], outputPrefix: 'Beta', expandedBatch: null, onToggleBatch: vi.fn(), folderPath: 'C:/fixture', blurDetectionEnabled: true, blurDetection };
    const modal = tree => nodes(tree).find(n => n.type === ImagePreviewModal);
    let tree = render(BatchPreview, batch);
    expect(modal(tree)).toBeUndefined();
    nodes(tree).find(n => n.type?.name === 'BlurryPhotosSection').props.onImageClick('A.jpg', ['A.jpg'], toggleBlurFlag);
    tree = render(BatchPreview, batch);
    modal(tree).props.onRestore('A');
    expect(toggleBlurFlag).toHaveBeenCalledTimes(1);
    expect(toggleBlurFlag).toHaveBeenCalledWith('A');
    expect(modal(render(BatchPreview, batch))).toBeUndefined();
  });

  const flagged = (restored) => ({
    blurResults: { A: { score: 0.8, isBlurry: true, analyzedFile: 'A.jpg' }, B: { score: 0.7, isBlurry: true, analyzedFile: 'B.jpg' }, C: { score: 0.1, isBlurry: false, analyzedFile: 'C.jpg' } },
    blurryGroups: ['A', 'B'].filter((g) => !restored.includes(g)), blurryCount: 2 - restored.length,
    analyzedCount: 3, unanalyzedCount: 0, isAnalyzing: false, unflaggedGroups: new Set(restored), toggleBlurFlag: vi.fn(),
  });
  // The blur section element BatchPreview renders, so a test can render it again with the same hook state.
  const sectionOf = (blurDetection) => {
    const batch = { batchDetails: [{ batchNumber: 1, fileCount: 1, allFiles: ['A.jpg'] }], outputPrefix: 'Beta', expandedBatch: null, onToggleBatch: vi.fn(), folderPath: 'C:/fixture', blurDetectionEnabled: true, blurDetection };
    return nodes(render(BatchPreview, batch)).find(n => n.type?.name === 'BlurryPhotosSection');
  };
  // Renders the open list the way the tests above do (first state = expanded).
  const list = (blurDetection, extra = {}) => {
    const section = sectionOf(blurDetection);
    hooks.values = [true]; hooks.deps = []; hooks.cleanups = []; hooks.effects = [];
    return render(section.type, { ...section.props, ...extra });
  };
  const rows = (tree) => nodes(tree).filter((n) => n.type === 'div' && n.props.className?.split(' ')[0] === 'blurry-item');

  it('keeps a restored group in its place, dimmed, with a Flag again button', () => {
    const d = flagged(['A']);
    const tree = list(d);
    const [rowA, rowB] = rows(tree);
    expect(rows(tree).map((r) => r.props.key)).toEqual(['A', 'B']);
    expect(rowA.props.className).toBe('blurry-item blurry-item-restored');
    expect(rowB.props.className).toBe('blurry-item');
    const again = button(rowA, 'Flag again');
    expect(again.props.title).toBe('Send back to Beta_Blurry');
    expect(again.props['aria-label']).toBe('Flag A as blurry again');
    expect(button(rowB, 'Restore')).toBeDefined();
    expect(text(tree)).toContain('Blur suggestions (1 groups)');
    expect(text(tree)).toContain('1 group restored to normal batches');
    again.props.onClick({ detail: 1 });
    expect(d.toggleBlurFlag).toHaveBeenCalledWith('A');
  });
  it('counts a double-click on Restore or Flag again as one click', () => {
    const d = flagged(['A']);
    const [rowA, rowB] = rows(list(d));
    const restore = button(rowB, 'Restore');
    restore.props.onClick({ detail: 2 });
    expect(d.toggleBlurFlag).not.toHaveBeenCalled();
    restore.props.onClick({ detail: 1 });
    expect(d.toggleBlurFlag).toHaveBeenCalledTimes(1);
    expect(d.toggleBlurFlag).toHaveBeenCalledWith('B');
    restore.props.onClick({ detail: 0 });
    expect(d.toggleBlurFlag).toHaveBeenCalledTimes(2);
    button(rowA, 'Flag again').props.onClick({ detail: 2 });
    expect(d.toggleBlurFlag).toHaveBeenCalledTimes(2);
  });
  it('opens a restored photo alone in the preview, with no Restore button', () => {
    const d = flagged(['A']);
    const onImageClick = vi.fn();
    const tree = list(d, { onImageClick });
    const click = (file) => { nodes(tree).find(n => n.type === 'button' && n.props['aria-label'] === `Preview ${file}`).props.onClick(); return onImageClick.mock.calls.at(-1); };
    const a = click('A.jpg');
    expect(a[0]).toBe('A.jpg');
    expect(a[1]).toEqual(['A.jpg']);
    expect(a[2]).toBeUndefined();
    const b = click('B.jpg');
    expect(b[0]).toBe('B.jpg');
    expect(b[1]).toEqual(['B.jpg']);
    expect(b[2]).toBe(d.toggleBlurFlag);
  });
  it('keeps the list when every flagged group is restored', () => {
    const tree = list(flagged(['A', 'B']));
    expect(text(tree)).toContain('Blur suggestions (0 groups)');
    expect(text(tree)).toContain('2 groups restored to normal batches');
    expect(text(tree)).not.toContain('Will be placed in');
    expect(text(tree)).not.toContain('No blur suggestions for this analysis.');
    expect(nodes(tree).some(n => n.type === CheckCircle)).toBe(false);
    expect(nodes(tree).filter(n => n.type === 'button' && text(n) === 'Flag again')).toHaveLength(2);
  });
  it('loads thumbnails for restored rows too', async () => {
    globalThis.window.electronAPI.getThumbnails = vi.fn().mockResolvedValue({});
    list(flagged(['A']));
    await effects();
    expect(globalThis.window.electronAPI.getThumbnails).toHaveBeenCalledWith('C:/fixture', ['A.jpg', 'B.jpg']);
  });
  it('keeps a restored row past the first 20 in place, with its thumbnail, after Load More', async () => {
    const names = Array.from({ length: 25 }, (_, i) => `G${String(i + 1).padStart(2, '0')}`);
    const d = { ...flagged([]),
      blurResults: Object.fromEntries(names.map((g) => [g, { score: 0.8, isBlurry: true, analyzedFile: `${g}.jpg` }])),
      blurryGroups: names.filter((g) => g !== 'G22'), blurryCount: 24, analyzedCount: 25, unflaggedGroups: new Set(['G22']) };
    const getThumbnails = vi.fn().mockResolvedValue({});
    globalThis.window.electronAPI.getThumbnails = getThumbnails;
    const section = sectionOf(d);
    let tree = list(d);
    await effects();
    expect(rows(tree)).toHaveLength(20);
    expect(text(tree)).toContain('Blur suggestions (24 groups)');
    expect(getThumbnails).toHaveBeenNthCalledWith(1, 'C:/fixture', names.slice(0, 20).map((g) => `${g}.jpg`));

    button(tree, 'Load More (5 remaining)').props.onClick();
    tree = render(section.type, section.props); // same hook state, so the list now shows up to 40 rows
    await effects();
    const shown = rows(tree);
    expect(shown.map((r) => r.props.key)).toEqual(names);
    expect(shown[21].props.className).toBe('blurry-item blurry-item-restored');
    expect(button(shown[21], 'Flag again')).toBeDefined();
    expect(shown[20].props.className).toBe('blurry-item');
    expect(getThumbnails).toHaveBeenCalledTimes(2);
    expect(getThumbnails).toHaveBeenLastCalledWith('C:/fixture', ['G21.jpg', 'G22.jpg', 'G23.jpg', 'G24.jpg', 'G25.jpg']);
    expect(button(tree, 'Load More (5 remaining)')).toBeUndefined();
  });
});

describe('done screen names the _Blurry folder', () => {
  const batches = (n) => Array.from({ length: n }, (_, i) => ({ folder: `Run_00${i + 1}`, fileCount: 5 }));
  const finished = { mode: 'copy', batchesCreated: 7, results: [...batches(6), { folder: 'Run_Blurry', fileCount: 6 }], blurryFileCount: 6, blurryFolderName: 'Run_Blurry' };
  const card = (executionResults) => text(render(CompleteCard, { executionResults, rollbackAvailable: false, hasHistory: false, onOpenFolder: vi.fn(), onReset: vi.fn(), onUndo: vi.fn(), onShowHistory: vi.fn() }));

  it('names the _Blurry folder and leaves it out of the batch count after a finished run', () => {
    const t = card(finished);
    expect(t).toContain('Successfully created 6 batch folders.');
    expect(t).toContain('6 files flagged as blurry went to Run_Blurry. Check them before you upload.');
    expect(t).toContain('... and 2 more folders');
  });
  it('says file for one flagged file', () => {
    expect(card({ ...finished, blurryFileCount: 1 })).toContain('1 file flagged as blurry went to Run_Blurry.');
  });
  it('shows no _Blurry line after a cancelled run', () => {
    expect(card({ ...finished, cancelled: true, filesProcessed: 10, totalFiles: 36 })).not.toContain('flagged as blurry');
  });
  it('keeps the count and shows no line without a _Blurry folder, as after a resumed run', () => {
    const t = card({ mode: 'move', batchesCreated: 3, results: batches(3) });
    expect(t).toContain('Successfully created 3 batch folders.');
    expect(t).not.toContain('flagged as blurry');
  });
});
