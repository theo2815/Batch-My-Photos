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
import UploadProgress from '../src/components/Upload/UploadProgress.jsx';
import UploadSummary from '../src/components/Upload/UploadSummary.jsx';
import UploadView from '../src/components/Upload/UploadView.jsx';
import FolderDrop from '../src/components/Upload/FolderDrop.jsx';
import ConnectCard from '../src/components/Upload/ConnectCard.jsx';
import ConfirmDialog from '../src/components/Modals/ConfirmDialog.jsx';
import EventPicker, { ChosenEvent } from '../src/components/Upload/EventPicker.jsx';
import UploadResumeModal, { ResumeCard } from '../src/components/Upload/UploadResume.jsx';
import { useQuickPitikUpload } from '../src/hooks/useQuickPitikUpload.js';
import { useFolderSelection } from '../src/hooks/useFolderSelection.js';

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
const event = { id: 'e1', name: 'Cebu Marathon 2026', date: '2026-10-10', location: 'Cebu City', ownedByMe: false, state: 'live', uploadWindow: 'open', closesOn: '2026-10-13' };
const noop = () => {};

beforeEach(() => { hooks.values = []; hooks.cursor = 0; hooks.effects = []; hooks.deps = []; hooks.cleanups = []; });

describe('EventPicker', () => {
  // Manila-today is 2026-10-10 in these tests.
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-10T12:00:00+08:00')); });
  afterEach(() => { vi.useRealTimers(); });

  // In the order listEvents returns them: open newest first, upcoming next race first, closed newest first.
  const open = { ...event, closesOn: '2026-10-13' };
  const lastDay = { id: 'e2', name: 'Mandaue Dash', date: '2026-10-07', location: 'Mandaue', ownedByMe: false, state: 'live', uploadWindow: 'open', closesOn: '2026-10-10' };
  const own = { id: 'o1', name: 'My Fun Run', date: '2026-09-25', location: '', ownedByMe: true, state: 'open', uploadWindow: 'open', closesOn: '2026-10-25' };
  const soon = { id: 'u1', name: 'Lapu-Lapu Run', date: '2026-10-11', location: 'Lapu-Lapu', ownedByMe: false, state: 'upcoming', uploadWindow: 'upcoming', closesOn: '2026-10-14' };
  const later = { id: 'u2', name: 'Talisay 10K', date: '2026-10-15', location: 'Talisay', ownedByMe: false, state: 'upcoming', uploadWindow: 'upcoming', closesOn: '2026-10-18' };
  const done = { id: 'c1', name: 'Old Fun Run', date: '2026-08-01', location: 'Talisay', ownedByMe: true, state: 'open', uploadWindow: 'closed', closesOn: '2026-09-01' };
  const archived = { id: 'c2', name: 'Archived Race', date: '2026-10-08', location: '', ownedByMe: false, state: 'past', uploadWindow: 'closed', closesOn: '2026-10-11' };
  const all = [open, lastDay, own, soon, later, done, archived];

  const picker = (props) => render(EventPicker, { events: all, value: '', onChange: noop, onRefresh: noop, disabled: false, loading: false, loadedAt: null, ...props });
  const rows = (tree) => nodes(tree).filter(n => n.props?.className?.startsWith('upload-event-option'));
  const choosable = (tree) => rows(tree).filter(n => n.type === 'button');
  const names = (tree) => rows(tree).map(row => text(nodes(row).find(n => n.props?.className === 'upload-event-name')));
  const tabFor = (tree, label) => nodes(tree).find(n => n.props?.className === 'upload-tab' && text(n).startsWith(label));
  const tabs = (tree) => nodes(tree).filter(n => n.props?.className === 'upload-tab').map(text);
  const search = (tree) => nodes(tree).find(n => n.type === 'input');
  const emptyCard = (tree) => nodes(tree).find(n => n.props?.className === 'upload-empty');

  it('asks which event the photos are for and says what the choice means', () => {
    const shown = text(picker());
    expect(shown).toContain('Which event are these photos for?');
    expect(shown).toContain("Runners will find these photos on that event's page.");
  });

  it('opens on the Open tab, keeps the order it was given, and counts every tab', () => {
    const tree = picker();
    expect(tabs(tree)).toEqual(['Open (3)', 'Upcoming (2)', 'Closed (2)']);
    expect(tabFor(tree, 'Open').props['aria-pressed']).toBe(true);
    expect(names(tree)).toEqual(['Cebu Marathon 2026', 'Mandaue Dash', 'My Fun Run']);
  });

  it('a row shows the date and place, whose event it is and how long it takes uploads', () => {
    const [openRow, lastDayRow, ownRow] = rows(picker()).map(text);
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

  it('counts the days in Manila, not in UTC', () => {
    vi.setSystemTime(new Date('2026-10-10T16:30:00Z')); // already the 11th in Manila
    const [row] = rows(picker({ events: [{ ...lastDay, closesOn: '2026-10-11' }] })).map(text);
    expect(row).toContain('Uploads close today');
  });

  it('clicking an open row chooses that event, and the chosen row is marked pressed', () => {
    const onChange = vi.fn();
    const tree = picker({ value: 'e1', onChange });
    expect(choosable(tree).map(row => row.props['aria-pressed'])).toEqual([true, false, false]);
    choosable(tree)[1].props.onClick();
    expect(onChange).toHaveBeenCalledWith('e2');
  });

  it('the Upcoming tab lists the next race first, says when uploads open, and cannot be chosen', () => {
    tabFor(picker(), 'Upcoming').props.onClick();
    const tree = picker();
    expect(tabFor(tree, 'Upcoming').props['aria-pressed']).toBe(true);
    expect(names(tree)).toEqual(['Lapu-Lapu Run', 'Talisay 10K']);
    const [soonRow, laterRow] = rows(tree).map(text);
    expect(soonRow).toContain('Uploads open tomorrow');
    expect(laterRow).toContain('Uploads open in 5 days');
    expect(choosable(tree)).toEqual([]);
  });

  it('the Closed tab says when uploads closed, or only that they did when the event was archived early', () => {
    tabFor(picker(), 'Closed').props.onClick();
    const tree = picker();
    expect(names(tree)).toEqual(['Old Fun Run', 'Archived Race']);
    const [doneRow, archivedRow] = rows(tree).map(text);
    expect(doneRow).toContain('Uploads closed on 1 Sep 2026');
    expect(archivedRow).toContain('Uploads closed');
    expect(archivedRow).not.toContain('closed on');
    expect(choosable(tree)).toEqual([]);
  });

  it('search matches the name or the place, ignoring case and spaces, and the counts follow it', () => { // Review Focus 4
    search(picker()).props.onChange({ target: { value: '  TALISAY ' } });
    let tree = picker();
    expect(tabs(tree)).toEqual(['Open (0)', 'Upcoming (1)', 'Closed (1)']);
    search(tree).props.onChange({ target: { value: 'mandaue' } });
    tree = picker();
    expect(names(tree)).toEqual(['Mandaue Dash']);
  });

  it('says so when nothing matches the search, and Clear search brings the list back', () => {
    search(picker()).props.onChange({ target: { value: 'zzz ' } });
    const card = emptyCard(picker());
    expect(text(card)).toContain('No event matches "zzz"');
    button(card, 'Clear search').props.onClick();
    const tree = picker();
    expect(search(tree).props.value).toBe('');
    expect(names(tree)).toEqual(['Cebu Marathon 2026', 'Mandaue Dash', 'My Fun Run']);
  });

  describe('pages of five', () => {
    const many = (n) => Array.from({ length: n }, (_, i) => ({ ...open, id: `p${i + 1}`, name: `Race ${i + 1}` }));
    const pager = (tree) => nodes(tree).find(n => n.type === 'nav');

    it('shows five rows and moves between pages', () => {
      let tree = picker({ events: many(12) });
      expect(names(tree)).toEqual(['Race 1', 'Race 2', 'Race 3', 'Race 4', 'Race 5']);
      expect(text(pager(tree))).toContain('Page 1 of 3');
      expect(button(tree, '‹ Previous').props.disabled).toBe(true);
      button(tree, 'Next ›').props.onClick();
      tree = picker({ events: many(12) });
      expect(names(tree)).toEqual(['Race 6', 'Race 7', 'Race 8', 'Race 9', 'Race 10']);
      button(tree, 'Next ›').props.onClick();
      tree = picker({ events: many(12) });
      expect(names(tree)).toEqual(['Race 11', 'Race 12']);
      expect(button(tree, 'Next ›').props.disabled).toBe(true);
    });

    it('a new search or another tab starts again at page 1', () => {
      button(picker({ events: many(12) }), 'Next ›').props.onClick();
      search(picker({ events: many(12) })).props.onChange({ target: { value: 'Race' } });
      expect(text(pager(picker({ events: many(12) })))).toContain('Page 1 of 3');
      button(picker({ events: many(12) }), 'Next ›').props.onClick();
      tabFor(picker({ events: many(12) }), 'Open').props.onClick();
      expect(text(pager(picker({ events: many(12) })))).toContain('Page 1 of 3');
    });

    it('a Refresh that shortens the list moves back to its last page', () => { // Review Focus 1
      button(picker({ events: many(12) }), 'Next ›').props.onClick();
      button(picker({ events: many(12) }), 'Next ›').props.onClick();
      const tree = picker({ events: many(6) });
      expect(text(pager(tree))).toContain('Page 2 of 2');
      expect(names(tree)).toEqual(['Race 6']);
    });

    it('shows no page buttons for five events or fewer', () => {
      expect(pager(picker({ events: many(5) }))).toBeUndefined();
    });
  });

  it('while the first list loads it shows placeholders, not "no events"', () => {
    const tree = picker({ events: [], loading: true });
    expect(nodes(tree).filter(n => n.props?.className === 'upload-skeleton')).toHaveLength(3);
    expect(nodes(tree).find(n => n.props?.role === 'status').props['aria-label']).toBe('Loading events…');
    expect(emptyCard(tree)).toBeUndefined();
    expect(button(tree, 'Refreshing…').props.disabled).toBe(true);
  });

  it('a Refresh keeps the rows on screen and only changes the button', () => {
    const tree = picker({ loading: true, loadedAt: new Date() });
    expect(names(tree)).toEqual(['Cebu Marathon 2026', 'Mandaue Dash', 'My Fun Run']);
    expect(nodes(tree).filter(n => n.props?.className === 'upload-skeleton')).toEqual([]);
    expect(button(tree, 'Refreshing…').props.disabled).toBe(true);
    expect(text(tree)).not.toContain('Updated');
  });

  it('says when the list was last updated, in Manila time', () => {
    expect(text(picker({ loadedAt: new Date('2026-10-10T07:42:00Z') }))).toMatch(/Updated 3:42\sPM/);
  });

  it('explains each empty tab in a card, with Refresh on the Open tab only', () => {
    const onRefresh = vi.fn();
    const tree = picker({ events: [], onRefresh });
    let card = emptyCard(tree);
    expect(text(card)).toContain('Nothing open right now');
    expect(text(card)).toContain('Public events take photos on race day and for 3 days after; your own events for one month.');
    button(card, 'Refresh').props.onClick();
    expect(onRefresh).toHaveBeenCalledTimes(1);
    // While a Refresh runs over a list with no open event, the card's Refresh waits too.
    expect(button(emptyCard(picker({ events: [soon], loading: true, loadedAt: new Date() })), 'Refresh').props.disabled).toBe(true);
    tabFor(tree, 'Upcoming').props.onClick();
    card = emptyCard(picker({ events: [] }));
    expect(text(card)).toContain('No upcoming events');
    expect(text(card)).toContain('Public events show here before race day.');
    expect(nodes(card).filter(n => n.type === 'button')).toEqual([]);
    tabFor(picker({ events: [] }), 'Closed').props.onClick();
    card = emptyCard(picker({ events: [] }));
    expect(text(card)).toContain('No closed events');
    expect(text(card)).toContain('Your events, and events you uploaded to, show here after uploads close.');
  });

  it('cannot be used while the view is busy', () => {
    const tree = picker({ disabled: true });
    expect(choosable(tree).map(row => row.props.disabled)).toEqual([true, true, true]);
    expect(button(tree, 'Refresh').props.disabled).toBe(true);
  });
});

describe('ChosenEvent', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-10T12:00:00+08:00')); });
  afterEach(() => { vi.useRealTimers(); });

  it('names the chosen event on one line and offers Change', () => {
    const onChange = vi.fn();
    const tree = render(ChosenEvent, { event, onChange, disabled: false });
    expect(text(tree)).toContain('Uploading to');
    expect(text(tree)).toContain('Cebu Marathon 2026');
    expect(text(tree)).toContain('10 Oct 2026 · Cebu City · Uploads close in 3 days');
    button(tree, 'Change').props.onClick();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(button(render(ChosenEvent, { event, onChange, disabled: true }), 'Change').props.disabled).toBe(true);
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

  it('names the photos that sit in the trash on quickpitik.com', () => {
    const progress = { phase: 'done', counts: { uploaded: 1, alreadyThere: 2, inTrash: 3, failed: 0, total: 6 }, bytes: { sent: 6, total: 6 }, failures: [] };
    const tree = render(UploadSummary, { status: 'done', progress, scan, selected: [''], error: null, onRetryFailed: noop, onReset: noop, onReconnect: noop });
    expect(text(tree)).toContain('1 uploaded. 2 already there. 2 skipped. 0 failed.');
    expect(text(tree)).toContain('3 are in your trash on quickpitik.com. Restore them there to bring them back; uploading again will not.');
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

  it('a rejected upload link blames this app, not the website', () => {
    const tree = render(UploadSummary, { status: 'error', progress: { phase: 'error', counts: { uploaded: 0, alreadyThere: 0, failed: 0, total: 6 }, bytes: { sent: 0, total: 6 }, failures: [] },
      scan, selected: [''], error: { code: 'UPLOAD_LINK_REJECTED', message: 'This version of BatchMyPhotos is not set up for uploads to QuickPitik. Update the app and try again.' }, onRetryFailed: noop, onReset: noop, onReconnect: noop });
    expect(text(tree)).toContain('Update the app and try again.');
    expect(button(tree, 'Fix this on quickpitik.com')).toBeUndefined();
    expect(button(tree, 'Upload another folder')).toBeDefined();
  });

  it('after a rejected upload link, Retry failed is not offered either', () => {
    const failures = [{ relPath: '', name: 'bad.jpg', code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Not an image.', retryable: false }];
    const tree = render(UploadSummary, { status: 'error', progress: { phase: 'error', counts: { uploaded: 0, alreadyThere: 0, inTrash: 0, failed: 1, total: 6 }, bytes: { sent: 0, total: 6 }, failures },
      scan, selected: [''], error: { code: 'UPLOAD_LINK_REJECTED', message: 'This version of BatchMyPhotos is not set up for uploads to QuickPitik. Update the app and try again.' }, onRetryFailed: noop, onReset: noop, onReconnect: noop });
    expect(button(tree, 'Retry failed')).toBeUndefined();
    expect(button(tree, 'Upload another folder')).toBeDefined();
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
      qpUploadPending: vi.fn().mockResolvedValue({ running: false, pending: null }),
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
    expect(api.qpUploadStart).toHaveBeenCalledWith({ rootPath: 'D:/Shoots/Theo dipolog', eventId: 'e1', eventName: 'Cebu Marathon 2026', folders: ['', 'Race A'] });
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
      qpUploadPending: vi.fn().mockResolvedValue({ running: false, pending: null }),
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
      qpUploadPending: vi.fn().mockResolvedValue({ running: false, pending: null }),
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

  const other = { ...event, id: 'e2', name: 'Mandaue Dash' };

  it('never chooses an event by itself, not even the only open one', async () => {
    connectedApi();
    expect((await mounted()).eventId).toBe('');
  });

  it('leaves the choice to the photographer when two events are open', async () => {
    connectedApi({ qpListEvents: vi.fn().mockResolvedValue({ success: true, events: [event, other] }) });
    expect((await mounted()).eventId).toBe('');
  });

  it('a Refresh keeps a chosen event that is still open', async () => {
    const { api } = connectedApi({ qpListEvents: vi.fn().mockResolvedValue({ success: true, events: [event, other] }) });
    let qp = await mounted();
    qp.setEventId('e2');
    api.qpListEvents = vi.fn().mockResolvedValue({ success: true, events: [other] });
    await qp.loadEvents(); qp = render(useQuickPitikUpload, {});
    expect(qp.eventId).toBe('e2');
  });

  it('a Refresh drops a chosen event that is gone or no longer open', async () => {
    const { api } = connectedApi({ qpListEvents: vi.fn().mockResolvedValue({ success: true, events: [event, other] }) });
    let qp = await mounted();
    qp.setEventId('e2');
    api.qpListEvents = vi.fn().mockResolvedValue({ success: true, events: [event] });
    await qp.loadEvents(); qp = render(useQuickPitikUpload, {});
    expect(qp.eventId).toBe('');

    qp.setEventId('e1');
    api.qpListEvents = vi.fn().mockResolvedValue({ success: true, events: [{ ...event, uploadWindow: 'closed' }] });
    await qp.loadEvents(); qp = render(useQuickPitikUpload, {});
    expect(qp.eventId).toBe('');
  });

  it('says the list is loading until the answer arrives, then when it was updated', async () => {
    let answer;
    connectedApi({ qpListEvents: vi.fn(() => new Promise((resolve) => { answer = resolve; })) });
    let qp = await mounted();
    expect(qp.eventsLoading).toBe(true);
    expect(qp.eventsLoadedAt).toBeNull();
    answer({ success: true, events: [event] }); await effects();
    qp = render(useQuickPitikUpload, {});
    expect(qp.eventsLoading).toBe(false);
    expect(qp.eventsLoadedAt).toBeInstanceOf(Date);
  });

  it('a Refresh that fails keeps the list it had and stops loading', async () => { // Review Focus 3
    const { api } = connectedApi();
    let qp = await mounted();
    api.qpListEvents = vi.fn().mockResolvedValue({ success: false, error: 'Request failed' });
    await qp.loadEvents(); qp = render(useQuickPitikUpload, {});
    expect(qp.events).toEqual([event]);
    expect(qp.eventsLoading).toBe(false);
    expect(qp.error).toEqual({ code: 'EVENTS', message: 'Request failed' });
  });
});

describe('UploadView', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-10T12:00:00+08:00')); });
  afterEach(() => { vi.useRealTimers(); });

  function viewApi(over = {}) {
    const api = {
      qpSessionStatus: vi.fn().mockResolvedValue({ connected: true, email: 'p@test.local', name: 'P' }),
      onQpConnectResult: vi.fn(() => () => {}), onQpUploadProgress: vi.fn(() => () => {}),
      qpListEvents: vi.fn().mockResolvedValue({ success: true, events: [event] }),
      selectFolder: vi.fn().mockResolvedValue('D:/Shoots/Theo dipolog'),
      qpScanFolder: vi.fn().mockResolvedValue(scan),
      qpDisconnect: vi.fn().mockResolvedValue({ success: true }),
      qpUploadPending: vi.fn().mockResolvedValue({ running: false, pending: null }),
      ...over,
    };
    vi.stubGlobal('window', { electronAPI: api });
    return api;
  }
  async function view() {
    render(UploadView, {}); await effects();
    render(UploadView, {}); await effects();
    return render(UploadView, {});
  }
  const find = (tree, type) => nodes(tree).find(n => n.type === type);
  async function chooseEvent(tree) {
    find(tree, EventPicker).props.onChange('e1');
    return render(UploadView, {});
  }

  it('shows no drop zone until an open event is chosen, then folds the list to that event', async () => {
    viewApi();
    let tree = await view();
    expect(find(tree, EventPicker)).toBeDefined();
    expect(find(tree, FolderDrop)).toBeUndefined();
    expect(text(tree)).toContain('Choose an open event, then add your shoot folder.');
    tree = await chooseEvent(tree);
    expect(find(tree, EventPicker)).toBeUndefined();
    expect(find(tree, ChosenEvent).props.event.id).toBe('e1');
    expect(find(tree, FolderDrop)).toBeDefined();
    expect(text(tree)).not.toContain('Choose an open event');
  });

  it('gives no hint to choose when no event is open', async () => {
    viewApi({ qpListEvents: vi.fn().mockResolvedValue({ success: true, events: [{ ...event, uploadWindow: 'upcoming' }] }) });
    expect(text(await view())).not.toContain('Choose an open event');
  });

  it('Change opens the list again and keeps a folder already read', async () => { // Review Focus 2
    viewApi();
    let tree = await chooseEvent(await view());
    await find(tree, FolderDrop).props.onClick(); // no effects(): the test React re-runs the mount effect
    tree = render(UploadView, {});
    expect(find(tree, ReviewTable)).toBeDefined();
    find(tree, ChosenEvent).props.onChange();
    tree = render(UploadView, {});
    expect(find(tree, EventPicker)).toBeDefined();
    expect(find(tree, ReviewTable)).toBeUndefined();
    tree = await chooseEvent(tree);
    expect(find(tree, ReviewTable).props.scan).toBe(scan);
  });

  it('Disconnect asks first: Cancel keeps the session, Disconnect signs out', async () => {
    const api = viewApi();
    let tree = await view();
    expect(find(tree, ConfirmDialog).props.isOpen).toBe(false);
    button(tree, 'Disconnect').props.onClick();
    tree = render(UploadView, {});
    const dialog = find(tree, ConfirmDialog);
    expect(dialog.props).toMatchObject({ isOpen: true, danger: true, title: 'Disconnect from QuickPitik?', confirmLabel: 'Disconnect', cancelLabel: 'Cancel' });
    dialog.props.onCancel();
    tree = render(UploadView, {});
    expect(find(tree, ConfirmDialog).props.isOpen).toBe(false);
    expect(api.qpDisconnect).not.toHaveBeenCalled();

    button(tree, 'Disconnect').props.onClick();
    find(render(UploadView, {}), ConfirmDialog).props.onConfirm(); await effects();
    tree = render(UploadView, {});
    expect(api.qpDisconnect).toHaveBeenCalledTimes(1);
    expect(tree.type).toBe(ConnectCard);
  });

  it('Disconnect and Change cannot be pressed while a folder is being read', async () => {
    viewApi({ qpScanFolder: vi.fn(() => new Promise(() => {})) });
    let tree = await chooseEvent(await view());
    expect(button(tree, 'Disconnect').props.disabled).toBe(false);
    find(tree, FolderDrop).props.onClick(); await effects();
    tree = render(UploadView, {});
    expect(button(tree, 'Disconnect').props.disabled).toBe(true);
    expect(find(tree, ChosenEvent).props.disabled).toBe(true);
  });
});

describe('Cancel upload asks first', () => {
  const live = { phase: 'uploading', folder: null, counts: { uploaded: 5, alreadyThere: 0, failed: 0, total: 40 }, bytes: { sent: 5, total: 40 } };
  const find = (tree, type) => nodes(tree).find(n => n.type === type);
  const card = (onCancel) => render(UploadProgress, { progress: live, onCancel });

  it('keeps the question outside the status card, so the card text styles do not reach it', () => {
    const tree = card(vi.fn());
    const statusCard = nodes(tree).find(n => String(n.props?.className).includes('status-card'));
    expect(statusCard).toBeDefined();
    expect(find(tree, ConfirmDialog)).toBeDefined();
    expect(nodes(statusCard).some(n => n.type === ConfirmDialog)).toBe(false);
  });

  it('pressing Cancel upload shows the question and does not stop anything', () => {
    const onCancel = vi.fn();
    button(card(onCancel), 'Cancel upload').props.onClick();
    const dialog = find(card(onCancel), ConfirmDialog);
    expect(dialog.props).toMatchObject({
      isOpen: true, danger: true, title: 'Stop this upload?', confirmLabel: 'Stop upload', cancelLabel: 'Keep uploading',
      message: 'Photos already sent stay on QuickPitik. Upload the folder again later and the app skips them.',
    });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('Stop upload cancels once and closes the question', () => {
    const onCancel = vi.fn();
    button(card(onCancel), 'Cancel upload').props.onClick();
    find(card(onCancel), ConfirmDialog).props.onConfirm();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(find(card(onCancel), ConfirmDialog).props.isOpen).toBe(false);
  });

  it('Keep uploading (also Escape or a click outside) cancels nothing and closes the question', () => {
    const onCancel = vi.fn();
    button(card(onCancel), 'Cancel upload').props.onClick();
    find(card(onCancel), ConfirmDialog).props.onCancel();
    expect(onCancel).not.toHaveBeenCalled();
    expect(find(card(onCancel), ConfirmDialog).props.isOpen).toBe(false);
  });

  it('the question lives in the progress card, so it is gone when the upload leaves "uploading"', async () => {
    let progress;
    vi.stubGlobal('window', { electronAPI: {
      qpSessionStatus: vi.fn().mockResolvedValue({ connected: true, email: 'p@test.local', name: 'P' }),
      onQpConnectResult: vi.fn(() => () => {}), onQpUploadProgress: vi.fn((cb) => { progress = cb; return () => {}; }),
      qpListEvents: vi.fn().mockResolvedValue({ success: true, events: [event] }), qpUploadCancel: vi.fn(),
      qpUploadPending: vi.fn().mockResolvedValue({ running: false, pending: null }),
    } });
    render(UploadView, {}); await effects();
    render(UploadView, {}); await effects();
    for (let i = 0; i < 5; i++) await effects(); // let the session and events answers land first
    progress(live);
    let tree = render(UploadView, {});
    expect(tree.type).toBe(UploadProgress);
    expect(find(tree, ConfirmDialog)).toBeUndefined(); // not in the view's own tree
    progress({ ...live, phase: 'done' }); // no effects() here: the test React re-runs the mount effect, which would put the view back to ready
    tree = render(UploadView, {});
    expect(tree.type).toBe(UploadSummary);
    expect(find(tree, ConfirmDialog)).toBeUndefined();
  });
});

describe('ConfirmDialog', () => {
  const dialog = (props) => render(ConfirmDialog, {
    isOpen: true, title: 'Disconnect from QuickPitik?', message: 'You will need to connect again.',
    confirmLabel: 'Disconnect', cancelLabel: 'Cancel', onConfirm: noop, onCancel: noop, ...props,
  });

  it('shows nothing while closed', () => {
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    expect(dialog({ isOpen: false })).toBeNull();
  });

  it('asks the question, starts on the safe answer, and reports each answer', () => {
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const onConfirm = vi.fn(); const onCancel = vi.fn();
    const tree = dialog({ onConfirm, onCancel, danger: true });
    const box = nodes(tree).find(n => n.props?.role === 'alertdialog');
    expect(box.props['aria-modal']).toBe('true');
    expect(text(tree)).toContain('Disconnect from QuickPitik?');
    expect(text(tree)).toContain('You will need to connect again.');
    expect(button(tree, 'Cancel').props.autoFocus).toBe(true);
    expect(button(tree, 'Disconnect').props.className).toBe('btn danger');
    button(tree, 'Disconnect').props.onClick();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    button(tree, 'Cancel').props.onClick();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('a click outside the box cancels; a click inside does not', () => {
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const onCancel = vi.fn();
    const tree = dialog({ onCancel });
    tree.props.onClick();
    expect(onCancel).toHaveBeenCalledTimes(1);
    const stopPropagation = vi.fn();
    nodes(tree).find(n => n.props?.role === 'alertdialog').props.onClick({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalled();
  });

  it('Escape cancels, and the key listener goes away when it closes', async () => {
    const listeners = {};
    const win = { addEventListener: vi.fn((type, fn) => { listeners[type] = fn; }), removeEventListener: vi.fn() };
    vi.stubGlobal('window', win);
    const onCancel = vi.fn();
    dialog({ onCancel }); await effects();
    listeners.keydown({ key: 'Enter', preventDefault() {} });
    expect(onCancel).not.toHaveBeenCalled();
    listeners.keydown({ key: 'Escape', preventDefault() {} });
    expect(onCancel).toHaveBeenCalledTimes(1);
    dialog({ onCancel, isOpen: false }); await effects();
    expect(win.removeEventListener).toHaveBeenCalledWith('keydown', listeners.keydown);
  });
});

describe('dropped folders get their path from webUtils (File.path is gone in Electron 32)', () => {
  const folder = { name: 'Race' };
  const dropEvent = () => ({ preventDefault() {}, stopPropagation() {},
    dataTransfer: { items: [{ webkitGetAsEntry: () => ({ isDirectory: true }) }], files: [folder] } });
  const bridge = () => ({ getPathForFile: vi.fn(() => 'D:\\Shoots\\Race'),
    registerDroppedFolder: vi.fn().mockResolvedValue({ success: false, error: 'stop here' }) });

  it('the Upload view registers the dropped folder by its webUtils path', async () => {
    const api = { ...bridge(), onQpConnectResult: () => () => {}, onQpUploadProgress: () => () => {} };
    vi.stubGlobal('window', { electronAPI: api });
    await render(useQuickPitikUpload, {}).handleDrop(dropEvent());
    expect(api.getPathForFile).toHaveBeenCalledWith(folder);
    expect(api.registerDroppedFolder).toHaveBeenCalledWith('D:\\Shoots\\Race');
  });

  it('the Idle screen registers the dropped folder by its webUtils path', async () => {
    const api = bridge();
    vi.stubGlobal('window', { electronAPI: api });
    await render(useFolderSelection, { setAppState() {}, setError() {}, scanFolder: vi.fn() }).handleDrop(dropEvent());
    expect(api.getPathForFile).toHaveBeenCalledWith(folder);
    expect(api.registerDroppedFolder).toHaveBeenCalledWith('D:\\Shoots\\Race');
  });

  it('an empty path (a File with no file behind it) is treated like a missing path', async () => {
    const api = { ...bridge(), onQpConnectResult: () => () => {}, onQpUploadProgress: () => () => {} };
    api.getPathForFile.mockReturnValue('');
    vi.stubGlobal('window', { electronAPI: api });
    await render(useQuickPitikUpload, {}).handleDrop(dropEvent());
    expect(render(useQuickPitikUpload, {}).error.code).toBe('SCAN');
    const setError = vi.fn();
    await render(useFolderSelection, { setAppState() {}, setError, scanFolder: vi.fn() }).handleDrop(dropEvent());
    expect(setError).not.toHaveBeenCalled();
    expect(api.registerDroppedFolder).not.toHaveBeenCalled();
  });
});

describe('resume an unfinished upload', () => {
  const fresh = () => Object.assign(hooks, { values: [], cursor: 0, effects: [], deps: [], cleanups: [] });
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-20T12:00:00+08:00')); });
  afterEach(() => { vi.useRealTimers(); });

  const pending = { eventId: 'e1', eventName: 'Cebu Marathon 2026', folder: 'D:/Shoots/Theo dipolog', folderMissing: false };
  const resumed = { success: true, total: 400, eventId: 'e1', folders: ['Race A'], scan };
  function resumeApi(over = {}) {
    const api = {
      qpSessionStatus: vi.fn().mockResolvedValue({ connected: true, email: 'p@test.local', name: 'P' }),
      onQpConnectResult: vi.fn(() => () => {}), onQpUploadProgress: vi.fn(() => () => {}),
      qpListEvents: vi.fn().mockResolvedValue({ success: true, events: [event] }),
      qpUploadPending: vi.fn().mockResolvedValue({ running: false, pending }),
      qpUploadStart: vi.fn().mockResolvedValue(resumed),
      qpUploadDiscard: vi.fn().mockResolvedValue({ success: true }),
      ...over,
    };
    vi.stubGlobal('window', { electronAPI: api });
    return api;
  }
  async function mountedHook(props = {}) {
    render(useQuickPitikUpload, props); await effects();
    render(useQuickPitikUpload, props); await effects();
    return render(useQuickPitikUpload, props);
  }
  const closedEvent = { ...event, uploadWindow: 'closed', closesOn: '2026-10-13' };

  it('offers Resume once the list shows the event open; Resume sends only the flag and takes back the saved run', async () => { // R1, D2
    const api = resumeApi();
    let qp = await mountedHook();
    expect(qp.resumeState).toBe('resume');
    expect(qp.pendingEvent).toEqual(event);
    await qp.resume(); qp = render(useQuickPitikUpload, {});
    expect(api.qpUploadStart).toHaveBeenCalledWith({ resume: true });
    expect(qp).toMatchObject({ status: 'uploading', eventId: 'e1', scan, selected: ['Race A'], pending: null, resumeState: null });
  });

  it('says the event closed, or that the folder is gone, instead of offering Resume', async () => { // R6, R7
    resumeApi({ qpListEvents: vi.fn().mockResolvedValue({ success: true, events: [closedEvent] }) });
    expect((await mountedHook()).resumeState).toBe('closed');
    fresh();
    resumeApi({ qpUploadPending: vi.fn().mockResolvedValue({ running: false, pending: { ...pending, folderMissing: true } }) });
    let qp = await mountedHook();
    expect(qp.resumeState).toBe('missing');
    qp.chooseFolderAgain(); qp = render(useQuickPitikUpload, {});
    expect(qp).toMatchObject({ eventId: 'e1', pending: null, resumeState: null });
  });

  it('a list that failed to load leaves the closed check to the server', async () => { // R6
    resumeApi({ qpListEvents: vi.fn().mockResolvedValue({ success: false, error: 'Request failed' }) });
    expect((await mountedHook()).resumeState).toBe('resume');
  });

  it('an upload still running after the screen reloaded shows as uploading and locks the view tabs', async () => { // R10
    resumeApi({ qpUploadPending: vi.fn().mockResolvedValue({ running: true, pending: null }) });
    const busy = vi.fn();
    const qp = await mountedHook({ onBusyChange: busy });
    expect(qp.status).toBe('uploading');
    expect(qp.resumeState).toBeNull();
    render(useQuickPitikUpload, { onBusyChange: busy }); await effects();
    expect(busy).toHaveBeenLastCalledWith(true);
  });

  it('a Resume the main process refuses shows why and reads the offer again', async () => {
    const api = resumeApi({ qpUploadStart: vi.fn().mockResolvedValue({ success: false, error: 'The folder is not there. Plug in the card or choose the folder again.' }) });
    let qp = await mountedHook();
    api.qpUploadPending.mockClear();
    await qp.resume(); qp = render(useQuickPitikUpload, {});
    expect(qp.status).toBe('ready');
    expect(qp.error).toEqual({ code: 'UPLOAD', message: 'The folder is not there. Plug in the card or choose the folder again.' });
    expect(api.qpUploadPending).toHaveBeenCalledTimes(1);
  });

  it('a new upload replaces the offer', async () => { // R11
    resumeApi({ qpUploadStart: vi.fn().mockResolvedValue({ success: true, total: 412 }), selectFolder: vi.fn().mockResolvedValue('D:/Shoots/Other'), qpScanFolder: vi.fn().mockResolvedValue(scan) });
    let qp = await mountedHook();
    qp.setEventId('e1');
    await qp.chooseFolder(); qp = render(useQuickPitikUpload, {});
    await qp.startUpload(); qp = render(useQuickPitikUpload, {});
    expect(qp.pending).toBeNull();
  });

  it('Discard forgets the offer', async () => { // R3
    const api = resumeApi();
    let qp = await mountedHook();
    await qp.discardPending(); qp = render(useQuickPitikUpload, {});
    expect(api.qpUploadDiscard).toHaveBeenCalledTimes(1);
    expect(qp.resumeState).toBeNull();
  });

  it('reads the offer again after Connect, so it is always the connected account’s', async () => { // R5, R9
    let connectResult;
    const api = resumeApi({
      qpSessionStatus: vi.fn().mockResolvedValue({ connected: false, email: null, name: null }),
      onQpConnectResult: vi.fn((cb) => { connectResult = cb; return () => {}; }),
    });
    await mountedHook();
    expect(api.qpUploadPending).not.toHaveBeenCalled();
    connectResult({ success: true, email: 'p@test.local', name: 'P' }); await effects();
    expect(api.qpUploadPending).toHaveBeenCalled();
  });

  it("the launch pop-up's Resume starts the upload once, and only when it can", async () => { // D3
    let api = resumeApi();
    await mountedHook({ resumeOnOpen: true });
    for (let i = 0; i < 3; i++) { render(useQuickPitikUpload, { resumeOnOpen: true }); await effects(); }
    expect(api.qpUploadStart).toHaveBeenCalledTimes(1);
    expect(api.qpUploadStart).toHaveBeenCalledWith({ resume: true });
    fresh();
    api = resumeApi({ qpListEvents: vi.fn().mockResolvedValue({ success: true, events: [closedEvent] }) });
    await mountedHook({ resumeOnOpen: true });
    expect(api.qpUploadStart).not.toHaveBeenCalled();
  });

  describe('ResumeCard', () => {
    const card = (props) => render(ResumeCard, { pending, event, onResume: noop, onDiscard: noop, onChooseAgain: noop, ...props });

    it('resume: names the event and the folder, with Discard and Resume', () => {
      const onResume = vi.fn(); const onDiscard = vi.fn();
      const tree = card({ state: 'resume', onResume, onDiscard });
      expect(text(tree)).toContain('Your upload to Cebu Marathon 2026 did not finish.');
      expect(text(tree)).toContain('D:/Shoots/Theo dipolog');
      expect(text(tree)).toContain('Resume sends the subfolders that did not finish. Photos already on QuickPitik are skipped.');
      button(tree, 'Resume').props.onClick();
      button(tree, 'Discard').props.onClick();
      expect([onResume.mock.calls.length, onDiscard.mock.calls.length]).toEqual([1, 1]);
    });

    it('closed: says when uploads closed and offers only Discard', () => { // R6
      const tree = card({ state: 'closed', event: closedEvent });
      expect(text(tree)).toContain('Uploads for Cebu Marathon 2026 closed on 13 Oct 2026.');
      expect(nodes(tree).filter(n => n.type === 'button').map(text)).toEqual(['Discard']);
      expect(text(card({ state: 'closed', event: null }))).toContain('Uploads for Cebu Marathon 2026 are closed.');
    });

    it('missing: says the folder is not there, with Choose the folder again', () => { // R7
      const onChooseAgain = vi.fn();
      const tree = card({ state: 'missing', pending: { ...pending, folderMissing: true }, onChooseAgain });
      expect(text(tree)).toContain('The folder D:/Shoots/Theo dipolog is not there. Plug the card or drive back in and press Refresh, or choose the folder again.');
      expect(nodes(tree).filter(n => n.type === 'button').map(text)).toEqual(['Discard', 'Choose the folder again']);
      button(tree, 'Choose the folder again').props.onClick();
      expect(onChooseAgain).toHaveBeenCalledTimes(1);
    });
  });

  it('the Upload view shows the card above the event list', async () => {
    resumeApi();
    render(UploadView, {}); await effects();
    render(UploadView, {}); await effects();
    const tree = render(UploadView, {});
    const shown = nodes(tree).find(n => n.type === ResumeCard);
    expect(shown.props).toMatchObject({ state: 'resume', pending, event });
    const kids = nodes(tree).filter(n => n.type === ResumeCard || n.type === EventPicker).map(n => n.type);
    expect(kids).toEqual([ResumeCard, EventPicker]);
  });

  describe('UploadResumeModal (at launch)', () => {
    async function modal(props) { render(UploadResumeModal, props); await effects(); return render(UploadResumeModal, props); }

    it('asks about the unfinished upload: Resume hands over and closes, starting on Resume', async () => { // D3
      resumeApi();
      const props = { onResume: vi.fn(), onRunning: vi.fn() };
      const tree = await modal(props);
      expect(nodes(tree).find(n => n.props?.role === 'dialog').props['aria-modal']).toBe('true');
      expect(text(tree)).toContain('Your upload to Cebu Marathon 2026 did not finish.');
      expect(button(tree, 'Resume').props.autoFocus).toBe(true);
      button(tree, 'Resume').props.onClick();
      expect(props.onResume).toHaveBeenCalledTimes(1);
      expect(render(UploadResumeModal, props)).toBeNull();
    });

    it('Discard forgets the upload and closes', async () => { // R3
      const api = resumeApi();
      const props = { onResume: vi.fn(), onRunning: vi.fn() };
      button(await modal(props), 'Discard').props.onClick();
      expect(api.qpUploadDiscard).toHaveBeenCalledTimes(1);
      expect(props.onResume).not.toHaveBeenCalled();
      expect(render(UploadResumeModal, props)).toBeNull();
    });

    it('shows nothing when there is nothing to resume, and opens the Upload view for a running upload', async () => { // R10
      resumeApi({ qpUploadPending: vi.fn().mockResolvedValue({ running: false, pending: null }) });
      const props = { onResume: vi.fn(), onRunning: vi.fn() };
      expect(await modal(props)).toBeNull();
      fresh();
      resumeApi({ qpUploadPending: vi.fn().mockResolvedValue({ running: true, pending: null }) });
      expect(await modal(props)).toBeNull();
      expect(props.onRunning).toHaveBeenCalledTimes(1);
    });
  });
});
