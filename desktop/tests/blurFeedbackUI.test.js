import { beforeEach, describe, expect, it, vi } from 'vitest';

// Same Node-only element approach as blurAdvisoryModal; retain hook state across interactions.
const hooks = vi.hoisted(() => ({ values: [], cursor: 0, effects: [], deps: [], cleanups: [] }));
vi.mock('react', () => {
  const useState = initial => {
    const i = hooks.cursor++;
    if (!(i in hooks.values)) hooks.values[i] = typeof initial === 'function' ? initial() : initial;
    return [hooks.values[i], value => { hooks.values[i] = typeof value === 'function' ? value(hooks.values[i]) : value; }];
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
import { useBlurDetection } from '../src/hooks/useBlurDetection.js';

function render(component, props) { hooks.cursor = 0; return component(props); }
async function effects() { const pending = hooks.effects.splice(0); pending.forEach(fn => fn()); await Promise.resolve(); await Promise.resolve(); }
function nodes(node) { return !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]; }
function text(node) { return typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : ''; }
function button(tree, label) { return nodes(tree).find(n => n.type === 'button' && text(n) === label); }

const info = { 'flagged.jpg': { baseName: 'flagged', score: 0.8, predictedClass: 'motion_blurred', isBlurry: true }, 'missed.jpg': { baseName: 'missed', score: 0.1, predictedClass: 'sharp', isBlurry: false } };
const props = { isOpen: true, isBeta: true, folderPath: 'C:/fixture', fileName: 'flagged.jpg', fileList: Object.keys(info), blurInfoMap: info, labels: new Map(), onClose: vi.fn() };

beforeEach(() => {
  hooks.values = []; hooks.cursor = 0; hooks.effects = []; hooks.deps = []; hooks.cleanups = [];
  vi.stubGlobal('window', { electronAPI: { submitBlurExample: vi.fn().mockResolvedValue({ success: true }), getImagePreview: vi.fn().mockResolvedValue({ success: true, dataUrl: 'data:image/jpeg;base64,test', width: 512, height: 512 }), blurBetaKey: vi.fn().mockResolvedValue({ enabled: true, configured: false }), getBlurDetectionEnabled: vi.fn().mockResolvedValue(true) }, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('document', { activeElement: { focus: vi.fn() }, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

describe('explicit beta feedback consent', () => {
  it('labels locally, survives close/reopen, then submits exactly the displayed analyzed file', async () => {
    const labels = new Map();
    const p = { ...props, labels, onLabel: (file, label) => labels.set(file, label) };
    let tree = render(ImagePreviewModal, p);
    await effects(); tree = render(ImagePreviewModal, p);
    expect(button(tree, 'Sharp')).toBeDefined();
    expect(button(tree, 'Submit this example').props.disabled).toBe(true);
    button(tree, 'Sharp').props.onClick();
    render(ImagePreviewModal, { ...p, isOpen: false }); await effects();
    tree = render(ImagePreviewModal, p); await effects(); tree = render(ImagePreviewModal, p);
    expect(button(tree, 'Sharp').props['aria-pressed']).toBe(true);
    expect(globalThis.window.electronAPI.submitBlurExample).not.toHaveBeenCalled();
    expect(text(tree)).toMatch(/private/i);
    expect(text(tree)).toMatch(/30 days/i);
    expect(text(tree)).toMatch(/improve blur detection/i);
    expect(text(tree)).toContain('flagged.jpg');
    await button(tree, 'Submit this example').props.onClick();
    expect(globalThis.window.electronAPI.submitBlurExample).toHaveBeenCalledWith({ folderPath: 'C:/fixture', fileName: 'flagged.jpg', label: 'sharp' });
    expect(text(render(ImagePreviewModal, p))).toMatch(/submitted/i);
  });

  it('allows a model-sharp miss, shows progress, and offers an explicit retry after failure', async () => {
    const p = { ...props, fileName: 'missed.jpg', labels: new Map([['missed.jpg', 'blurry']]), onLabel: vi.fn() };
    let finish;
    globalThis.window.electronAPI.submitBlurExample.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    let tree = render(ImagePreviewModal, p); await effects(); tree = render(ImagePreviewModal, p);
    const request = button(tree, 'Submit this example').props.onClick();
    tree = render(ImagePreviewModal, p);
    expect(text(tree)).toMatch(/submitting/i);
    finish({ success: false, error: 'Could not save this example. Please sign in and try again.' }); await request;
    tree = render(ImagePreviewModal, p);
    expect(nodes(tree).find(n => n.props.role === 'alert')).toBeDefined();
    expect(globalThis.window.electronAPI.submitBlurExample).toHaveBeenCalledTimes(1);
    await button(tree, 'Submit this example').props.onClick();
    expect(globalThis.window.electronAPI.submitBlurExample).toHaveBeenLastCalledWith({ folderPath: 'C:/fixture', fileName: 'missed.jpg', label: 'blurry' });
  });

  it('keeps the local label after a rejected upload promise and permits retry', async () => {
    const p = { ...props, labels: new Map([['flagged.jpg', 'sharp']]), onLabel: vi.fn() };
    globalThis.window.electronAPI.submitBlurExample.mockRejectedValueOnce(new Error('offline'));
    render(ImagePreviewModal, p); await effects();
    await button(render(ImagePreviewModal, p), 'Submit this example').props.onClick();
    const tree = render(ImagePreviewModal, p);
    expect(text(tree)).toContain('Check your connection');
    expect(button(tree, 'Sharp').props['aria-pressed']).toBe(true);
    expect(button(tree, 'Submit this example').props.disabled).toBe(false);
    await button(tree, 'Submit this example').props.onClick();
    expect(text(render(ImagePreviewModal, p))).toContain('Example submitted');
  });

  it('hides key setup outside beta', async () => {
    globalThis.window.electronAPI.blurBetaKey.mockResolvedValue({ enabled: false, configured: false });
    render(SettingsPanel, {}); await effects();
    expect(nodes(render(SettingsPanel, {})).some(n => n.type === 'input' && n.props.type === 'password')).toBe(false);
  });

  it('does not expose feedback controls for a RAW sibling or outside beta', () => {
    expect(button(render(ImagePreviewModal, { ...props, isBeta: false }), 'Sharp')).toBeUndefined();
    hooks.values = [];
    expect(button(render(ImagePreviewModal, { ...props, fileName: 'flagged.CR3' }), 'Sharp')).toBeUndefined();
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
    const p = { maxFilesPerBatch: 10, outputPrefix: 'Batch', batchMode: 'copy' };
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

  it('uses advisory beta stats while preserving release wording', () => {
    expect(text(StatsGrid({ blurDetectionEnabled: true, isBeta: true }))).toContain('Blur suggestions');
    expect(text(StatsGrid({ blurDetectionEnabled: true, isBeta: false }))).toContain('Blurry Photos');
  });
});
