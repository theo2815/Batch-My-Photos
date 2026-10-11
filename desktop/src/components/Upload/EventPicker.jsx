import React from 'react';
import { STRINGS } from '../../constants/strings';
import CustomSelect from '../common/CustomSelect';

/** Events open for upload (public window + the photographer's own), from qpListEvents. */
function EventPicker({ events, value, onChange, onRefresh, disabled }) {
  const options = events.map(event => ({
    value: event.id,
    label: `${event.name} · ${event.date}${event.ownedByMe ? ` · ${STRINGS.QP_EVENT_OWN}` : ''}`,
  }));
  return (
    <div className="upload-event">
      <label className="upload-label">{STRINGS.QP_EVENT_LABEL}</label>
      <div className="upload-event-row">
        <CustomSelect value={value} options={options} onChange={onChange} placeholder={STRINGS.QP_EVENT_PLACEHOLDER} disabled={disabled} className="upload-event-select" />
        <button type="button" className="upload-link" onClick={onRefresh} disabled={disabled}>{STRINGS.QP_BTN_REFRESH_EVENTS}</button>
      </div>
      {events.length === 0 && <p className="upload-muted">{STRINGS.QP_NO_EVENTS}</p>}
    </div>
  );
}

export default EventPicker;
