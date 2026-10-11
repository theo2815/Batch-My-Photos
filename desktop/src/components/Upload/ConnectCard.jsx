import React from 'react';
import { Link2 } from 'lucide-react';
import { STRINGS } from '../../constants/strings';

/** First-run card: connect the QuickPitik photographer account through the browser. */
function ConnectCard({ status, error, onConnect }) {
  const connecting = status === 'connecting';
  return (
    <div className="status-card upload-card" aria-busy={connecting}>
      <div className="success-icon"><Link2 size={56} color="var(--accent-primary)" /></div>
      <span className="upload-kicker">QuickPitik</span>
      <h2>{STRINGS.QP_CONNECT_TITLE}</h2>
      <p>{connecting ? STRINGS.QP_CONNECTING : STRINGS.QP_CONNECT_BODY}</p>
      {error && <p role="alert" className="upload-error">{error.message}</p>}
      <div className="upload-actions">
        <button type="button" className="btn primary" onClick={onConnect}>{STRINGS.QP_BTN_CONNECT}</button>
      </div>
    </div>
  );
}

export default ConnectCard;
