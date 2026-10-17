import React, { useState } from 'react';
import { Archive, CalendarClock, CalendarX, RefreshCw, SearchX } from 'lucide-react';
import { STRINGS, formatString } from '../../constants/strings';

const MANILA_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }); // YYYY-MM-DD
const MANILA_TIME = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
const RACE_DATE = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const PAGE_SIZE = 5;
const TABS = [
  ['open', STRINGS.QP_EVENT_TAB_OPEN],
  ['upcoming', STRINGS.QP_EVENT_TAB_UPCOMING],
  ['closed', STRINGS.QP_EVENT_TAB_CLOSED],
];
const EMPTY = {
  open: { Icon: CalendarX, title: STRINGS.QP_EMPTY_OPEN, help: STRINGS.QP_EMPTY_OPEN_HELP },
  upcoming: { Icon: CalendarClock, title: STRINGS.QP_EMPTY_UPCOMING, help: STRINGS.QP_EMPTY_UPCOMING_HELP },
  closed: { Icon: Archive, title: STRINGS.QP_EMPTY_CLOSED, help: STRINGS.QP_EMPTY_CLOSED_HELP },
};

/** The card a tab shows when it has nothing to list. A plain function, like eventRow, so the tests see inside it. */
function emptyCard({ Icon, title, help, action }) {
  return (
    <div className="upload-empty">
      <Icon size={28} strokeWidth={1.5} aria-hidden="true" />
      <span className="upload-kicker">{title}</span>
      {help && <p className="upload-muted">{help}</p>}
      {action && <button type="button" className="upload-link" onClick={action.onClick} disabled={action.disabled}>{action.label}</button>}
    </div>
  );
}

/** "10 Oct 2026" from a YYYY-MM-DD date. */
function raceDate(dateIso) {
  const part = Object.fromEntries(RACE_DATE.formatToParts(new Date(dateIso)).map(p => [p.type, p.value]));
  return `${part.day} ${part.month} ${part.year}`;
}

/** Whole days from Manila-today to a YYYY-MM-DD date, counted the same way the main process does. */
function daysFromToday(dateIso) {
  return Math.round((Date.parse(dateIso) - Date.parse(MANILA_DATE.format(new Date()))) / 86400000);
}

function closesText(closesOn) {
  const days = daysFromToday(closesOn);
  if (days <= 0) return STRINGS.QP_EVENT_CLOSES_TODAY;
  return days === 1 ? STRINGS.QP_EVENT_CLOSES_IN_ONE : formatString(STRINGS.QP_EVENT_CLOSES_IN, { count: days });
}

function windowText(event) {
  if (event.uploadWindow === 'upcoming') {
    const days = daysFromToday(event.date);
    return days === 1 ? STRINGS.QP_EVENT_OPENS_TOMORROW : formatString(STRINGS.QP_EVENT_OPENS_IN, { count: days });
  }
  if (event.uploadWindow === 'closed') {
    // An archived event can close before its last upload day; then there is no date to give.
    return daysFromToday(event.closesOn) < 0 ? formatString(STRINGS.QP_EVENT_CLOSED_ON, { date: raceDate(event.closesOn) }) : STRINGS.QP_EVENT_CLOSED;
  }
  return closesText(event.closesOn);
}

const whenText = event => [raceDate(event.date), event.location].filter(Boolean).join(' · ');

function matches(event, query) {
  const q = query.trim().toLowerCase();
  return !q || `${event.name} ${event.location || ''}`.toLowerCase().includes(q);
}

/** One row. A plain function, not a component, so the tests' tree shows it rendered. */
function eventRow(event, { chosen, disabled, onChange }) {
  const body = [
    <span key="main" className="upload-event-main">
      <span className="upload-event-name">{event.name}</span>
      <span className="upload-event-when">{whenText(event)}</span>
    </span>,
    <span key="side" className="upload-event-side">
      <span className={`upload-event-tag${event.ownedByMe ? ' own' : ''}`}>{event.ownedByMe ? STRINGS.QP_EVENT_TAG_OWN : STRINGS.QP_EVENT_TAG_PUBLIC}</span>
      <span className="upload-event-closes">{windowText(event)}</span>
    </span>,
  ];
  // Only an open event can be chosen; upcoming and closed ones are shown for reference.
  if (event.uploadWindow !== 'open') return <div key={event.id} className="upload-event-option static">{body}</div>;
  return (
    <button key={event.id} type="button" className="upload-event-option" aria-pressed={chosen} disabled={disabled} onClick={() => onChange(event.id)}>
      {body}
    </button>
  );
}

/** The chosen event, folded to one line, with a way back to the list. */
export function ChosenEvent({ event, onChange, disabled }) {
  return (
    <div className="upload-chosen">
      <span className="upload-event-main">
        <span className="upload-kicker">{STRINGS.QP_UPLOADING_TO}</span>
        <span className="upload-event-name">{event.name}</span>
        <span className="upload-event-when">{[whenText(event), closesText(event.closesOn)].join(' · ')}</span>
      </span>
      <button type="button" className="upload-link" onClick={onChange} disabled={disabled}>{STRINGS.QP_BTN_CHANGE_EVENT}</button>
    </div>
  );
}

/** Events from qpListEvents in three tabs (open, upcoming, closed), searchable, five to a page. */
function EventPicker({ events, value, onChange, onRefresh, disabled, loading, loadedAt }) {
  const [tab, setTab] = useState('open');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);

  const found = events.filter(event => matches(event, query));
  const list = found.filter(event => event.uploadWindow === tab);
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1); // a Refresh can shorten the list under the page
  const shown = list.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const firstLoad = loading && events.length === 0;

  let empty = null;
  if (!firstLoad && list.length === 0) {
    const q = query.trim();
    if (q) {
      const clear = () => { setQuery(''); setPage(0); };
      empty = { Icon: SearchX, title: formatString(STRINGS.QP_NO_MATCH, { query: q }), action: { label: STRINGS.QP_BTN_CLEAR_SEARCH, onClick: clear } };
    } else {
      const refresh = { label: STRINGS.QP_BTN_REFRESH_EVENTS, onClick: onRefresh, disabled: disabled || loading };
      empty = { ...EMPTY[tab], action: tab === 'open' ? refresh : null };
    }
  }

  return (
    <div className="upload-event">
      <div className="upload-event-row">
        <h2 className="upload-event-title">{STRINGS.QP_EVENT_HEADING}</h2>
        <span className="upload-refresh">
          {loadedAt && !loading && <span className="upload-updated">{formatString(STRINGS.QP_EVENTS_UPDATED, { time: MANILA_TIME.format(loadedAt) })}</span>}
          <button type="button" className="upload-link" onClick={onRefresh} disabled={disabled || loading}>
            <RefreshCw size={13} aria-hidden="true" className={loading ? 'upload-spin' : undefined} />
            {loading ? STRINGS.QP_BTN_REFRESHING : STRINGS.QP_BTN_REFRESH_EVENTS}
          </button>
        </span>
      </div>
      <p className="upload-muted">{STRINGS.QP_EVENT_HELP}</p>

      <div className="upload-tabs" role="group" aria-label={STRINGS.QP_EVENT_TABS_LABEL}>
        {TABS.map(([id, label]) => (
          <button key={id} type="button" className="upload-tab" aria-pressed={tab === id} onClick={() => { setTab(id); setPage(0); }}>
            {formatString(label, { count: found.filter(event => event.uploadWindow === id).length })}
          </button>
        ))}
      </div>
      <input
        type="search" className="upload-search" aria-label={STRINGS.QP_EVENT_SEARCH_LABEL} placeholder={STRINGS.QP_EVENT_SEARCH_PLACEHOLDER}
        value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }}
      />

      {firstLoad && (
        <div className="upload-event-list" role="status" aria-label={STRINGS.QP_EVENTS_LOADING}>
          {[0, 1, 2].map(i => <div key={i} className="upload-skeleton" />)}
        </div>
      )}
      {shown.length > 0 && (
        <div className="upload-event-list">
          {shown.map(event => eventRow(event, { chosen: event.id === value, disabled, onChange }))}
        </div>
      )}
      {empty && emptyCard(empty)}

      {list.length > PAGE_SIZE && (
        <nav className="upload-pager" aria-label={STRINGS.QP_PAGER_LABEL}>
          <button type="button" className="upload-link" disabled={current === 0} onClick={() => setPage(current - 1)}>{STRINGS.QP_PAGE_PREV}</button>
          <span>{formatString(STRINGS.QP_PAGE_OF, { page: current + 1, pages })}</span>
          <button type="button" className="upload-link" disabled={current === pages - 1} onClick={() => setPage(current + 1)}>{STRINGS.QP_PAGE_NEXT}</button>
        </nav>
      )}
    </div>
  );
}

export default EventPicker;
