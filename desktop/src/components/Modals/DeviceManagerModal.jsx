/**
 * DeviceManagerModal Component
 * 
 * Displays all devices bound to the user's subscription with the ability
 * to de-authorize (remove) devices. Shows device label, HWID (truncated),
 * bound date, last activity, and highlights the current device.
 * 
 * Includes:
 * - 24-hour cooldown display after device removal
 * - Monthly removal limit indicator (3/month)
 * - Confirmation dialog with consequences before removal
 * 
 * Used in the Electron Settings page.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Monitor, Trash2, Shield, AlertTriangle,
  Loader, X, RefreshCw, CheckCircle, Clock, Wifi, Timer
} from 'lucide-react';
import './Modals.css';

/**
 * Format a relative time string (e.g., "2 hours ago", "3 days ago")
 */
function formatRelativeTime(isoDate) {
  if (!isoDate) return 'Never';
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Format a cooldown countdown (e.g., "23h 14m remaining")
 */
function formatCountdown(endsAtIso) {
  if (!endsAtIso) return null;
  const remaining = new Date(endsAtIso).getTime() - Date.now();
  if (remaining <= 0) return null;

  const hours = Math.floor(remaining / 3600000);
  const mins = Math.floor((remaining % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${mins}m remaining`;
  return `${mins}m remaining`;
}

/**
 * Truncate a HWID hash for display (first 8 + last 4 chars)
 */
function truncateHwid(hwid) {
  if (!hwid || hwid.length < 16) return hwid || '';
  return `${hwid.substring(0, 8)}…${hwid.substring(hwid.length - 4)}`;
}

export default function DeviceManagerModal({ isOpen, onClose, sessionToken: sessionTokenProp }) {
  const [devices, setDevices] = useState([]);
  const [deviceLimit, setDeviceLimit] = useState(1);
  const [currentHwid, setCurrentHwid] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [removeSuccess, setRemoveSuccess] = useState(null);
  const [sessionToken, setSessionToken] = useState(sessionTokenProp || null);

  // Removal limit state
  const [removalsUsed, setRemovalsUsed] = useState(0);
  const [removalsLimit, setRemovalsLimit] = useState(3);
  const [cooldownEndsAt, setCooldownEndsAt] = useState(null);
  const [cooldownText, setCooldownText] = useState(null);

  // In-modal confirmation dialog state
  const [confirmDevice, setConfirmDevice] = useState(null); // { id, label }

  // Live cooldown countdown timer
  const cooldownTimerRef = useRef(null);

  useEffect(() => {
    if (cooldownEndsAt) {
      const tick = () => {
        const text = formatCountdown(cooldownEndsAt);
        setCooldownText(text);
        if (!text) {
          setCooldownEndsAt(null);
          clearInterval(cooldownTimerRef.current);
        }
      };
      tick();
      cooldownTimerRef.current = setInterval(tick, 30000); // update every 30s
      return () => clearInterval(cooldownTimerRef.current);
    } else {
      setCooldownText(null);
    }
  }, [cooldownEndsAt]);

  // Resolve session token on open if not provided as prop
  useEffect(() => {
    if (isOpen && !sessionTokenProp) {
      window.electronAPI.authGetSession().then(({ sessionToken: token }) => {
        setSessionToken(token || null);
      }).catch(() => setSessionToken(null));
    } else if (sessionTokenProp) {
      setSessionToken(sessionTokenProp);
    }
  }, [isOpen, sessionTokenProp]);

  /**
   * Fetch the device list from the backend
   */
  const fetchDevices = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.deviceGetList(sessionToken);
      if (result.error) {
        setError(result.error);
      } else {
        setDevices(result.devices || []);
        setDeviceLimit(result.deviceLimit || result.device_limit || 1);
        setCurrentHwid(result.currentHwid || null);
        setRemovalsUsed(result.removalsUsed ?? 0);
        setRemovalsLimit(result.removalsLimit ?? 3);
        setCooldownEndsAt(result.cooldownEndsAt || null);
      }
    } catch (_err) {
      setError('Failed to load devices. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  // Fetch devices when modal opens
  useEffect(() => {
    if (isOpen && sessionToken) {
      fetchDevices();
    }
  }, [isOpen, sessionToken, fetchDevices]);

  /**
   * Show the in-modal confirmation dialog
   */
  const promptRemoveDevice = useCallback((deviceId, deviceLabel) => {
    if (removingId) return;
    setConfirmDevice({ id: deviceId, label: deviceLabel || 'this device' });
  }, [removingId]);

  /**
   * Execute the device removal after confirmation
   */
  const executeRemoveDevice = useCallback(async () => {
    if (!confirmDevice) return;
    const { id: deviceId, label: deviceLabel } = confirmDevice;
    setConfirmDevice(null);
    setRemovingId(deviceId);
    setRemoveSuccess(null);

    try {
      const result = await window.electronAPI.deviceDeauthorize(sessionToken, deviceId);
      if (result.success) {
        setRemoveSuccess(deviceLabel);
        // Update removal metrics from the response
        if (result.removalsUsed !== undefined && result.removalsUsed !== null) setRemovalsUsed(result.removalsUsed);
        if (result.removalsLimit !== undefined && result.removalsLimit !== null) setRemovalsLimit(result.removalsLimit);
        if (result.cooldownEndsAt) setCooldownEndsAt(result.cooldownEndsAt);
        // Refresh the list
        await fetchDevices();
        setTimeout(() => setRemoveSuccess(null), 3000);
      } else {
        setError(result.error || 'Failed to remove device');
      }
    } catch (_err) {
      setError('Failed to remove device. Please try again.');
    } finally {
      setRemovingId(null);
    }
  }, [sessionToken, confirmDevice, fetchDevices]);

  if (!isOpen) return null;

  const isCurrentDevice = (device) => device.hwid_hash === currentHwid;
  const isRecentlyActive = (device) => {
    if (!device.last_seen_at) return false;
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    return new Date(device.last_seen_at).getTime() > tenMinutesAgo;
  };

  const atRemovalLimit = removalsUsed >= removalsLimit;
  const hasCooldown = !!cooldownText;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '540px' }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={20} />
            <h2 style={{ margin: 0 }}>Manage Devices</h2>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Device count bar */}
        <div style={{ 
          padding: '12px 16px',
          background: 'var(--bg-secondary, #1a1a2e)',
          borderBottom: '1px solid var(--border-color, #333)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '13px',
        }}>
          <span style={{ color: 'var(--text-secondary, #888)' }}>
            Devices used
          </span>
          <span style={{ 
            color: devices.length >= deviceLimit ? 'var(--warning-color, #f59e0b)' : 'var(--text-primary, #e0e0e0)',
            fontWeight: 600,
          }}>
            {devices.length} / {deviceLimit}
          </span>
        </div>

        {/* Removal limits info bar */}
        <div style={{
          padding: '8px 16px',
          background: 'var(--bg-secondary, #1a1a2e)',
          borderBottom: '1px solid var(--border-color, #333)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '12px',
          gap: '12px',
        }}>
          <span style={{ 
            color: atRemovalLimit ? 'var(--error-color, #ef4444)' : 'var(--text-tertiary, #666)',
            display: 'flex', alignItems: 'center', gap: '4px',
          }}>
            <Trash2 size={12} />
            {removalsUsed} / {removalsLimit} removals used this month
          </span>
          {hasCooldown && (
            <span style={{
              color: 'var(--warning-color, #f59e0b)',
              display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: '11px',
            }}>
              <Timer size={12} />
              Cooldown: {cooldownText}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="modal-body" style={{ padding: '16px', maxHeight: '400px', overflowY: 'auto' }}>
          {/* Cooldown warning banner */}
          {hasCooldown && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: '8px',
              padding: '10px 12px', marginBottom: '12px',
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '8px', fontSize: '12px',
              color: 'var(--warning-color, #f59e0b)',
              lineHeight: '1.4',
            }}>
              <Timer size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>A device was recently removed. New devices cannot be added for another <strong>{cooldownText}</strong>. Re-adding a previously used device is not affected.</span>
            </div>
          )}

          {/* Removal limit reached warning */}
          {atRemovalLimit && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: '8px',
              padding: '10px 12px', marginBottom: '12px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px', fontSize: '12px',
              color: 'var(--error-color, #ef4444)',
              lineHeight: '1.4',
            }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>You&apos;ve used all {removalsLimit} device removals for this billing period. Removals will reset next month.</span>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 12px', marginBottom: '12px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px', fontSize: '13px',
              color: 'var(--error-color, #ef4444)',
            }}>
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Success message */}
          {removeSuccess && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 12px', marginBottom: '12px',
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: '8px', fontSize: '13px',
              color: 'var(--success-color, #22c55e)',
            }}>
              <CheckCircle size={16} />
              <span>&ldquo;{removeSuccess}&rdquo; removed successfully</span>
            </div>
          )}

          {/* In-modal confirmation dialog */}
          {confirmDevice && (
            <div style={{
              padding: '14px',
              marginBottom: '12px',
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: '10px',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '12px' }}>
                <AlertTriangle size={18} style={{ color: 'var(--warning-color, #f59e0b)', flexShrink: 0, marginTop: '1px' }} />
                <div style={{ fontSize: '13px', color: 'var(--text-primary, #e0e0e0)', lineHeight: '1.5' }}>
                  <strong>Remove &ldquo;{confirmDevice.label}&rdquo;?</strong>
                  <ul style={{ margin: '6px 0 0', paddingLeft: '18px', color: 'var(--text-secondary, #999)', fontSize: '12px' }}>
                    <li>A <strong>24-hour cooldown</strong> will start — no new devices can be added during this time.</li>
                    <li>You have <strong>{removalsLimit - removalsUsed}</strong> removal{removalsLimit - removalsUsed !== 1 ? 's' : ''} left this month.</li>
                    <li>Re-adding the same device later will bypass the cooldown.</li>
                  </ul>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  onClick={() => setConfirmDevice(null)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-color, #444)',
                    borderRadius: '6px',
                    padding: '6px 14px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    color: 'var(--text-secondary, #888)',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={executeRemoveDevice}
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    borderRadius: '6px',
                    padding: '6px 14px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--error-color, #ef4444)',
                  }}
                >
                  Remove Device
                </button>
              </div>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-secondary, #888)' }}>
              <Loader size={24} className="spin" />
              <p style={{ marginTop: '8px', fontSize: '13px' }}>Loading devices...</p>
            </div>
          )}

          {/* Empty state */}
          {!loading && devices.length === 0 && !error && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-secondary, #888)' }}>
              <Monitor size={32} style={{ opacity: 0.5 }} />
              <p style={{ marginTop: '8px', fontSize: '13px' }}>No devices registered yet.</p>
            </div>
          )}

          {/* Device list */}
          {!loading && devices.map((device) => {
            const isCurrent = isCurrentDevice(device);
            const isActive = isRecentlyActive(device);
            const isRemoving = removingId === device.id;
            const canRemove = !isCurrent && !atRemovalLimit && !isRemoving;

            return (
              <div
                key={device.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px',
                  marginBottom: '8px',
                  borderRadius: '8px',
                  border: isCurrent
                    ? '1px solid var(--accent-color, #6366f1)'
                    : '1px solid var(--border-color, #333)',
                  background: isCurrent
                    ? 'rgba(99, 102, 241, 0.05)'
                    : 'var(--bg-tertiary, #111)',
                }}
              >
                {/* Device info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '8px',
                    background: isCurrent ? 'rgba(99, 102, 241, 0.15)' : 'var(--bg-secondary, #1a1a2e)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Monitor size={18} style={{ color: isCurrent ? 'var(--accent-color, #6366f1)' : 'var(--text-secondary, #888)' }} />
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{
                        fontSize: '14px', fontWeight: 500,
                        color: 'var(--text-primary, #e0e0e0)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {device.device_label || 'Unknown Device'}
                      </span>
                      {isCurrent && (
                        <span style={{
                          fontSize: '10px', fontWeight: 600,
                          padding: '2px 6px', borderRadius: '4px',
                          background: 'var(--accent-color, #6366f1)',
                          color: '#fff', textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}>
                          This device
                        </span>
                      )}
                    </div>
                    <div style={{
                      fontSize: '11px', color: 'var(--text-tertiary, #666)',
                      display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px',
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Clock size={10} />
                        Added {formatRelativeTime(device.bound_at)}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Wifi size={10} style={{ color: isActive ? '#22c55e' : '#666' }} />
                        {isActive ? 'Active now' : `Last seen ${formatRelativeTime(device.last_seen_at)}`}
                      </span>
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary, #555)', marginTop: '2px', fontFamily: 'monospace' }}>
                      ID: {truncateHwid(device.hwid_hash)}
                    </div>
                  </div>
                </div>

                {/* Remove button */}
                {!isCurrent && (
                  <button
                    onClick={() => promptRemoveDevice(device.id, device.device_label)}
                    disabled={!canRemove}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      cursor: canRemove ? 'pointer' : 'not-allowed',
                      display: 'flex', alignItems: 'center', gap: '4px',
                      fontSize: '12px',
                      color: 'var(--error-color, #ef4444)',
                      opacity: canRemove ? 1 : 0.4,
                      transition: 'all 0.15s ease',
                      flexShrink: 0,
                    }}
                    title={atRemovalLimit ? 'Monthly removal limit reached' : isRemoving ? 'Removing...' : 'Remove this device'}
                  >
                    {isRemoving ? <Loader size={14} className="spin" /> : <Trash2 size={14} />}
                    Remove
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ 
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px',
          borderTop: '1px solid var(--border-color, #333)',
        }}>
          <button
            onClick={fetchDevices}
            disabled={loading}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-color, #333)',
              borderRadius: '6px',
              padding: '6px 12px',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: '12px',
              color: 'var(--text-secondary, #888)',
            }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            Refresh
          </button>

          <button
            onClick={onClose}
            style={{
              background: 'var(--accent-color, #6366f1)',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 20px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
              color: '#fff',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
