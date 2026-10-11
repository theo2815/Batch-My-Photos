import React from 'react';
import { STRINGS, formatString } from '../../constants/strings';
import { useQuickPitikUpload } from '../../hooks/useQuickPitikUpload';
import ConnectCard from './ConnectCard';
import EventPicker from './EventPicker';
import FolderDrop from './FolderDrop';
import ReviewTable from './ReviewTable';
import UploadProgress from './UploadProgress';
import UploadSummary from './UploadSummary';
import './Upload.css';

/** The Upload view: one card per state, driven by useQuickPitikUpload. Never changes files on disk. */
function UploadView({ onBusyChange }) {
  const qp = useQuickPitikUpload({ onBusyChange });

  if (qp.status === 'disconnected' || qp.status === 'connecting') {
    return <ConnectCard status={qp.status} error={qp.error} onConnect={qp.connect} />;
  }
  if (qp.status === 'uploading') {
    return <UploadProgress progress={qp.progress} onCancel={qp.cancelUpload} />;
  }
  if (qp.status === 'done' || qp.status === 'error') {
    return (
      <UploadSummary
        status={qp.status} progress={qp.progress} scan={qp.scan} selected={qp.selected} error={qp.error}
        onRetryFailed={qp.retryFailed} onReset={qp.reset} onReconnect={qp.connect}
      />
    );
  }

  const event = qp.events.find(e => e.id === qp.eventId) || null;
  return (
    <div className="upload-view">
      <div className="upload-session">
        <span className="upload-kicker">{formatString(STRINGS.QP_CONNECTED_AS, { email: qp.session?.email ?? '' })}</span>
        <button type="button" className="upload-link" onClick={qp.disconnect} disabled={qp.status === 'scanning'}>{STRINGS.QP_BTN_DISCONNECT}</button>
      </div>
      <EventPicker events={qp.events} value={qp.eventId} onChange={qp.setEventId} onRefresh={qp.loadEvents} disabled={qp.status === 'scanning'} />
      {qp.status === 'reviewing' && qp.scan ? (
        <ReviewTable
          scan={qp.scan} selected={qp.selected} selectedCount={qp.selectedCount} event={event}
          onToggle={qp.toggleFolder} onUpload={() => qp.startUpload()} onChangeFolder={qp.reset}
        />
      ) : (
        <FolderDrop
          isDragOver={qp.isDragOver} scanning={qp.status === 'scanning'}
          onDragOver={qp.handleDragOver} onDragLeave={qp.handleDragLeave} onDrop={qp.handleDrop} onClick={qp.chooseFolder}
        />
      )}
      {qp.error && <p role="alert" className="upload-error">{qp.error.message}</p>}
    </div>
  );
}

export default UploadView;
