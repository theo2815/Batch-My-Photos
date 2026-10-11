import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Node-only React: hooks keep state across re-renders, createElement returns plain trees.
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

import ReviewTable from '../src/components/Upload/ReviewTable.jsx';
import UploadSummary from '../src/components/Upload/UploadSummary.jsx';
import UploadView from '../src/components/Upload/UploadView.jsx';
import FolderDrop from '../src/components/Upload/FolderDrop.jsx';
import EventPicker from '../src/components/Upload/EventPicker.jsx';
import { useQuickPitikUpload } from '../src/hooks/useQuickPitikUpload.js';

function render(component, props) { hooks.cursor = 0; return component(props); }
async function effects() { const pending = hooks.effects.splice(0); pending.forEach(fn => fn()); for (let i = 0; i < 6; i++) await Promise.resolve(); }
function nodes(node) { return !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]; }
function text(node) { return typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : ''; }
function button(tree, label) { return nodes(tree).find(n => n.type === 'button' && text(n) === label); }
function rowFor(tree, name) { return nodes(tree).find(n => n.type === 'li' && text(n).includes(name)); }

const scan = { success: true, root: 'D:/Shoots/Theo dipolog', folders: [
  { relPath: '', name: 'Theo dipolog', uploadable: { count: 12, bytes: 12 }, skipped: { raw: 0, video: 2, heic: 0, oversize: 0, other: 0 }, defaultSelected: true },
  { relPath: 'Race A', name: 'Race A', uploadable: { count: 400, bytes: 400 }, skipped: { raw: 88, video: 0, heic: 0, oversize: 3, other: 0 }, defaultSelected: true },
  { relPath: 'Race A/Race A_Blurry', name: 'Race A_Blurry', uploadable: { count: 20, bytes: 20 }, skipped: { raw: 0, video: 0, heic: 0, oversize: 0, other: 0 }, defaultSelected: false },
], totals: { folders: 3, uploadable: { count: 432, bytes: 432 }, skipped: { raw: 88, video: 2, heic: 0, oversize: 3, other: 0 } } };
const event = { id: 'e1', name: 'Cebu Marathon 2026', date: '2026-10-10', location: 'Cebu City', ownedByMe: false, state: 'live' };
const noop = () => {};

beforeEach(() => { hooks.values = []; hooks.cursor = 0; hooks.effects = []; hooks.deps = []; hooks.cleanups = []; });

describe('EventPicker', () => {
  // Manila-today is 2026-10-10 in these tests.
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-10T12:00:00+08:00')); });
  afterEach(() => { vi.useRealTimers(); });

  const own = { id: 'o1', name: 'My Fun Run', date: '2026-09-25', location: '', ownedByMe: true, state: 'open', closesOn: '2026-10-25' };
  const open = { ...event, closesOn: '2026-10-13' };
  const lastDay = { id: 'e2', name: 'Mandaue Dash', date: '2026-10-07', location: 'Mandaue', ownedByMe: false, state: 'live', closesOn: '2026-10-10' };
  const picker = (props) => render(EventPicker, { events: [own, open, lastDay], value: '', onChange: noop, onRefresh: noop, disabled: false, ...props });
  const rows = (tree) => nodes(tree).filter(n => n.type === 'button' && 'aria-pressed' in n.props);

  it('asks which event the photos are for and says what the choice means', () => {
    const shown = text(picker());
    expect(shown).toContain('Which event are these photos for?');
    expect(shown).toContain("Runners will find these photos on that event's page.");
  });

  it('puts own events under "Your events" and public ones under "Open public events"', () => {
    const shown = text(picker());
    const at = label => shown.indexOf(label);
    expect(at('Your events')).toBeGreaterThan(-1);
    expect(at('Your events')).toBeLessThan(at('My Fun Run'));
    expect(at('My Fun Run')).toBeLessThan(at('Open public events'));
    expect(at('Open public events')).toBeLessThan(at('Cebu Marathon 2026'));
    expect(at('Cebu Marathon 2026')).toBeLessThan(at('Mandaue Dash'));
  });

  it('shows no heading for a group with no event', () => {
    expect(text(picker({ events: [open] }))).not.toContain('Your events');
    expect(text(picker({ events: [own] }))).not.toContain('Open public events');
  });

  it('a row shows the date and place, whose event it is and how long it takes uploads', () => {
    const [ownRow, openRow, lastDayRow] = rows(picker()).map(text);
    expect(openRow).toContain('Cebu Marathon 2026');
    expect(openRow).toContain('10 Oct 2026 · Cebu City');
    expect(openRow).toContain('Public event');
    expect(openRow).toContain('Uploads close in 3 days');
    expect(ownRow).toContain('Your event');
    expect(ownRow).toContain('25 Sep 2026');
    expect(ownRow).not.toContain('·'); // no location: the date stands alone
    expect(ownRow).toContain('Uploads close in 15 days');
    expect(lastDayRow).toContain('Uploads close today');
  });

  it('says "1 day" on the day before the last', () => {
    const [row] = rows(picker({ events: [{ ...lastDay, closesOn: '2026-10-11' }] })).map(text);
    expect(row).toContain('Uploads close in 1 day');
    expect(row).not.toContain('1 days');
  });

  it('clicking a row chooses that event, and the chosen row is marked pressed', () => {
    const onChange = vi.fn();
    const tree = picker({ value: 'e1', onChange });
    expect(rows(tree).map(row => row.props['aria-pressed'])).toEqual([false, true, false]);
    rows(tree)[2].props.onClick();
    expect(onChange).toHaveBeenCalledWith('e2');
  });

  it('explains when events open if none is open, and keeps Refresh', () => {
    const onRefresh = vi.fn();
    const tree = picker({ events: [], onRefresh });
    expect(text(tree)).toContain('No event is open for upload right now. Public events take photos on race day and for 3 days after; your own events for one month.');
    expect(rows(tree)).toEqual([]);
    button(tree, 'Refresh').props.onClick();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('cannot be used while the view is busy', () => {
    const tree = picker({ disabled: true });
    expect(rows(tree).map(row => row.props.disabled)).toEqual([true, true, true]);
    expect(button(tree, 'Refresh').props.disabled).toBe(true);
  });
});

describe('ReviewTable', () => {
  it('shows the counts and skip reasons, unticks a _Blurry folder and names the event on the button', () => {
    const tree = render(ReviewTable, { scan, selected: ['', 'Race A'], selectedCount: 412, event, onToggle: noop, onUpload: noop, onChangeFolder: noop });
    expect(text(tree)).toContain('432 photos ready.');
    expect(text(tree)).toContain('88 RAW files and 2 videos skipped. 3 JPEGs over 25 MB skipped.');
    const blurry = rowFor(tree, 'Race A_Blurry');
    expect(nodes(blurry).find(n => n.type === 'input').props.checked).toBe(false);
    expect(nodes(rowFor(tree, 'Race A')).find(n => n.type === 'input').props.checked).toBe(true);
    const upload = button(tree, 'Upload 412 photos to Cebu Marathon 2026');
    expect(upload).toBeDefined();
    expect(upload.props.disabled).toBe(false);
  });

  it('disables the upload button with nothing selected or no event', () => { // Review Focus 4
    const empty = render(ReviewTable, { scan, selected: [], selectedCount: 0, event, onToggle: noop, onUpload: noop, onChangeFolder: noop });
    expect(button(empty, 'Nothing to upload').props.disabled).toBe(true);
    const noEvent = render(ReviewTable, { scan, selected: ['Race A'], selectedCount: 400, event: null, onToggle: noop, onUpload: noop, onChangeFolder: noop });
    expect(button(noEvent, 'Choose an event first').props.disabled).toBe(true);
  });
});

describe('UploadSummary', () => {
  it('counts skipped files from the ticked folders and offers Retry failed', () => {
    const progress = { phase: 'done', counts: { uploaded: 400, alreadyThere: 10, failed: 2, total: 412 }, bytes: { sent: 412, total: 412 },
      failures: [{ relPath: 'Race A', name: 'x.jpg', code: 'UPLOAD_CHECKSUM_MISMATCH', message: 'Checksum mismatch', retryable: false }] };
    const onRetryFailed = vi.fn();
    const tree = render(UploadSummary, { status: 'done', progress, scan, selected: ['', 'Race A'], error: null, onRetryFailed, onReset: noop, onReconnect: noop });
    expect(text(tree)).toContain('400 uploaded. 10 already there. 93 skipped. 2 failed.');
    expect(text(tree)).toContain('x.jpg');
    button(tree, 'Retry failed').props.onClick();
    expect(onRetryFailed).toHaveBeenCalledTimes(1);
    expect(button(tree, 'Upload another folder')).toBeDefined();
  });

  it('a sign-in that expired mid-upload offers Reconnect', () => {
    const onReconnect = vi.fn();
    const tree = render(UploadSummary, { status: 'error', progress: { phase: 'error', counts: { uploaded: 5, alreadyThere: 0, failed: 0, total: 412 }, bytes: { sent: 5, total: 412 }, failures: [] },
      scan, selected: ['', 'Race A'], error: { code: 'SESSION_EXPIRED', message: 'Your QuickPitik sign-in expired.' }, onRetryFailed: noop, onReset: noop, onReconnect });
    expect(text(tree)).toContain('Reconnect to continue. Finished photos are kept; dropping the folder again skips them.');
    button(tree, 'Reconnect').props.onClick();
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('a closed event shows the server message and a link to the site', () => {
    const tree = render(UploadSummary, { status: 'error', progress: { phase: 'error', counts: { uploaded: 0, alreadyThere: 0, failed: 0, total: 1 }, bytes: { sent: 0, total: 1 }, failures: [] },
      scan, selected: [''], error: { code: 'EVENT_NOT_UPLOADABLE', message: 'Upload window for this event has closed.' }, onRetryFailed: noop, onReset: noop, onReconnect: noop });
    expect(text(tree)).toContain('Upload window for this event has closed.');
    expect(button(tree, 'Fix this on quickpitik.com')).toBeDefined();
  });
});

describe('useQuickPitikUpload', () => {
  it('walks disconnected → connecting → ready → reviewing → uploading → done', async () => {
    let connectResult; let progress;
    const api = {
      qpSessionStatus: vi.fn().mockResolvedValue({ connected: false, email: null, name: null }),
      onQpConnectResult: vi.fn((cb) => { connectResult = cb; return () => {}; }),
      onQpUploadProgress: vi.fn((cb) => { progress = cb; return () => {}; }),
      qpConnectStart: vi.fn().mockResolvedValue({ success: true }),
      qpListEvents: vi.fn().mockResolvedValue({ success: true, events: [event] }),
      selectFolder: vi.fn().mockResolvedValue('D:/Shoots/Theo dipolog'),
      registerDroppedFolder: vi.fn(),
      qpScanFolder: vi.fn().mockResolvedValue(scan),
      qpUploadStart: vi.fn().mockResolvedValue({ success: true, total: 412 }),
      qpUploadCancel: vi.fn(), qpDisconnect: vi.fn().mockResolvedValue({ success: true }),
    };
    vi.stubGlobal('window', { electronAPI: api });
    const busy = vi.fn();
    const props = { onBusyChange: busy };

    let qp = render(useQuickPitikUpload, props); await effects();
    qp = render(useQuickPitikUpload, props);
    expect(qp.status).toBe('disconnected');

    await qp.connect(); qp = render(useQuickPitikUpload, props);
    expect(qp.status).toBe('connecting');
    expect(api.qpConnectStart).toHaveBeenCalledTimes(1);

    connectResult({ success: true, email: 'p@test.local', name: 'P' }); await effects();
    qp = render(useQuickPitikUpload, props); await effects(); qp = render(useQuickPitikUpload, props);
    expect(qp.status).toBe('ready');
    expect(qp.session).toEqual({ email: 'p@test.local', name: 'P' });
    expect(qp.events).toEqual([event]);

    qp.setEventId('e1');
    await qp.chooseFolder(); qp = render(useQuickPitikUpload, props);
    expect(api.qpScanFolder).toHaveBeenCalledWith('D:/Shoots/Theo dipolog');
    expect(qp.status).toBe('reviewing');
    expect(qp.selected).toEqual(['', 'Race A']);
    expect(qp.selectedCount).toBe(412);

    await qp.startUpload(); qp = render(useQuickPitikUpload, props); await effects();
    expect(qp.status).toBe('uploading');
    expect(api.qpUploadStart).toHaveBeenCalledWith({ rootPath: 'D:/Shoots/Theo dipolog', eventId: 'e1', folders: ['', 'Race A'] });
    expect(busy).toHaveBeenLastCalledWith(true);

    progress({ phase: 'done', folder: null, counts: { uploaded: 412, alreadyThere: 0, failed: 0, total: 412 }, bytes: { sent: 412, total: 412 }, failures: [] });
    qp = render(useQuickPitikUpload, props); await effects();
    expect(qp.status).toBe('done');
    expect(qp.progress.phase).toBe('done');
    expect(busy).toHaveBeenLastCalledWith(false);
  });

  it('a rejected session while listing events drops back to disconnected', async () => {
    const api = {
      qpSessionStatus: vi.fn().mockResolvedValue({ connected: true, email: 'p@test.local', name: 'P' }),
      onQpConnectResult: vi.fn(() => () => {}), onQpUploadProgress: vi.fn(() => () => {}),
      qpListEvents: vi.fn().mockResolvedValue({ success: false, authRejected: true, error: 'Your QuickPitik sign-in expired. Reconnect to continue.' }),
    };
    vi.stubGlobal('window', { electronAPI: api });
    let qp = render(useQuickPitikUpload, {}); await effects();
    qp = render(useQuickPitikUpload, {}); await effects(); qp = render(useQuickPitikUpload, {});
    expect(qp.status).toBe('disconnected');
    expect(qp.error).toEqual({ code: 'SESSION_EXPIRED', message: 'Your QuickPitik sign-in expired. Reconnect to continue.' });
  });

  // A connected session; `over` replaces single calls. Returns the api and the progress callback holder.
  function connectedApi(over = {}) {
    const held = {};
    const api = {
      qpSessionStatus: vi.fn().mockResolvedValue({ connected: true, email: 'p@test.local', name: 'P' }),
      onQpConnectResult: vi.fn(() => () => {}),
      onQpUploadProgress: vi.fn((cb) => { held.progress = cb; return () => {}; }),
      qpListEvents: vi.fn().mockResolvedValue({ success: true, events: [event] }),
      selectFolder: vi.fn().mockResolvedValue('D:/Shoots/Theo dipolog'),
      qpScanFolder: vi.fn().mockResolvedValue(scan),
      qpUploadStart: vi.fn().mockResolvedValue({ success: true, total: 412 }),
      ...over,
    };
    vi.stubGlobal('window', { electronAPI: api });
    return { api, held };
  }
  async function mounted(props = {}) {
    render(useQuickPitikUpload, props); await effects();
    render(useQuickPitikUpload, props); await effects();
    return render(useQuickPitikUpload, props);
  }
  const tooMany = () => Promise.reject(new Error('RATE_LIMITED: Too many requests'));

  it('a call the app refuses (too many presses) puts the view back instead of leaving it stuck', async () => {
    const busy = vi.fn();
    const props = { onBusyChange: busy };
    const { api } = connectedApi({ qpScanFolder: vi.fn(tooMany) });
    let qp = await mounted(props);
    await qp.chooseFolder(); qp = render(useQuickPitikUpload, props); await effects();
    expect(qp.status).toBe('ready');
    expect(qp.error).toEqual({ code: 'SCAN', message: 'Please wait a moment and try again.' });
    expect(busy).toHaveBeenLastCalledWith(false);

    api.qpScanFolder = vi.fn().mockResolvedValue(scan);
    api.qpUploadStart = vi.fn(tooMany);
    qp.setEventId('e1');
    await qp.chooseFolder(); qp = render(useQuickPitikUpload, props);
    await qp.startUpload(); qp = render(useQuickPitikUpload, props); await effects();
    expect(qp.status).toBe('reviewing');
    expect(qp.error).toEqual({ code: 'UPLOAD', message: 'Please wait a moment and try again.' });
    expect(busy).toHaveBeenLastCalledWith(false);
  });

  it('shows an upload that is still running when the view is opened again', async () => {
    const busy = vi.fn();
    const props = { onBusyChange: busy };
    const { held } = connectedApi();
    let qp = await mounted(props);
    expect(qp.status).toBe('ready');
    held.progress({ phase: 'uploading', folder: { relPath: 'Race A', index: 0, count: 1 }, counts: { uploaded: 5, alreadyThere: 0, failed: 0, total: 412 }, bytes: { sent: 5, total: 412 } });
    qp = render(useQuickPitikUpload, props); await effects();
    expect(qp.status).toBe('uploading');
    expect(busy).toHaveBeenLastCalledWith(true);
  });

  it('a sign-in that expired mid-upload forgets the session, so the next folder asks to connect', async () => {
    const { held } = connectedApi();
    let qp = await mounted();
    held.progress({ phase: 'error', error: { code: 'SESSION_EXPIRED', message: 'Your QuickPitik sign-in expired.' }, counts: { uploaded: 5, alreadyThere: 0, failed: 0, total: 412 }, bytes: { sent: 5, total: 412 }, failures: [] });
    qp = render(useQuickPitikUpload, {});
    expect(qp.status).toBe('error');
    expect(qp.session).toBeNull();
    qp.reset(); qp = render(useQuickPitikUpload, {});
    expect(qp.status).toBe('disconnected');
  });

  it('a good Refresh clears the message of an events list that failed before', async () => {
    const { api } = connectedApi({ qpListEvents: vi.fn().mockResolvedValue({ success: false, error: 'Request failed' }) });
    let qp = await mounted();
    expect(qp.error).toEqual({ code: 'EVENTS', message: 'Request failed' });
    api.qpListEvents = vi.fn().mockResolvedValue({ success: true, events: [event] });
    await qp.loadEvents(); qp = render(useQuickPitikUpload, {});
    expect(qp.error).toBeNull();
    expect(qp.events).toEqual([event]);
  });
});

describe('UploadView', () => {
  it('Disconnect cannot be pressed while a folder is being read', async () => {
    vi.stubGlobal('window', { electronAPI: {
      qpSessionStatus: vi.fn().mockResolvedValue({ connected: true, email: 'p@test.local', name: 'P' }),
      onQpConnectResult: vi.fn(() => () => {}), onQpUploadProgress: vi.fn(() => () => {}),
      qpListEvents: vi.fn().mockResolvedValue({ success: true, events: [event] }),
      selectFolder: vi.fn().mockResolvedValue('D:/Shoots/Theo dipolog'),
      qpScanFolder: vi.fn(() => new Promise(() => {})),
    } });
    render(UploadView, {}); await effects();
    render(UploadView, {}); await effects();
    let tree = render(UploadView, {});
    expect(button(tree, 'Disconnect').props.disabled).toBe(false);
    nodes(tree).find(n => n.type === FolderDrop).props.onClick(); await effects();
    tree = render(UploadView, {});
    expect(button(tree, 'Disconnect').props.disabled).toBe(true);
  });
});
