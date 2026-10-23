import React from 'react';
import { STRINGS, formatString } from '../../constants/strings';
import { daysFromToday, raceDate } from './EventPicker';

/**
 * In the Upload view: the unfinished upload, as useQuickPitikUpload's resumeState says.
 * resume: Resume or Discard. closed: Discard only (R6). missing: Choose the folder again or Discard (R7).
 */
export function ResumeCard({ state, pending, event, onResume, onDiscard, onChooseAgain }) {
  // An event archived before its last day has no closing date to give (same rule as the event list).
  const closedOn = event && daysFromToday(event.closesOn) < 0 ? raceDate(event.closesOn) : null;
  let title = formatString(STRINGS.QP_RESUME_TITLE, { event: pending.eventName });
  if (state === 'closed') {
    title = closedOn
      ? formatString(STRINGS.QP_RESUME_CLOSED, { event: pending.eventName, date: closedOn })
      : formatString(STRINGS.QP_RESUME_CLOSED_NO_DATE, { event: pending.eventName });
  }
  return (
    <section className="upload-resume" aria-labelledby="qp-resume-card-title">
      <span className="upload-kicker">{STRINGS.QP_RESUME_KICKER}</span>
      <h3 id="qp-resume-card-title">{title}</h3>
      {state === 'missing'
        ? <p className="upload-error">{formatString(STRINGS.QP_RESUME_MISSING, { folder: pending.folder })}</p>
        : <span className="upload-kicker upload-path" title={pending.folder}>{pending.folder}</span>}
      {state === 'resume' && <p className="upload-muted">{STRINGS.QP_RESUME_BODY}</p>}
      <div className="upload-actions">
        <button type="button" className="btn secondary" onClick={onDiscard}>{STRINGS.QP_BTN_DISCARD}</button>
        {state === 'resume' && <button type="button" className="btn primary" onClick={onResume}>{STRINGS.BTN_RESUME}</button>}
        {state === 'missing' && <button type="button" className="btn primary" onClick={onChooseAgain}>{STRINGS.QP_BTN_CHOOSE_AGAIN}</button>}
      </div>
    </section>
  );
}
