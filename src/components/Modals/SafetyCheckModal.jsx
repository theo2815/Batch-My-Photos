/**
 * SafetyCheckModal Component
 * 
 * Displays pre-execution validation results: disk space + write permissions.
 * Shows green/red status rows and allows the user to proceed (soft warnings)
 * or blocks execution (hard failures).
 */

import React from 'react';
import { ShieldCheck, HardDrive, Lock, AlertTriangle, CheckCircle, XCircle, ArrowLeft } from 'lucide-react';
import { STRINGS } from '../../constants/strings';
import './Modals.css';

/**
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is visible
 * @param {Object|null} props.result - Validation result from validate-execution IPC
 * @param {() => void} props.onGoBack - Callback when user clicks "Go Back"
 * @param {() => void} props.onProceed - Callback when user clicks "Proceed Anyway" (soft warnings only)
 */
function SafetyCheckModal({ isOpen, result, onGoBack, onProceed }) {
  if (!isOpen || !result) return null;

  const { diskSpace, permissions, warnings, totalFiles, totalSizeFormatted } = result;

  // Determine if there's a hard failure (blocks execution)
  const hasDiskFailure = diskSpace && diskSpace.sufficient === false;
  const hasPermFailure = permissions && !permissions.writable;
  const hasHardFailure = hasDiskFailure || hasPermFailure;

  // Determine the disk space status type
  const getDiskStatus = () => {
    if (!diskSpace) return 'unknown';
    if (diskSpace.skipped) return 'skipped';
    if (diskSpace.sufficient === true) return 'pass';
    if (diskSpace.sufficient === false) return 'fail';
    return 'unknown'; // sufficient === null
  };

  const diskStatus = getDiskStatus();
  const permStatus = permissions?.writable ? 'pass' : 'fail';

  return (
    <div className="modal-overlay" onClick={onGoBack}>
      <div className="modal-content safety-check-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon">
          <ShieldCheck size={48} className={hasHardFailure ? 'text-error' : 'text-primary'} />
        </div>
        <h3 className={hasHardFailure ? 'text-error' : ''}>
          {STRINGS.SAFETY_TITLE}
        </h3>

        {/* File summary */}
        {totalFiles && (
          <p className="safety-summary">
            {totalFiles} files ({totalSizeFormatted})
          </p>
        )}

        {/* Check rows */}
        <div className="safety-checks">

          {/* Disk Space Row */}
          <div className={`safety-check-row ${diskStatus}`}>
            <div className="safety-check-icon">
              <HardDrive size={18} />
            </div>
            <div className="safety-check-info">
              <span className="safety-check-label">Disk Space</span>
              <span className="safety-check-detail">
                {diskStatus === 'skipped' && STRINGS.SAFETY_DISK_SKIPPED}
                {diskStatus === 'pass' && (
                  <>{diskSpace.freeFormatted} {STRINGS.SAFETY_DISK_OK} (need {diskSpace.requiredFormatted})</>
                )}
                {diskStatus === 'fail' && (
                  <>Only {diskSpace.freeFormatted} available (need {diskSpace.requiredFormatted})</>
                )}
                {diskStatus === 'unknown' && (
                  <>Could not verify — {diskSpace?.requiredFormatted ? `need ${diskSpace.requiredFormatted}` : 'unknown'}</>
                )}
              </span>
            </div>
            <div className="safety-check-status">
              {diskStatus === 'pass' || diskStatus === 'skipped' ? (
                <CheckCircle size={20} className="icon-pass" />
              ) : diskStatus === 'fail' ? (
                <XCircle size={20} className="icon-fail" />
              ) : (
                <AlertTriangle size={20} className="icon-warn" />
              )}
            </div>
          </div>

          {/* Permissions Row */}
          <div className={`safety-check-row ${permStatus}`}>
            <div className="safety-check-icon">
              <Lock size={18} />
            </div>
            <div className="safety-check-info">
              <span className="safety-check-label">Write Permission</span>
              <span className="safety-check-detail">
                {permStatus === 'pass'
                  ? STRINGS.SAFETY_PERM_OK
                  : (permissions?.error || STRINGS.SAFETY_PERM_FAIL)}
              </span>
            </div>
            <div className="safety-check-status">
              {permStatus === 'pass' ? (
                <CheckCircle size={20} className="icon-pass" />
              ) : (
                <XCircle size={20} className="icon-fail" />
              )}
            </div>
          </div>
        </div>

        {/* Warnings section */}
        {warnings && warnings.length > 0 && (
          <div className="safety-warnings">
            {warnings.map((w, i) => (
              <div key={i} className="safety-warning-item">
                <AlertTriangle size={14} />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div className="modal-buttons">
          <button className="btn secondary" onClick={onGoBack}>
            <ArrowLeft size={16} />
            {STRINGS.SAFETY_GO_BACK}
          </button>
          {!hasHardFailure && (
            <button className="btn primary" onClick={onProceed}>
              {STRINGS.SAFETY_PROCEED_ANYWAY}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default SafetyCheckModal;
