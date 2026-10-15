import React from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { STRINGS, formatString } from '../../constants/strings';

// A help link for server-side blocks (closed event, unverified account). The
// production site is right for every real user; dev runs land there too.
const QP_SITE_URL = 'https://quickpitik.com/dashboard';

function skippedInSelection(scan, selected) {
  return (scan?.folders || [])
    .filter(f => selected.includes(f.relPath))
    .reduce((sum, f) => sum + Object.values(f.skipped).reduce((a, n) => a + n, 0), 0);
}

/** Done, cancelled, or stopped by an error — with Retry failed, Reconnect or a link to the site. */
function UploadSummary({ status, progress, scan, selected, error, onRetryFailed, onReset, onReconnect }) {
  const counts = progress?.counts || { uploaded: 0, alreadyThere: 0, inTrash: 0, failed: 0, total: 0 };
  const failures = progress?.failures || [];
  const cancelled = progress?.phase === 'cancelled';
  const sessionExpired = status === 'error' && error?.code === 'SESSION_EXPIRED';
  const title = status === 'error' ? STRINGS.QP_STOPPED_TITLE : cancelled ? STRINGS.QP_CANCELLED_TITLE : STRINGS.QP_DONE_TITLE;
  return (
    <div className={`status-card upload-card ${status === 'error' || cancelled ? 'cancelled' : 'complete'}`}>
      <div className="success-icon">
        {status === 'error' || cancelled ? <AlertCircle size={56} color="var(--warning)" /> : <CheckCircle size={56} color="var(--success)" />}
      </div>
      <h2>{title}</h2>
      <p>{formatString(STRINGS.QP_DONE, {
        uploaded: counts.uploaded.toLocaleString(), alreadyThere: counts.alreadyThere.toLocaleString(),
        skipped: skippedInSelection(scan, selected).toLocaleString(), failed: counts.failed.toLocaleString(),
      })}</p>
      {counts.inTrash > 0 && <p className="upload-muted">{formatString(STRINGS.QP_IN_TRASH, { count: counts.inTrash.toLocaleString() })}</p>}
      {sessionExpired && <p role="alert" className="upload-error">{STRINGS.QP_SESSION_EXPIRED}</p>}
      {status === 'error' && !sessionExpired && <p role="alert" className="upload-error">{error?.message}</p>}
      {failures.length > 0 && (
        <div className="upload-failures">
          <span className="upload-kicker">{STRINGS.QP_FAILED_HEADING}</span>
          <ul>
            {failures.slice(0, 10).map((failure) => (
              <li key={`${failure.relPath}/${failure.name}`}>
                <span className="upload-folder-name">{failure.relPath ? `${failure.relPath}/` : ''}{failure.name}</span>
                <span className="upload-muted"> — {failure.message}</span>
              </li>
            ))}
            {failures.length > 10 && <li className="upload-muted">+{(failures.length - 10).toLocaleString()} more</li>}
          </ul>
        </div>
      )}
      <div className="upload-actions">
        {sessionExpired && <button type="button" className="btn primary" onClick={onReconnect}>{STRINGS.QP_BTN_RECONNECT}</button>}
        {status === 'error' && !sessionExpired && error?.code !== 'UPLOAD_LINK_REJECTED' && (
          <button type="button" className="btn primary" onClick={() => window.electronAPI.openExternalUrl(QP_SITE_URL)}>{STRINGS.QP_FIX_ON_SITE}</button>
        )}
        {failures.length > 0 && !sessionExpired && error?.code !== 'UPLOAD_LINK_REJECTED' && <button type="button" className="btn secondary" onClick={onRetryFailed}>{STRINGS.QP_BTN_RETRY_FAILED}</button>}
        <button type="button" className="btn secondary" onClick={onReset}>{STRINGS.QP_BTN_ANOTHER_FOLDER}</button>
      </div>
    </div>
  );
}

export default UploadSummary;
