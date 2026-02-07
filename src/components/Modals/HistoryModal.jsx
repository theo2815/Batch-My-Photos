/**
 * HistoryModal Component
 * 
 * Displays a list of past Move mode batch operations with the ability to
 * undo (rollback) or delete individual entries. Shows operation details
 * including folder, date, file count, batch settings used, and result summary.
 * 
 * NOTE: Only Move mode operations are tracked. Copy mode preserves originals
 * and therefore doesn't need rollback/history.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  History, Undo2, Trash2, FolderOpen, Clock,
  FileStack, AlertTriangle, CheckCircle, XCircle,
  Loader, X, Zap, ChevronDown, ChevronUp,
  Settings2, Package, ArrowUpDown, Info, Copy, Check
} from 'lucide-react';
import { STRINGS } from '../../constants/strings';
import './Modals.css';

/**
 * Format a relative time string (e.g., "2 hours ago", "3 days ago")
 * @param {string} isoDate - ISO date string
 * @returns {string} Human-readable relative time
 */
function formatRelativeTime(isoDate) {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now - date;
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
 * Extract the folder name from a full path
 * @param {string} folderPath - Full folder path
 * @returns {string} Just the folder name
 */
function getFolderName(folderPath) {
  return folderPath?.split(/[/\\]/).pop() || folderPath;
}

/**
 * Format a folder path in breadcrumb style: drive + … + parent + folder name.
 * Shows the drive root and the last two segments for context.
 * Examples:
 *   "C:\Users\Me\Docs\Photos\Batch1" → "C:\…\Photos\Batch1"
 *   "D:\Short\Batch1"                → "D:\Short\Batch1"  (no truncation needed)
 *   "Batch1"                         → "Batch1"
 * @param {string} folderPath - Full folder path
 * @returns {string} Breadcrumb-style path
 */
function getBreadcrumbPath(folderPath) {
  if (!folderPath) return '';
  const sep = folderPath.includes('/') ? '/' : '\\';
  const parts = folderPath.split(/[/\\]/).filter(Boolean);

  // 3 or fewer segments — show the full path as-is (e.g. "D:\Photos\Batch1")
  if (parts.length <= 3) return folderPath;

  // Drive/root (e.g. "C:") + … + last two segments
  const drive = parts[0]; // "C:" or root
  const parent = parts[parts.length - 2];
  const folder = parts[parts.length - 1];
  return `${drive}${sep}…${sep}${parent}${sep}${folder}`;
}

/**
 * Get a human-readable label for sort order
 * @param {string} sortBy - Sort key (e.g., 'name-asc')
 * @returns {string} Display label
 */
function getSortLabel(sortBy) {
  if (!sortBy) return 'Name (A-Z)';
  if (sortBy === 'name-asc') return 'Name (A-Z)';
  if (sortBy === 'name-desc') return 'Name (Z-A)';
  if (sortBy.includes('asc') && (sortBy.includes('date') || sortBy.includes('exif'))) return 'Date (Oldest)';
  if (sortBy.includes('desc') && (sortBy.includes('date') || sortBy.includes('exif'))) return 'Date (Newest)';
  return sortBy;
}

/**
 * Single history entry row with expandable details
 */
function HistoryEntry({ entry, onUndo, onDelete, onValidate }) {
  const [validationState, setValidationState] = useState(null); // null | 'checking' | result object
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [tooltipPos, setTooltipPos] = useState(null);
  const [copied, setCopied] = useState(false);
  const folderRef = useRef(null);
  const copyTimerRef = useRef(null);

  const handleValidate = useCallback(async () => {
    setValidationState('checking');
    const result = await onValidate(entry.operationId);
    setValidationState(result);
  }, [entry.operationId, onValidate]);

  const handleUndoClick = useCallback(() => {
    onUndo(entry);
  }, [entry, onUndo]);

  const handleDeleteClick = useCallback(() => {
    setShowDeleteConfirm(true);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    setShowDeleteConfirm(false);
    onDelete(entry.operationId);
  }, [entry.operationId, onDelete]);

  const handleFolderMouseEnter = useCallback(() => {
    if (folderRef.current) {
      const rect = folderRef.current.getBoundingClientRect();
      setTooltipPos({
        top: rect.bottom + 6,
        left: rect.left,
      });
    }
  }, []);

  const handleFolderMouseLeave = useCallback(() => {
    setTooltipPos(null);
  }, []);

  const handleCopyPath = useCallback(async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(entry.sourceFolder);
      setCopied(true);
      // Clear any existing timer before setting a new one
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: silent fail (clipboard may be blocked in some contexts)
    }
  }, [entry.sourceFolder]);

  const hasSettings = entry.maxFilesPerBatch || entry.sortBy;
  const hasBatchResults = entry.batchResults && entry.batchResults.length > 0;

  return (
    <div className="history-entry">
      {/* Header: breadcrumb path + copy btn + mode badge + timestamp */}
      <div className="history-entry-header">
        <div
          className="history-entry-folder-block"
          ref={folderRef}
          onMouseEnter={handleFolderMouseEnter}
          onMouseLeave={handleFolderMouseLeave}
        >
          <div className="history-entry-folder">
            <FolderOpen size={14} />
            <span>{getBreadcrumbPath(entry.sourceFolder)}</span>
          </div>
          {/* Copy path button — visible on entry hover */}
          <button
            className={`history-copy-btn ${copied ? 'copied' : ''}`}
            onClick={handleCopyPath}
            title={copied ? 'Copied!' : 'Copy full path'}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        </div>
        {/* Fixed-position tooltip — escapes all overflow containers */}
        {tooltipPos && (
          <div
            className="history-path-tooltip"
            style={{ top: tooltipPos.top, left: tooltipPos.left }}
          >
            {entry.sourceFolder}
          </div>
        )}
        <div className="history-entry-header-right">
          <span className="history-mode-badge move" title="Move mode — files were moved, undo is available">
            <Zap size={10} />
            {STRINGS.HISTORY_MODE_MOVE}
          </span>
          <div className="history-entry-time" title={new Date(entry.createdAt).toLocaleString()}>
            <Clock size={12} />
            <span>{formatRelativeTime(entry.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* Quick stats row */}
      <div className="history-entry-stats">
        <span className="history-stat">
          <FileStack size={12} />
          {entry.totalFiles?.toLocaleString()} files
        </span>
        <span className="history-stat">
          <Package size={12} />
          {entry.batchFolderCount} batch{entry.batchFolderCount !== 1 ? 'es' : ''}
        </span>
        {entry.outputPrefix && (
          <span className="history-stat history-prefix">
            {entry.outputPrefix}
          </span>
        )}
        {/* Expand/collapse toggle for details */}
        {(hasSettings || hasBatchResults) && (
          <button
            className="history-expand-btn"
            onClick={() => setExpanded(!expanded)}
            title={expanded ? 'Hide details' : 'Show details'}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? 'Less' : 'Details'}
          </button>
        )}
      </div>

      {/* Expanded details section */}
      {expanded && (
        <div className="history-entry-details">
          {/* Settings used */}
          {hasSettings && (
            <div className="history-detail-section">
              <div className="history-detail-heading">
                <Settings2 size={12} />
                <span>{STRINGS.HISTORY_SETTINGS_LABEL}</span>
              </div>
              <div className="history-detail-grid">
                {entry.maxFilesPerBatch && (
                  <div className="history-detail-item">
                    <span className="history-detail-key">{STRINGS.HISTORY_MAX_FILES}</span>
                    <span className="history-detail-value">{entry.maxFilesPerBatch}</span>
                  </div>
                )}
                {entry.outputPrefix && (
                  <div className="history-detail-item">
                    <span className="history-detail-key">Folder name</span>
                    <span className="history-detail-value mono">{entry.outputPrefix}</span>
                  </div>
                )}
                {entry.sortBy && (
                  <div className="history-detail-item">
                    <span className="history-detail-key">{STRINGS.HISTORY_SORT_ORDER}</span>
                    <span className="history-detail-value">
                      <ArrowUpDown size={11} />
                      {getSortLabel(entry.sortBy)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Batch result summary */}
          {hasBatchResults && (
            <div className="history-detail-section">
              <div className="history-detail-heading">
                <Package size={12} />
                <span>{STRINGS.HISTORY_RESULT_LABEL}</span>
                <span className="history-detail-count">
                  {entry.batchResults.length} batch{entry.batchResults.length !== 1 ? 'es' : ''}
                </span>
              </div>
              <div className="history-batch-list">
                {entry.batchResults.slice(0, 10).map((b, i) => (
                  <div key={i} className="history-batch-item">
                    <span className="history-batch-name">{b.folder}</span>
                    <span className="history-batch-count">{b.fileCount} file{b.fileCount !== 1 ? 's' : ''}</span>
                  </div>
                ))}
                {entry.batchResults.length > 10 && (
                  <div className="history-batch-item more">
                    ...and {entry.batchResults.length - 10} more
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Validation status */}
      {validationState && validationState !== 'checking' && (
        <div className={`history-validation ${validationState.valid ? 'valid' : 'invalid'}`}>
          {validationState.valid ? (
            <>
              <CheckCircle size={12} />
              <span>Files verified ({validationState.found}/{validationState.checked} checked)</span>
            </>
          ) : validationState.error ? (
            <>
              <XCircle size={12} />
              <span>{validationState.error}</span>
            </>
          ) : (
            <>
              <AlertTriangle size={12} />
              <span>{validationState.missing} of {validationState.checked} files missing</span>
            </>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="history-entry-actions">
        {/* Validate button */}
        <button
          className="history-action-btn validate"
          onClick={handleValidate}
          disabled={validationState === 'checking'}
          title={STRINGS.HISTORY_VALIDATE}
        >
          {validationState === 'checking' ? (
            <Loader size={13} className="spinner-icon" />
          ) : (
            <CheckCircle size={13} />
          )}
          {validationState === 'checking' ? 'Checking...' : 'Verify'}
        </button>

        {/* Undo button */}
        <button
          className="history-action-btn undo"
          onClick={handleUndoClick}
          title={STRINGS.HISTORY_UNDO}
        >
          <Undo2 size={13} /> Undo
        </button>

        {/* Delete button */}
        {showDeleteConfirm ? (
          <div className="history-delete-confirm">
            <span>Sure?</span>
            <button className="history-action-btn delete-yes" onClick={handleDeleteConfirm}>Yes</button>
            <button className="history-action-btn delete-no" onClick={() => setShowDeleteConfirm(false)}>No</button>
          </div>
        ) : (
          <button
            className="history-action-btn delete"
            onClick={handleDeleteClick}
            title={STRINGS.HISTORY_DELETE}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is visible
 * @param {Array} props.history - Array of operation history entries
 * @param {(entry: Object) => void} props.onUndo - Undo callback (triggers confirmation dialog)
 * @param {(operationId: string) => Promise<boolean>} props.onDelete - Delete entry callback
 * @param {() => Promise<boolean>} props.onClearAll - Clear all history callback
 * @param {(operationId: string) => Promise<Object>} props.onValidate - Validate entry callback
 * @param {() => void} props.onClose - Close modal callback
 */
function HistoryModal({ isOpen, history, onUndo, onDelete, onClearAll, onValidate, onClose }) {
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleClearAll = useCallback(async () => {
    setShowClearConfirm(false);
    await onClearAll();
  }, [onClearAll]);

  if (!isOpen) return null;

  const hasHistory = history && history.length > 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="history-modal-header">
          <div className="history-modal-title">
            <History size={20} />
            <h3>{STRINGS.HISTORY_TITLE}</h3>
            <span className="history-mode-indicator">
              <Zap size={12} />
              {STRINGS.HISTORY_SUBTITLE}
            </span>
          </div>
          <button className="history-close-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        <p className="history-description">
          {hasHistory ? STRINGS.HISTORY_DESCRIPTION : STRINGS.HISTORY_EMPTY}
        </p>

        {hasHistory && (
          <>
            <div className="history-list">
              {history.map((entry) => (
                <HistoryEntry
                  key={entry.operationId}
                  entry={entry}
                  onUndo={onUndo}
                  onDelete={onDelete}
                  onValidate={onValidate}
                />
              ))}
            </div>

            <div className="history-footer">
              {showClearConfirm ? (
                <div className="history-clear-confirm">
                  <span>{STRINGS.HISTORY_CLEAR_CONFIRM}</span>
                  <button className="btn-text danger" onClick={handleClearAll}>Yes, clear all</button>
                  <button className="btn-text" onClick={() => setShowClearConfirm(false)}>Cancel</button>
                </div>
              ) : (
                <button
                  className="btn-text danger"
                  onClick={() => setShowClearConfirm(true)}
                >
                  <Trash2 size={13} /> {STRINGS.HISTORY_CLEAR_ALL}
                </button>
              )}
              <span className="history-count">
                {history.length} operation{history.length !== 1 ? 's' : ''}
              </span>
            </div>
          </>
        )}

        {!hasHistory && (
          <div className="history-empty-state">
            <History size={40} strokeWidth={1} />
            <p>{STRINGS.HISTORY_EMPTY}</p>
            <div className="history-empty-note">
              <Info size={14} />
              <span>{STRINGS.HISTORY_EMPTY_DETAIL}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default HistoryModal;
