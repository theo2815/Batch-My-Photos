import React from 'react';
import { STRINGS } from '../../constants/strings';
import DropZone from '../DropZone/DropZone';
import BoxSpinner from '../common/BoxSpinner';

/** Reuses the Sort view's drop zone; the drop registers the path, then the read-only scan runs. */
function FolderDrop({ isDragOver, scanning, onDragOver, onDragLeave, onDrop, onClick }) {
  if (scanning) {
    return (
      <div className="status-card upload-card">
        <BoxSpinner />
        <p>{STRINGS.QP_SCANNING}</p>
      </div>
    );
  }
  return (
    <DropZone
      isDragOver={isDragOver} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} onClick={onClick}
      title={STRINGS.QP_DROP_TITLE} subtitle={STRINGS.QP_DROP_SUBTITLE}
    />
  );
}

export default FolderDrop;
