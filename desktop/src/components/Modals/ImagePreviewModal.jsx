/**
 * ImagePreviewModal Component
 * 
 * Full-screen modal overlay for viewing images at medium resolution.
 * Supports keyboard navigation (arrow keys, Escape) and prefetching.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, Loader2, ImageOff, Undo2 } from 'lucide-react';
import './Modals.css';

/**
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is visible
 * @param {string} props.folderPath - Source folder path
 * @param {string} props.fileName - Current file name to display
 * @param {string[]} props.fileList - Navigable list of file names
 * @param {Object} [props.imageInfo] - Optional info (e.g. { blurScore: number })
 * @param {Object} [props.blurInfoMap] - Optional map of fileName -> { baseName, score } for blur context
 * @param {(baseName: string) => void} [props.onRestore] - Optional callback to restore a blurry photo
 * @param {() => void} props.onClose - Close callback
 */
function ImagePreviewModal({ isOpen, folderPath, fileName, fileList, imageInfo, blurInfoMap, onRestore, onClose, isBeta = false, previewVersion, labels, onLabel, getSubmission, onSubmit }) {
  const [currentFile, setCurrentFile] = useState(fileName);
  const [previewData, setPreviewData] = useState(null); // { dataUrl, width, height }
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [prevDataUrl, setPrevDataUrl] = useState(null); // For fade transition
  const prefetchRef = useRef({}); // Cache for prefetched images
  const modalRef = useRef(null);

  useEffect(() => { prefetchRef.current = {}; }, [folderPath, previewVersion]);

  const label = labels?.get(currentFile);
  const currentResult = blurInfoMap?.[currentFile];
  const analyzedImage = isBeta && currentResult?.predictedClass && currentResult.score >= 0 ? currentResult : null;
  const currentSubmission = getSubmission?.(currentFile, previewData?.contentHash);
  const submitting = currentSubmission?.status === 'pending';

  const submitExample = () => {
    if (!analyzedImage || !label || submitting || isLoading || previewData?.fileName !== currentFile) return;
    if (!previewData?.contentHash) return;
    return onSubmit(currentFile, label, previewData.contentHash);
  };

  // Sync currentFile when the prop changes (new image clicked)
  useEffect(() => {
    if (isOpen && fileName) {
      setCurrentFile(fileName);
    }
  }, [isOpen, fileName]);

  // Load preview when currentFile changes
  useEffect(() => {
    if (!isOpen || !currentFile || !folderPath) return;

    let cancelled = false;

    const loadPreview = async () => {
      // Check prefetch cache first
      if (!isBeta && prefetchRef.current[currentFile]) {
        setPreviewData(prefetchRef.current[currentFile]);
        setError(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      // Keep previous image visible during load
      if (previewData?.dataUrl) {
        setPrevDataUrl(previewData.dataUrl);
      }

      try {
        const result = await window.electronAPI.getImagePreview(folderPath, currentFile);
        if (cancelled) return;

        if (result.success) {
          setPreviewData({ fileName: currentFile, dataUrl: result.dataUrl, width: result.width, height: result.height, contentHash: result.contentHash });
          setError(null);
        } else {
          setPreviewData(null);
          setError(result.error || 'Failed to load preview');
        }
      } catch (err) {
        if (!cancelled) {
          setPreviewData(null);
          setError('Failed to load preview');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setPrevDataUrl(null);
        }
      }
    };

    loadPreview();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentFile, folderPath, previewVersion]);

  // Prefetch next image in the list
  useEffect(() => {
    if (!isOpen || isBeta || !currentFile || !folderPath || !fileList?.length) return;

    const currentIndex = fileList.indexOf(currentFile);
    if (currentIndex < 0) return;

    const nextFile = fileList[currentIndex + 1];
    if (!nextFile || prefetchRef.current[nextFile]) return;

    let cancelled = false;

    const prefetch = async () => {
      try {
        const result = await window.electronAPI.getImagePreview(folderPath, nextFile);
        if (!cancelled && result.success) {
          prefetchRef.current[nextFile] = {
            fileName: nextFile,
            dataUrl: result.dataUrl,
            width: result.width,
            height: result.height,
            contentHash: result.contentHash,
          };
        }
      } catch (_) {
        // Silently ignore prefetch failures
      }
    };

    prefetch();
    return () => { cancelled = true; };
  }, [isOpen, isBeta, currentFile, folderPath, fileList]);

  // Clear prefetch cache and state when modal closes
  useEffect(() => {
    if (!isOpen) {
      prefetchRef.current = {};
      setPreviewData(null);
      setPrevDataUrl(null);
      setError(null);
      setIsLoading(false);
    }
  }, [isOpen]);

  // Navigation helpers
  const currentIndex = fileList?.indexOf(currentFile) ?? -1;
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex >= 0 && currentIndex < (fileList?.length ?? 0) - 1;

  const goToPrev = useCallback(() => {
    if (canGoPrev && !submitting) {
      setCurrentFile(fileList[currentIndex - 1]);
    }
  }, [canGoPrev, fileList, currentIndex, submitting]);

  const goToNext = useCallback(() => {
    if (canGoNext && !submitting) {
      setCurrentFile(fileList[currentIndex + 1]);
    }
  }, [canGoNext, fileList, currentIndex, submitting]);

  // Keyboard handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Tab') {
        const controls = modalRef.current?.querySelectorAll('button:not(:disabled), [tabindex="0"]');
        const first = controls?.[0];
        const last = controls?.[controls.length - 1];
        const focusOutside = !modalRef.current?.contains(document.activeElement);
        if (e.shiftKey && (document.activeElement === first || document.activeElement === modalRef.current || focusOutside)) {
          e.preventDefault(); last?.focus();
        } else if (!e.shiftKey && (document.activeElement === last || focusOutside)) {
          e.preventDefault(); first?.focus();
        }
        return;
      }
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          goToPrev();
          break;
        case 'ArrowRight':
          e.preventDefault();
          goToNext();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, goToPrev, goToNext]);

  // Focus the modal when it opens
  useEffect(() => {
    if (isOpen && modalRef.current) {
      const opener = document.activeElement;
      modalRef.current.focus();
      return () => opener?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const positionLabel = fileList?.length > 0
    ? `${currentIndex + 1} / ${fileList.length}`
    : null;

  return (
    <div
      className={`image-preview-overlay ${analyzedImage ? 'image-preview-beta' : ''}`}
      onClick={onClose}
      ref={modalRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
    >
      {/* Close button */}
      <button className="image-preview-close" onClick={onClose} aria-label="Close preview">
        <X size={24} />
      </button>

      {/* Left nav arrow */}
      {canGoPrev && (
        <button
          className="image-preview-nav image-preview-nav-left"
          onClick={(e) => { e.stopPropagation(); goToPrev(); }}
          aria-label="Previous image"
          disabled={submitting}
        >
          <ChevronLeft size={32} />
        </button>
      )}

      {/* Main image container */}
      <div className="image-preview-container" onClick={(e) => e.stopPropagation()}>
        {/* Loading spinner */}
        {isLoading && (
          <div className="image-preview-loading">
            <Loader2 size={40} className="icon-spin" />
          </div>
        )}

        {/* Previous image as fade-out background during loading */}
        {isLoading && prevDataUrl && (
          <img
            src={prevDataUrl}
            alt=""
            className="image-preview-img image-preview-img-fading"
          />
        )}

        {/* Current image */}
        {!isLoading && previewData?.fileName === currentFile && previewData?.dataUrl && (
          <img
            src={previewData.dataUrl}
            alt={currentFile}
            className="image-preview-img"
          />
        )}

        {/* Error state */}
        {!isLoading && error && (
          <div className="image-preview-error">
            <ImageOff size={48} />
            <p>Preview not available</p>
            <span>{currentFile}</span>
          </div>
        )}
      </div>

      {/* Right nav arrow */}
      {canGoNext && (
        <button
          className="image-preview-nav image-preview-nav-right"
          onClick={(e) => { e.stopPropagation(); goToNext(); }}
          aria-label="Next image"
          disabled={submitting}
        >
          <ChevronRight size={32} />
        </button>
      )}

      {analyzedImage && (
        <section className="blur-feedback" onClick={e => e.stopPropagation()} aria-label="Review blur suggestion" aria-busy={submitting}>
          <p className="blur-feedback-file">{currentFile}</p>
          <p>Model suggestion: {analyzedImage.isBlurry ? 'possible blur' : 'no blur flagged'}. Your judgment comes first; photos stay in normal batches.</p>
          <div className="blur-feedback-actions" role="group" aria-label="Your label">
            {['sharp', 'blurry'].map(value => (
              <button key={value} type="button" className="btn-small" aria-pressed={label === value}
                disabled={submitting} onClick={() => onLabel(currentFile, value)}>
                {value === 'sharp' ? 'Sharp' : 'Blurry'}
              </button>
            ))}
            <span>Labels stay local until you submit.</span>
          </div>
          <p id="blur-feedback-consent">Submit a resized copy of <strong>{currentFile}</strong> and your label to help improve blur detection.
            {' '}Examples are private, accessible only to the research team, and deleted by the beta coordinator within 30 days or sooner on request.</p>
          <button type="button" className="btn-small primary" aria-describedby="blur-feedback-consent"
            disabled={!label || submitting || isLoading || previewData?.fileName !== currentFile || !previewData?.contentHash || currentSubmission?.status === 'success'}
            onClick={submitExample}>{submitting ? 'Submitting...' : 'Submit this example'}</button>
          {currentSubmission?.status === 'pending' && <p role="status">Submitting {currentFile}...</p>}
          {currentSubmission?.status === 'success' && <p role="status">Example submitted. Thank you.</p>}
          {currentSubmission?.status === 'error' && <p role="alert">{currentSubmission.error} Your label is saved locally; use Submit this example to retry.</p>}
        </section>
      )}

      {/* Bottom info bar */}
      {(() => {
        // Look up blur info for the current file (supports navigation)
        const currentBlurInfo = blurInfoMap?.[currentFile] || null;
        const blurScore = currentBlurInfo?.score ?? imageInfo?.blurScore;
        const hasBlurContext = blurScore !== undefined;

        return (
          <div className="image-preview-info" onClick={(e) => e.stopPropagation()}>
            <span className="image-preview-filename">{currentFile}</span>
            {previewData && (
              <span className="image-preview-dimensions">
                {previewData.width} x {previewData.height}
              </span>
            )}
            {hasBlurContext && (
              <span className="image-preview-blur-score">
                Blur Score: {blurScore >= 0 ? blurScore.toFixed(1) : 'N/A'}
              </span>
            )}
            {currentBlurInfo && onRestore && (
              <button
                className="image-preview-restore-btn"
                onClick={() => onRestore(currentBlurInfo.baseName)}
              >
                <Undo2 size={14} />
                <span>Restore</span>
              </button>
            )}
            {positionLabel && (
              <span className="image-preview-position">{positionLabel}</span>
            )}
          </div>
        );
      })()}
    </div>
  );
}

export default ImagePreviewModal;
