import { beforeEach, describe, expect, it, vi } from 'vitest';

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
import StatsGrid from '../src/components/PreviewPanel/StatsGrid.jsx';
import PreviewPanel from '../src/components/PreviewPanel/PreviewPanel.jsx';
import { useBlurDetection } from '../src/hooks/useBlurDetection.js';

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
function text(node) { return typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : ''; }
function button(tree, label) { return nodes(tree).find(n => n.type === 'button' && text(n) === label); }

const info = { 'flagged.jpg': { baseName: 'flagged', score: 0.8, predictedClass: 'motion_blurred', isBlurry: true }, 'missed.jpg': { baseName: 'missed', score: 0.1, predictedClass: 'sharp', isBlurry: false } };
const props = { isOpen: true, isBeta: true, folderPath: 'C:/fixture', fileName: 'flagged.jpg', fileList: Object.keys(info), blurInfoMap: info, labels: new Map(), onClose: vi.fn() };

beforeEach(() => {
  hooks.values = []; hooks.cursor = 0; hooks.effects = []; hooks.deps = []; hooks.cleanups = [];
  feedbackHooks = { values: [], cursor: 0, effects: [], deps: [], cleanups: [] };
  vi.stubGlobal('window', { electronAPI: { submitBlurExample: vi.fn().mockResolvedValue({ success: true }), getImagePreview: vi.fn().mockResolvedValue({ success: true, dataUrl: 'data:image/jpeg;base64,test', width: 512, height: 512, contentHash: 'a'.repeat(64) }), blurBetaKey: vi.fn().mockResolvedValue({ enabled: true, configured: false }), getBlurDetectionEnabled: vi.fn().mockResolvedValue(true) }, addEventListener: vi.fn(), removeEventListener: vi.fn() });
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

  it('uses advisory beta stats while preserving release wording', () => {
    expect(text(StatsGrid({ blurDetectionEnabled: true, isBeta: true }))).toContain('Blur suggestions');
    expect(text(StatsGrid({ blurDetectionEnabled: true, isBeta: false }))).toContain('Blurry Photos');
  });
  it('shows advisory status at beta batch confirmation only', () => {
    const settings = { outputPrefix: 'Batch', batchMode: 'copy' };
    const beta = render(PreviewPanel, { settings, blurDetection: { isBeta: true } });
    expect(text(beta)).toContain('Every photo stays in the ordinary batches');
    expect(text(render(PreviewPanel, { settings, blurDetection: { isBeta: false } })))
      .not.toContain('Every photo stays in the ordinary batches');
  });
});
