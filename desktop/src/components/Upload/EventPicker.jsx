import React from 'react';
import { STRINGS, formatString } from '../../constants/strings';

const MANILA_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }); // YYYY-MM-DD
const RACE_DATE = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "10 Oct 2026" from a YYYY-MM-DD race date. */
function raceDate(dateIso) {
  const part = Object.fromEntries(RACE_DATE.formatToParts(new Date(dateIso)).map(p => [p.type, p.value]));
  return `${part.day} ${part.month} ${part.year}`;
}

/** Days left are counted in Manila, the same way the main process decides which events are open. */
function closesText(closesOn) {
  const days = Math.round((Date.parse(closesOn) - Date.parse(MANILA_DATE.format(new Date()))) / 86400000);
  if (days <= 0) return STRINGS.QP_EVENT_CLOSES_TODAY;
  return days === 1 ? STRINGS.QP_EVENT_CLOSES_IN_ONE : formatString(STRINGS.QP_EVENT_CLOSES_IN, { count: days });
}

/** Events open for upload (public window + the photographer's own), from qpListEvents. */
function EventPicker({ events, value, onChange, onRefresh, disabled }) {
  const groups = [
    [STRINGS.QP_EVENT_GROUP_OWN, events.filter(event => event.ownedByMe)],
    [STRINGS.QP_EVENT_GROUP_PUBLIC, events.filter(event => !event.ownedByMe)],
  ].filter(([, list]) => list.length > 0);
  return (
    <div className="upload-event">
      <div className="upload-event-row">
        <h2 className="upload-event-title">{STRINGS.QP_EVENT_HEADING}</h2>
        <button type="button" className="upload-link" onClick={onRefresh} disabled={disabled}>{STRINGS.QP_BTN_REFRESH_EVENTS}</button>
      </div>
      <p className="upload-muted">{STRINGS.QP_EVENT_HELP}</p>
      {groups.map(([heading, list]) => (
        <div key={heading} className="upload-event-group" role="group" aria-label={heading}>
          <span className="upload-kicker">{heading}</span>
          {list.map(event => (
            <button key={event.id} type="button" className="upload-event-option" aria-pressed={event.id === value} disabled={disabled} onClick={() => onChange(event.id)}>
              <span className="upload-event-main">
                <span className="upload-event-name">{event.name}</span>
                <span className="upload-event-when">{[raceDate(event.date), event.location].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="upload-event-side">
                <span className={`upload-event-tag${event.ownedByMe ? ' own' : ''}`}>{event.ownedByMe ? STRINGS.QP_EVENT_TAG_OWN : STRINGS.QP_EVENT_TAG_PUBLIC}</span>
                <span className="upload-event-closes">{closesText(event.closesOn)}</span>
              </span>
            </button>
          ))}
        </div>
      ))}
      {events.length === 0 && <p className="upload-muted">{STRINGS.QP_NO_EVENTS}</p>}
    </div>
  );
}

export default EventPicker;
