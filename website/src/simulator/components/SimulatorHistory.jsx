/**
 * SimulatorHistory Component
 * 
 * Ported from desktop HistoryModal for web demo.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  History, Undo2, Trash2, FolderOpen, Clock,
  FileStack, AlertTriangle, CheckCircle, XCircle,
  Loader, X, Zap, ChevronDown, ChevronUp,
  Settings2, Package, ArrowUpDown, Info, Copy, Check
} from 'lucide-react';
import '../styles/SimulatorModals.css';

const STRINGS = {
  HISTORY_TITLE: 'Operation History',
  HISTORY_SUBTITLE: 'Move Mode Only',
  HISTORY_DESCRIPTION: 'Past Move mode batch operations that can be undone. Copy mode operations are not tracked here because original files are preserved.',
  HISTORY_EMPTY: 'No operation history yet.',
  HISTORY_EMPTY_DETAIL: 'Only Move mode operations are recorded here. Copy mode preserves originals, so no undo is needed.',
  HISTORY_MODE_MOVE: 'Move',
  HISTORY_SETTINGS_LABEL: 'Settings',
  HISTORY_MAX_FILES: 'Max per batch',
  HISTORY_SORT_ORDER: 'Sort',
  HISTORY_RESULT_LABEL: 'Result',
  HISTORY_VALIDATE: 'Verify files are still in batch locations',
  HISTORY_UNDO: 'Undo this operation and restore files',
  HISTORY_DELETE: 'Remove this entry from history',
  HISTORY_CLEAR_ALL: 'Clear All History',
  HISTORY_CLEAR_CONFIRM: 'Delete all history entries? This cannot be undone.',
};

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

function getBreadcrumbPath(folderPath) {
  if (!folderPath) return '';
  const sep = folderPath.includes('/') ? '/' : '\\';
  // Handle simulated paths that might not have separators yet
  if (!folderPath.includes(sep)) return folderPath;
  
  const parts = folderPath.split(/[/\\]/).filter(Boolean);

  // 3 or fewer segments — show the full path as-is (e.g. "D:\Photos\Batch1")
  if (parts.length <= 3) return folderPath;

  // Drive/root (e.g. "C:") + … + last two segments
  const drive = parts[0]; // "C:" or root
  const parent = parts[parts.length - 2];
  const folder = parts[parts.length - 1];
  return `${drive}${sep}…${sep}${parent}${sep}${folder}`;
}

function getSortLabel(sortBy) {
  if (!sortBy) return 'Name (A-Z)';
  if (sortBy === 'name-asc') return 'Name (A-Z)';
  if (sortBy === 'name-desc') return 'Name (Z-A)';
  if (sortBy.includes('asc') && (sortBy.includes('date') || sortBy.includes('exif'))) return 'Date (Oldest)';
  if (sortBy.includes('desc') && (sortBy.includes('date') || sortBy.includes('exif'))) return 'Date (Newest)';
  return sortBy;
}

function HistoryEntry({ entry, onUndo, onDelete, onValidate }) {
  const [validationState, setValidationState] = useState(null);
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

  const handleCopyPath = useCallback((e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(entry.sourceFolder).then(() => {
        setCopied(true);
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }, [entry.sourceFolder]);

  const hasSettings = entry.maxFilesPerBatch || entry.sortBy;
  const hasBatchResults = entry.batchResults && entry.batchResults.length > 0;

  return (
    <div className="history-entry">
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

      {expanded && (
        <div className="history-entry-details">
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

      <div className="history-entry-actions">
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

        <button
          className="history-action-btn undo"
          onClick={handleUndoClick}
          title={STRINGS.HISTORY_UNDO}
        >
          <Undo2 size={13} /> Undo
        </button>

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

const SimulatorHistory = ({ isOpen, history, onUndo, onDelete, onClearAll, onValidate, onClose }) => {
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleClearAll = useCallback(() => {
    setShowClearConfirm(false);
    onClearAll();
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

        {hasHistory && (
          <p className="history-description">
            {STRINGS.HISTORY_DESCRIPTION}
          </p>
        )}

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
};

export default SimulatorHistory;
