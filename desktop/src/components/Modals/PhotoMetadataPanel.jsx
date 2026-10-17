/**
 * PhotoMetadataPanel Component
 *
 * Side panel in ImagePreviewModal showing the same metadata, labels and wording as
 * QuickPitik's "Photo metadata" dialog. Values come from the main process (exifService).
 */

import React from 'react';

const NOT_RECORDED = 'Not recorded';
const MESSAGES = {
  empty: 'No camera metadata was found.',
  unavailable: 'Metadata is unavailable for this photo.',
  failed: 'Metadata could not be loaded.',
};

const display = (value) => (value === null || value === undefined || value === '' ? NOT_RECORDED : String(value));

function cameraModel(fields) {
  const make = fields?.cameraMake?.trim();
  const model = fields?.cameraModel?.trim();
  if (!make) return model;
  if (!model) return make;
  const same = model.toLowerCase() === make.toLowerCase() || model.toLowerCase().startsWith(`${make.toLowerCase()} `);
  return same ? model : `${make} ${model}`;
}

function takenAt(fields) {
  if (!fields?.takenAtLocal) return null;
  return `${fields.takenAtLocal.replace('T', ' ')}${fields.takenAtOffset ? ` ${fields.takenAtOffset}` : ''}`;
}

// Plain functions, not components, so each row renders in place.
function row(label, value, numeric = false) {
  return (
    <div key={label}>
      <dt>{label}</dt>
      <dd className={numeric ? 'image-preview-metadata-numeric' : undefined}>{display(value)}</dd>
    </div>
  );
}

function section(title, rows) {
  return (
    <section key={title}>
      <h3>{title}</h3>
      <dl>{rows}</dl>
    </section>
  );
}

/**
 * @param {Object} props
 * @param {string} props.id - Element id (the toggle button's aria-controls)
 * @param {string} props.fileName - The photo on screen
 * @param {boolean} props.loading - The preview (and its metadata) is still loading
 * @param {Object} [props.metadata] - { status, fields?, fileSizeBytes? } for this photo; absent when it has no preview
 */
function PhotoMetadataPanel({ id, fileName, loading, metadata }) {
  const status = metadata?.status ?? 'unavailable';
  const fields = status === 'ready' ? metadata.fields : null;
  const size = metadata?.fileSizeBytes;

  return (
    <aside
      id={id}
      className="image-preview-metadata"
      aria-labelledby={`${id}-title`}
      tabIndex={0}
      onClick={(e) => e.stopPropagation()}
    >
      <h2 id={`${id}-title`}>Photo metadata</h2>
      {loading ? (
        <p role="status">Loading metadata…</p>
      ) : (
        <>
          {MESSAGES[status] && <p>{MESSAGES[status]}</p>}
          {fields && [
            section('Camera', [row('Model', cameraModel(fields)), row('Lens', fields.lens)]),
            section('Exposure', [
              row('Aperture', fields.aperture ? `f/${fields.aperture}` : null, true), // always > 0 when set
              row('Exposure', fields.exposureTime, true),
              row('ISO', fields.iso, true),
              row('Flash', fields.flash),
              row('Exposure mode', fields.exposureMode),
              row('White balance', fields.whiteBalance),
            ]),
            section('Attribution and capture', [
              row('Author', fields.author),
              row('Copyright', fields.copyright),
              row('Date', takenAt(fields), true),
            ]),
          ]}
          {section('File', [
            row('Name', fileName),
            <div key="Original size">
              <dt>Original size</dt>
              <dd className="image-preview-metadata-numeric">
                {size === null || size === undefined ? (
                  NOT_RECORDED
                ) : (
                  <span>
                    {(size / 1_048_576).toFixed(1)} MiB
                    <span className="image-preview-metadata-sr"> ({size.toLocaleString('en-US')} bytes)</span>
                  </span>
                )}
              </dd>
            </div>,
          ])}
        </>
      )}
    </aside>
  );
}

export default PhotoMetadataPanel;
