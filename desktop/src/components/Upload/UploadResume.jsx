import React, { useEffect, useState } from 'react';
import { STRINGS, formatString } from '../../constants/strings';
import { daysFromToday, raceDate } from './EventPicker';
import '../Modals/Modals.css';

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

/**
 * At launch, over whichever view is open (D3): "Your upload to <Event> did not finish."
 * Resume hands over to the Upload view; a running upload (the screen reloaded) goes straight there (R10).
 * No Escape or click-outside answer: either one would have to mean Resume or Discard.
 */
function UploadResumeModal({ onResume, onRunning }) {
  const [pending, setPending] = useState(null);
  useEffect(() => {
    window.electronAPI.qpUploadPending().then((upload) => {
      if (upload.running) onRunning();
      else setPending(upload.pending);
    }).catch(() => {});
  }, [onRunning]);

  if (!pending) return null;
  const discard = () => { setPending(null); window.electronAPI.qpUploadDiscard().catch(() => {}); };
  const resume = () => { setPending(null); onResume(); };
  return (
    <div className="modal-overlay">
      <div className="modal-content confirmation-modal confirm-dialog" role="dialog" aria-modal="true"
        aria-labelledby="qp-resume-title" aria-describedby="qp-resume-body">
        <h3 id="qp-resume-title">{formatString(STRINGS.QP_RESUME_TITLE, { event: pending.eventName })}</h3>
        <p id="qp-resume-body">{STRINGS.QP_RESUME_BODY}</p>
        <div className="modal-buttons">
          <button type="button" className="btn secondary" onClick={discard}>{STRINGS.QP_BTN_DISCARD}</button>
          <button type="button" className="btn primary" onClick={resume} autoFocus>{STRINGS.BTN_RESUME}</button>
        </div>
      </div>
    </div>
  );
}

export default UploadResumeModal;
