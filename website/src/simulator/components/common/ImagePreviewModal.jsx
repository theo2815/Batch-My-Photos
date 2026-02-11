import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { getThumbnailGradient } from '../../thumbnailUtils';

/**
 * Inner viewer — keyed by fileName so React resets state when a new image
 * is clicked (fresh navOffset=0 each time).
 */
const ModalContent = ({ fileName, fileList, onClose }) => {
    const [navOffset, setNavOffset] = useState(0);
    const overlayRef = useRef(null);

    // Compute current index from the initially-clicked file + nav offset
    const baseIndex = fileList.findIndex(f => f.name === fileName);
    const currentIndex = Math.max(0, Math.min((baseIndex >= 0 ? baseIndex : 0) + navOffset, fileList.length - 1));

    // Current file data
    const currentFile = fileList[currentIndex] || null;
    const hasPrev = currentIndex > 0;
    const hasNext = currentIndex < fileList.length - 1;

    // Navigation
    const goNext = useCallback((e) => {
        e?.stopPropagation();
        if (hasNext) setNavOffset(prev => prev + 1);
    }, [hasNext]);

    const goPrev = useCallback((e) => {
        e?.stopPropagation();
        if (hasPrev) setNavOffset(prev => prev - 1);
    }, [hasPrev]);

    // Keyboard
    useEffect(() => {
        const handler = (e) => {
            switch (e.key) {
                case 'Escape': onClose(); break;
                case 'ArrowLeft': goPrev(); break;
                case 'ArrowRight': goNext(); break;
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose, goPrev, goNext]);

    // Focus overlay on mount
    useEffect(() => {
        if (overlayRef.current) {
            overlayRef.current.focus();
        }
    }, []);

    if (!currentFile) return null;

    return (
        <div
            className="image-preview-overlay"
            ref={overlayRef}
            tabIndex={-1}
            onClick={onClose}
        >
            {/* Close button */}
            <button
                className="image-preview-close"
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                title="Close (Esc)"
            >
                <X size={20} />
            </button>

            {/* Left arrow */}
            {hasPrev && (
                <button
                    className="image-preview-nav image-preview-nav-left"
                    onClick={goPrev}
                    title="Previous (←)"
                >
                    <ChevronLeft size={24} />
                </button>
            )}

            {/* Image container */}
            <div
                className="image-preview-container"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Simulated image — large gradient thumbnail for demo */}
                <div
                    className="image-preview-img"
                    style={{ background: getThumbnailGradient(currentFile.name) }}
                >
                    <ImageIcon size={48} className="image-preview-placeholder-icon" />
                    <span className="image-preview-placeholder-label">Simulated Preview</span>
                </div>
            </div>

            {/* Right arrow */}
            {hasNext && (
                <button
                    className="image-preview-nav image-preview-nav-right"
                    onClick={goNext}
                    title="Next (→)"
                >
                    <ChevronRight size={24} />
                </button>
            )}

            {/* Bottom info bar */}
            <div className="image-preview-info" onClick={(e) => e.stopPropagation()}>
                <span className="image-preview-filename" title={currentFile.name}>
                    {currentFile.name}
                </span>

                {currentFile.exif?.dimensions && (
                    <span className="image-preview-dimensions">
                        {currentFile.exif.dimensions}
                    </span>
                )}

                {currentFile.exif?.camera && (
                    <span className="image-preview-meta">
                        {currentFile.exif.camera}
                    </span>
                )}

                {currentFile.exif && (
                    <span className="image-preview-meta">
                        {currentFile.exif.focalLength} · {currentFile.exif.aperture} · {currentFile.exif.iso} · {currentFile.exif.shutterSpeed}
                    </span>
                )}

                {currentFile.isBlurry && (
                    <span className="image-preview-blur">
                        <AlertTriangle size={14} /> Blur Score: {currentFile.blurScore}
                    </span>
                )}

                {fileList.length > 1 && (
                    <span className="image-preview-position">
                        {currentIndex + 1} / {fileList.length}
                    </span>
                )}
            </div>
        </div>
    );
};

/**
 * ImagePreviewModal — Full-screen modal overlay for viewing images.
 * Exact replica of the desktop app's ImagePreviewModal.
 *
 *   ✓ Overlay click to close
 *   ✓ Close (X) button
 *   ✓ Left / Right navigation arrows
 *   ✓ Keyboard: Escape, ArrowLeft/Right
 *   ✓ Info bar: filename, dimensions, camera, EXIF, blur score, position
 *
 * Uses `key={fileName}` so React fully resets ModalContent state
 * whenever a different thumbnail is clicked.
 */
const ImagePreviewModal = ({ isOpen, fileName, fileList = [], onClose }) => {
    if (!isOpen || !fileName || fileList.length === 0) return null;
    return <ModalContent key={fileName} fileName={fileName} fileList={fileList} onClose={onClose} />;
};

export default ImagePreviewModal;
