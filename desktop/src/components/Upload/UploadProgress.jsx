import React, { useState } from 'react';
import { STRINGS, formatString } from '../../constants/strings';
import ConfirmDialog from '../Modals/ConfirmDialog';

const PHASE_LABEL = {
  hashing: STRINGS.QP_PHASE_HASHING,
  checking: STRINGS.QP_PHASE_CHECKING,
  uploading: STRINGS.QP_PHASE_UPLOADING,
  waiting: STRINGS.QP_PHASE_WAITING,
  'folder-done': STRINGS.QP_PHASE_UPLOADING,
};

/** Overall bytes bar, the folder being worked on, live counts, Cancel (asks first; the question closes with this card). */
function UploadProgress({ progress, onCancel }) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const counts = progress?.counts || { uploaded: 0, alreadyThere: 0, failed: 0, total: 0 };
  const bytes = progress?.bytes || { sent: 0, total: 0 };
  const percent = bytes.total > 0 ? Math.min(100, Math.round((bytes.sent / bytes.total) * 100)) : 0;
  const folder = progress?.folder;
  return (
    <>
    <div className="status-card upload-card">
      <span className="upload-kicker">{PHASE_LABEL[progress?.phase] || STRINGS.QP_PHASE_UPLOADING}</span>
      <h2>{percent}%</h2>
      <div className="progress-bar"><div className="progress-fill" style={{ width: `${percent}%` }} /></div>
      {folder && (
        <p className="upload-muted">
          {formatString(STRINGS.QP_FOLDER_PROGRESS, { index: folder.index + 1, count: folder.count, name: folder.relPath || '/' })}
          {progress.file ? ` · ${progress.file.name}` : ''}
        </p>
      )}
      <p className="upload-counts">{formatString(STRINGS.QP_COUNTS_LIVE, {
        uploaded: counts.uploaded.toLocaleString(), alreadyThere: counts.alreadyThere.toLocaleString(),
        failed: counts.failed.toLocaleString(), total: counts.total.toLocaleString(),
      })}</p>
      <div className="upload-actions">
        <button type="button" className="btn secondary" onClick={() => setConfirmingCancel(true)}>{STRINGS.QP_BTN_CANCEL_UPLOAD}</button>
      </div>
    </div>
    <ConfirmDialog
      isOpen={confirmingCancel} danger
      title={STRINGS.QP_CANCEL_UPLOAD_TITLE} message={STRINGS.QP_CANCEL_UPLOAD_BODY}
      confirmLabel={STRINGS.QP_BTN_STOP_UPLOAD} cancelLabel={STRINGS.QP_BTN_KEEP_UPLOADING}
      onConfirm={() => { setConfirmingCancel(false); onCancel(); }}
      onCancel={() => setConfirmingCancel(false)}
    />
    </>
  );
}

export default UploadProgress;
