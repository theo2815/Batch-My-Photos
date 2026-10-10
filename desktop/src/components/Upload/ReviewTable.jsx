import React from 'react';
import { STRINGS, formatString } from '../../constants/strings';

/** "88 RAW files and 2 videos skipped. 3 JPEGs over 25 MB skipped." — empty string when nothing was skipped. */
export function describeSkipped(skipped) {
  const parts = [
    skipped.raw > 0 && formatString(STRINGS.QP_SKIP_RAW, { count: skipped.raw.toLocaleString() }),
    skipped.video > 0 && formatString(STRINGS.QP_SKIP_VIDEO, { count: skipped.video.toLocaleString() }),
    skipped.heic > 0 && formatString(STRINGS.QP_SKIP_HEIC, { count: skipped.heic.toLocaleString() }),
    skipped.other > 0 && formatString(STRINGS.QP_SKIP_OTHER, { count: skipped.other.toLocaleString() }),
  ].filter(Boolean);
  const sentences = [];
  if (parts.length > 0) {
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
    sentences.push(list + STRINGS.QP_SKIPPED_SUFFIX);
  }
  if (skipped.oversize > 0) sentences.push(formatString(STRINGS.QP_REVIEW_OVERSIZE, { count: skipped.oversize.toLocaleString() }));
  return sentences.join(' ');
}

/** One row per subfolder from the scan; every row ticked except *_Blurry; one confirm button. */
function ReviewTable({ scan, selected, selectedCount, event, onToggle, onUpload, onChangeFolder }) {
  const canUpload = !!event && selectedCount > 0;
  const label = selectedCount === 0
    ? STRINGS.QP_BTN_UPLOAD_NONE
    : !event
      ? STRINGS.QP_BTN_CHOOSE_EVENT
      : formatString(STRINGS.QP_BTN_UPLOAD, { count: selectedCount.toLocaleString(), event: event.name });
  return (
    <div className="status-card upload-card upload-review">
      <span className="upload-kicker upload-path" title={scan.root}>{scan.root}</span>
      <h2>{formatString(STRINGS.QP_REVIEW_READY, { count: scan.totals.uploadable.count.toLocaleString() })}</h2>
      <p>{describeSkipped(scan.totals.skipped)}</p>
      <ul className="upload-folders">
        {scan.folders.map((folder) => (
          <li key={folder.relPath || '.'} className="upload-folder-row">
            <label className="upload-folder-pick">
              <input
                type="checkbox"
                checked={selected.includes(folder.relPath)}
                disabled={folder.uploadable.count === 0}
                onChange={() => onToggle(folder.relPath)}
              />
              <span className="upload-folder-name">{folder.relPath || folder.name}</span>
            </label>
            <span className="upload-folder-count">{formatString(STRINGS.QP_FOLDER_PHOTOS, { count: folder.uploadable.count.toLocaleString() })}</span>
            <span className="upload-folder-skipped">{describeSkipped(folder.skipped)}</span>
          </li>
        ))}
      </ul>
      <div className="upload-actions">
        <button type="button" className="btn primary" disabled={!canUpload} onClick={onUpload}>{label}</button>
        <button type="button" className="btn secondary" onClick={onChangeFolder}>{STRINGS.QP_BTN_CHANGE_FOLDER}</button>
      </div>
    </div>
  );
}

export default ReviewTable;
