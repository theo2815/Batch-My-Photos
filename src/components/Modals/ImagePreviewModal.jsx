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
function ImagePreviewModal({ isOpen, folderPath, fileName, fileList, imageInfo, blurInfoMap, onRestore, onClose }) {
  const [currentFile, setCurrentFile] = useState(fileName);
  const [previewData, setPreviewData] = useState(null); // { dataUrl, width, height }
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [prevDataUrl, setPrevDataUrl] = useState(null); // For fade transition
  const prefetchRef = useRef({}); // Cache for prefetched images
  const modalRef = useRef(null);

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
      if (prefetchRef.current[currentFile]) {
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
          setPreviewData({ dataUrl: result.dataUrl, width: result.width, height: result.height });
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
  }, [isOpen, currentFile, folderPath]);

  // Prefetch next image in the list
  useEffect(() => {
    if (!isOpen || !currentFile || !folderPath || !fileList?.length) return;

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
            dataUrl: result.dataUrl,
            width: result.width,
            height: result.height,
          };
        }
      } catch (_) {
        // Silently ignore prefetch failures
      }
    };

    prefetch();
    return () => { cancelled = true; };
  }, [isOpen, currentFile, folderPath, fileList]);

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
    if (canGoPrev) {
      setCurrentFile(fileList[currentIndex - 1]);
    }
  }, [canGoPrev, fileList, currentIndex]);

  const goToNext = useCallback(() => {
    if (canGoNext) {
      setCurrentFile(fileList[currentIndex + 1]);
    }
  }, [canGoNext, fileList, currentIndex]);

  // Keyboard handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
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
      modalRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const positionLabel = fileList?.length > 0
    ? `${currentIndex + 1} / ${fileList.length}`
    : null;

  return (
    <div
      className="image-preview-overlay"
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
        {!isLoading && previewData?.dataUrl && (
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
        >
          <ChevronRight size={32} />
        </button>
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
