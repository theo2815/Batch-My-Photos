import { beforeEach, describe, expect, it, vi } from 'vitest';

// Same Node-only React mock as tests/blurFeedbackUI.test.js: hooks are tracked by call position.
const hooks = vi.hoisted(() => ({ values: [], cursor: 0, effects: [], deps: [], cleanups: [] }));
vi.mock('react', () => {
  const useState = (initial) => {
    const i = hooks.cursor++;
    if (!(i in hooks.values)) hooks.values[i] = typeof initial === 'function' ? initial() : initial;
    return [
      hooks.values[i],
      (value) => {
        hooks.values[i] = typeof value === 'function' ? value(hooks.values[i]) : value;
      },
    ];
  };
  const useRef = (initial) => useState(() => ({ current: initial }))[0];
  const useEffect = (fn, deps) => {
    const i = hooks.cursor++;
    if (!hooks.deps[i] || deps.some((value, j) => value !== hooks.deps[i][j])) {
      hooks.effects.push(() => {
        hooks.cleanups[i]?.();
        hooks.cleanups[i] = fn();
      });
      hooks.deps[i] = deps;
    }
  };
  const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useRef };
  return { default: react, useState, useRef, useEffect, useCallback: (fn) => fn, useMemo: (fn) => fn() };
});

import ImagePreviewModal from '../src/components/Modals/ImagePreviewModal.jsx';
import PhotoMetadataPanel from '../src/components/Modals/PhotoMetadataPanel.jsx';

function render(props) {
  hooks.cursor = 0;
  return ImagePreviewModal(props);
}
async function effects() {
  const pending = hooks.effects.splice(0);
  pending.forEach((fn) => fn());
  await Promise.resolve();
  await Promise.resolve();
}
function nodes(node) {
  return !node || typeof node !== 'object'
    ? []
    : Array.isArray(node)
      ? node.flatMap(nodes)
      : [node, ...nodes(node.props?.children)];
}
function text(node) {
  return typeof node === 'string' || typeof node === 'number'
    ? String(node)
    : Array.isArray(node)
      ? node.map(text).join('')
      : node?.props
        ? text(node.props.children)
        : '';
}
const button = (tree, label) => nodes(tree).find((n) => n.type === 'button' && text(n) === label);
const panelOf = (tree) => nodes(tree).find((n) => n.type === PhotoMetadataPanel);
const keydown = () => globalThis.window.addEventListener.mock.calls.filter(([type]) => type === 'keydown').at(-1)[1];
const press = (key) => keydown()({ key, preventDefault: vi.fn() });

const fields = {
  cameraMake: 'Canon',
  cameraModel: 'EOS R6',
  aperture: 2.8,
  exposureTime: '1/500 s',
  iso: 400,
  flash: 'Did not fire',
  exposureMode: 'Auto',
  whiteBalance: 'Auto',
  author: 'Camera Author',
  takenAtLocal: '2026-09-28T06:35:20.125',
  takenAtOffset: '+08:00',
};
const metadataFor = (file) => ({
  status: 'ready',
  fields: { ...fields, lens: `${file} lens` },
  fileSizeBytes: 1234567,
  width: 6000,
  height: 4000,
});
const props = {
  isOpen: true,
  folderPath: 'C:/fixture',
  fileName: 'a.jpg',
  fileList: ['a.jpg', 'b.jpg'],
  onClose: vi.fn(),
};

beforeEach(() => {
  hooks.values = [];
  hooks.cursor = 0;
  hooks.effects = [];
  hooks.deps = [];
  hooks.cleanups = [];
  props.onClose = vi.fn();
  vi.stubGlobal('window', {
    electronAPI: {
      getImagePreview: vi.fn(async (_folder, file) => ({
        success: true,
        dataUrl: 'data:image/jpeg;base64,x',
        width: 1600,
        height: 1067,
        contentHash: 'a'.repeat(64),
        metadata: metadataFor(file),
      })),
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal('document', { activeElement: { focus: vi.fn() } });
});

async function openWithPanel(p = props) {
  let tree = render(p);
  await effects();
  tree = render(p);
  button(tree, 'Metadata').props.onClick();
  tree = render(p);
  await effects();
  return render(p);
}

describe('PhotoMetadataPanel wording (QuickPitik dialog contract)', () => {
  it('shows the QuickPitik sections, labels and formats in order', () => {
    const tree = PhotoMetadataPanel({
      id: 'p',
      fileName: 'IMG_1.jpg',
      loading: false,
      metadata: { status: 'ready', fields, fileSizeBytes: 1234567 },
    });
    expect(text(nodes(tree).find((n) => n.type === 'h2'))).toBe('Photo metadata');
    expect(
      nodes(tree)
        .filter((n) => n.type === 'h3')
        .map(text)
    ).toEqual(['Camera', 'Exposure', 'Attribution and capture', 'File']);
    expect(
      nodes(tree)
        .filter((n) => n.type === 'dt')
        .map(text)
    ).toEqual([
      'Model',
      'Lens',
      'Aperture',
      'Exposure',
      'ISO',
      'Flash',
      'Exposure mode',
      'White balance',
      'Author',
      'Copyright',
      'Date',
      'Name',
      'Original size',
    ]);
    expect(
      nodes(tree)
        .filter((n) => n.type === 'dd')
        .map(text)
    ).toEqual([
      'Canon EOS R6',
      'Not recorded',
      'f/2.8',
      '1/500 s',
      '400',
      'Did not fire',
      'Auto',
      'Auto',
      'Camera Author',
      'Not recorded',
      '2026-09-28 06:35:20.125 +08:00',
      'IMG_1.jpg',
      '1.2 MiB (1,234,567 bytes)',
    ]);
  });

  it('does not repeat the make when the model already starts with it', () => {
    const tree = PhotoMetadataPanel({
      id: 'p',
      fileName: 'x.jpg',
      loading: false,
      metadata: { status: 'ready', fields: { cameraMake: 'Canon', cameraModel: 'Canon EOS R6' } },
    });
    expect(text(nodes(tree).filter((n) => n.type === 'dd')[0])).toBe('Canon EOS R6');
  });

  it.each([
    ['empty', 'No camera metadata was found.'],
    ['unavailable', 'Metadata is unavailable for this photo.'],
    ['failed', 'Metadata could not be loaded.'],
    [undefined, 'Metadata is unavailable for this photo.'],
  ])('status %s shows its QuickPitik message and the file facts, with no retry', (status, message) => {
    const metadata = status && { status, fileSizeBytes: 2048 };
    const tree = PhotoMetadataPanel({ id: 'p', fileName: 'x.png', loading: false, metadata });
    expect(text(tree)).toContain(message);
    expect(
      nodes(tree)
        .filter((n) => n.type === 'h3')
        .map(text)
    ).toEqual(['File']);
    expect(text(tree)).toContain('x.png');
    expect(nodes(tree).some((n) => n.type === 'button')).toBe(false);
  });

  it('announces loading', () => {
    const tree = PhotoMetadataPanel({ id: 'p', fileName: 'x.jpg', loading: true });
    expect(text(nodes(tree).find((n) => n.props?.role === 'status'))).toBe('Loading metadata…');
  });
});

describe('ImagePreviewModal metadata panel', () => {
  it("opens from the Metadata button with the current photo's metadata", async () => {
    const tree = await openWithPanel();
    expect(button(tree, 'Metadata').props['aria-expanded']).toBe(true);
    expect(panelOf(tree).props).toMatchObject({
      id: 'photo-metadata-panel',
      fileName: 'a.jpg',
      loading: false,
      metadata: metadataFor('a.jpg'),
    });
    expect(text(PhotoMetadataPanel(panelOf(tree).props))).toContain('a.jpg lens');
  });

  it('shows the original pixel size in the info bar, not the preview size', async () => {
    let tree = render(props);
    await effects();
    tree = render(props);
    expect(text(tree)).toContain('6000 x 4000');
    expect(text(tree)).not.toContain('1600 x 1067');
  });

  it('first Escape closes the panel, the second closes the preview', async () => {
    await openWithPanel();
    press('Escape');
    let tree = render(props);
    await effects();
    tree = render(props);
    expect(panelOf(tree)).toBeUndefined();
    expect(props.onClose).not.toHaveBeenCalled();
    press('Escape');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open while arrowing and never shows the previous photo's values", async () => {
    await openWithPanel();
    press('ArrowRight');
    let tree = render(props);
    expect(panelOf(tree).props.fileName).toBe('b.jpg');
    expect(panelOf(tree).props.metadata).toBeUndefined();
    await effects();
    tree = render(props);
    expect(panelOf(tree).props.metadata).toEqual(metadataFor('b.jpg'));
  });

  it('clicks inside the panel do not reach the backdrop, and Tab can reach it', async () => {
    const panel = PhotoMetadataPanel(panelOf(await openWithPanel()).props);
    const stopPropagation = vi.fn();
    panel.props.onClick({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalled();
    expect(panel.props.tabIndex).toBe(0); // the modal's Tab trap includes [tabindex="0"]
  });

  it('keeps blur beta feedback working with the panel open', async () => {
    const onSubmit = vi.fn();
    const beta = {
      ...props,
      isBeta: true,
      labels: new Map([['a.jpg', 'sharp']]),
      onSubmit,
      getSubmission: () => undefined,
      blurInfoMap: { 'a.jpg': { baseName: 'a', score: 0.8, predictedClass: 'motion_blurred', isBlurry: true } },
    };
    const tree = await openWithPanel(beta);
    expect(panelOf(tree)).toBeDefined();
    button(tree, 'Submit this example').props.onClick();
    expect(onSubmit).toHaveBeenCalledWith('a.jpg', 'sharp', 'a'.repeat(64));
  });
});
