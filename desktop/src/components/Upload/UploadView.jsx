import React, { useState } from 'react';
import { STRINGS, formatString } from '../../constants/strings';
import { useQuickPitikUpload } from '../../hooks/useQuickPitikUpload';
import ConfirmDialog from '../Modals/ConfirmDialog';
import ConnectCard from './ConnectCard';
import EventPicker, { ChosenEvent } from './EventPicker';
import FolderDrop from './FolderDrop';
import { ResumeCard } from './UploadResume';
import ReviewTable from './ReviewTable';
import UploadProgress from './UploadProgress';
import UploadSummary from './UploadSummary';
import './Upload.css';

/** The Upload view: one card per state, driven by useQuickPitikUpload. Never changes files on disk. */
function UploadView({ onBusyChange, resumeOnOpen }) {
  const qp = useQuickPitikUpload({ onBusyChange, resumeOnOpen });
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

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
  const scanning = qp.status === 'scanning';
  return (
    <div className="upload-view">
      <div className="upload-session">
        <span className="upload-kicker">{formatString(STRINGS.QP_CONNECTED_AS, { email: qp.session?.email ?? '' })}</span>
        <button type="button" className="upload-link upload-link-quiet" onClick={() => setConfirmingDisconnect(true)} disabled={scanning}>{STRINGS.QP_BTN_DISCONNECT}</button>
      </div>
      {qp.resumeState && (
        <ResumeCard
          state={qp.resumeState} pending={qp.pending} event={qp.pendingEvent}
          onResume={qp.resume} onDiscard={qp.discardPending} onChooseAgain={qp.chooseFolderAgain}
        />
      )}
      {/* The folder comes after the event: until one is chosen there is no drop zone. A scan already made is kept. */}
      {event ? (
        <ChosenEvent event={event} onChange={() => qp.setEventId('')} disabled={scanning} />
      ) : (
        <EventPicker
          events={qp.events} value={qp.eventId} onChange={qp.setEventId} onRefresh={qp.loadEvents}
          disabled={scanning} loading={qp.eventsLoading} loadedAt={qp.eventsLoadedAt}
        />
      )}
      {!event && !qp.eventsLoading && qp.events.some(e => e.uploadWindow === 'open') && <p className="upload-muted">{STRINGS.QP_PICK_EVENT_HINT}</p>}
      {event && (qp.status === 'reviewing' && qp.scan ? (
        <ReviewTable
          scan={qp.scan} selected={qp.selected} selectedCount={qp.selectedCount} event={event}
          onToggle={qp.toggleFolder} onUpload={() => qp.startUpload()} onChangeFolder={qp.reset}
        />
      ) : (
        <FolderDrop
          isDragOver={qp.isDragOver} scanning={scanning}
          onDragOver={qp.handleDragOver} onDragLeave={qp.handleDragLeave} onDrop={qp.handleDrop} onClick={qp.chooseFolder}
        />
      ))}
      {qp.error && <p role="alert" className="upload-error">{qp.error.message}</p>}
      <ConfirmDialog
        isOpen={confirmingDisconnect} danger
        title={STRINGS.QP_DISCONNECT_TITLE} message={STRINGS.QP_DISCONNECT_BODY}
        confirmLabel={STRINGS.QP_BTN_DISCONNECT} cancelLabel={STRINGS.BTN_CANCEL}
        onConfirm={() => { setConfirmingDisconnect(false); qp.disconnect(); }}
        onCancel={() => setConfirmingDisconnect(false)}
      />
    </div>
  );
}

export default UploadView;
