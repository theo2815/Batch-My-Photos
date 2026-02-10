/**
 * BatchPreview Component
 * 
 * Accordion list showing preview of batch folders with image thumbnails
 * Includes "Load More" functionality for viewing additional files and batches
 * Optionally shows a "Blurry Photos" section when blur detection is enabled
 */

import React, { useState, useEffect, useRef } from 'react';
import { Package, ChevronRight, ChevronDown, Image, ChevronDownCircle, ScanEye, Undo2, CheckCircle, Loader2 } from 'lucide-react';
import { generateBatchFolderName } from '../../utils/batchNaming';
import ImagePreviewModal from '../Modals/ImagePreviewModal';
import './PreviewPanel.css';

const FILES_PER_LOAD = 10; // Number of files to show per "Load More" click
const BATCHES_PER_LOAD = 10; // Number of batches to show per "Load More" click

/**
 * @param {Object} props
 * @param {Array} props.batchDetails - Array of batch detail objects
 * @param {string} props.outputPrefix - Folder name prefix
 * @param {number|null} props.expandedBatch - Currently expanded batch number
 * @param {(batchNumber: number) => void} props.onToggleBatch - Toggle batch expansion
 * @param {string} props.folderPath - Source folder path for fetching thumbnails
 * @param {Object} [props.blurDetection] - Blur detection hook state
 * @param {boolean} [props.blurDetectionEnabled] - Whether blur detection is on
 */
function BatchPreview({ batchDetails, outputPrefix, expandedBatch, onToggleBatch, folderPath, blurDetection, blurDetectionEnabled }) {
  const [thumbnails, setThumbnails] = useState({});
  const [_loadingThumbnails, setLoadingThumbnails] = useState(false);
  const [visibleFilesCount, setVisibleFilesCount] = useState({}); // { batchNumber: count }
  const [visibleBatchesCount, setVisibleBatchesCount] = useState(10); // Number of batches to show

  // Image preview modal state
  const [previewImage, setPreviewImage] = useState(null); // { fileName, fileList, imageInfo, blurInfoMap, onRestore }

  // Track which filenames have already been requested to avoid duplicate fetches.
  // Using a ref instead of depending on `thumbnails` state prevents the
  // effect → setState → effect re-trigger loop.
  const requestedFilesRef = useRef(new Set());

  // Reset visible counts when batch details change
  useEffect(() => {
    setVisibleFilesCount({});
    setThumbnails({});
    requestedFilesRef.current = new Set();
    setVisibleBatchesCount(10);
  }, [batchDetails]);

  // Fetch thumbnails when a batch is expanded or more files are loaded
  useEffect(() => {
    if (expandedBatch === null || !folderPath) {
      return;
    }

    const batch = batchDetails.find(b => b.batchNumber === expandedBatch);
    if (!batch) return;

    // Get currently visible files
    const visibleCount = visibleFilesCount[expandedBatch] || 5;
    const filesToShow = (batch.allFiles || batch.sampleFiles || []).slice(0, visibleCount);
    
    // Check which files haven't been requested yet (using ref, not state)
    const missingFiles = filesToShow.filter(f => !requestedFilesRef.current.has(f));
    if (missingFiles.length === 0) return;

    // Mark these files as requested immediately to prevent duplicate fetches
    for (const file of missingFiles) {
      requestedFilesRef.current.add(file);
    }

    const fetchThumbnails = async () => {
      setLoadingThumbnails(true);
      try {
        const newThumbnails = await window.electronAPI.getThumbnails(folderPath, missingFiles);
        setThumbnails(prev => ({ ...prev, ...newThumbnails }));
      } catch (err) {
        console.error('Failed to fetch thumbnails:', err);
        // Remove from requested set so they can be retried
        for (const file of missingFiles) {
          requestedFilesRef.current.delete(file);
        }
      } finally {
        setLoadingThumbnails(false);
      }
    };

    fetchThumbnails();
  }, [expandedBatch, folderPath, batchDetails, visibleFilesCount]);

  // Handle "Load More Files" click
  const handleLoadMoreFiles = (batchNumber, totalFiles) => {
    setVisibleFilesCount(prev => ({
      ...prev,
      [batchNumber]: Math.min((prev[batchNumber] || 5) + FILES_PER_LOAD, totalFiles)
    }));
  };

  // Handle "Load More Batches" click
  const handleLoadMoreBatches = () => {
    setVisibleBatchesCount(prev => Math.min(prev + BATCHES_PER_LOAD, batchDetails.length));
  };

  if (!batchDetails || batchDetails.length === 0) return null;

  const batchesToShow = batchDetails.slice(0, visibleBatchesCount);
  const remainingBatches = batchDetails.length - visibleBatchesCount;
  const canLoadMoreBatches = remainingBatches > 0;

  return (
    <div className="batch-preview">
      <h3><Package className="icon-inline" size={18} /> Batch Preview</h3>
      <div className="batch-list">
        {batchesToShow.map((batch) => {
          const visibleCount = visibleFilesCount[batch.batchNumber] || 5;
          const allFiles = batch.allFiles || batch.sampleFiles || [];
          const filesToShow = allFiles.slice(0, visibleCount);
          const remainingFiles = batch.fileCount - visibleCount;
          const canLoadMore = remainingFiles > 0;

          return (
            <div key={batch.batchNumber} className="batch-item">
              <button
                className={`batch-header ${expandedBatch === batch.batchNumber ? 'expanded' : ''}`}
                onClick={() => onToggleBatch(batch.batchNumber)}
              >
                <span className="batch-name">
                  {generateBatchFolderName(outputPrefix, batch.batchNumber - 1, batchDetails.length)}
                </span>
                <span className="batch-count">{batch.fileCount} files</span>
                <span className="expand-icon">
                  {expandedBatch === batch.batchNumber ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
              </button>
              {expandedBatch === batch.batchNumber && (
                <div className="batch-files">
                  {filesToShow.map((file) => (
                    <div key={file} className="file-item">
                      {thumbnails[file] ? (
                        <img 
                          src={thumbnails[file]} 
                          alt="" 
                          className="file-thumbnail file-thumbnail-clickable"
                          onClick={() => setPreviewImage({ fileName: file, fileList: allFiles, imageInfo: null })}
                        />
                      ) : (
                        <span className="thumbnail-placeholder">
                          <Image size={16} />
                        </span>
                      )}
                      <span className="file-name">{file}</span>
                    </div>
                  ))}
                  {canLoadMore && (
                    <button 
                      className="load-more-btn"
                      onClick={() => handleLoadMoreFiles(batch.batchNumber, batch.fileCount)}
                    >
                      <ChevronDownCircle size={16} />
                      Load More ({remainingFiles} remaining)
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        
        {/* Load More Batches Button */}
        {canLoadMoreBatches && (
          <button 
            className="load-more-btn load-more-batches"
            onClick={handleLoadMoreBatches}
          >
            <ChevronDownCircle size={16} />
            Load More Batches ({remainingBatches} remaining)
          </button>
        )}
        
        {/* Show Less Button - appears when more than 10 batches are shown */}
        {visibleBatchesCount > 10 && (
          <button 
            className="load-more-btn show-less-btn"
            onClick={() => setVisibleBatchesCount(10)}
          >
            Show Less (back to 10)
          </button>
        )}
      </div>

      {/* Blurry Photos Section */}
      {blurDetectionEnabled && blurDetection && (
        <BlurryPhotosSection
          blurDetection={blurDetection}
          outputPrefix={outputPrefix}
          folderPath={folderPath}
          thumbnails={thumbnails}
          onImageClick={(fileName, fileList, imageInfo, blurInfoMap, onRestore) =>
            setPreviewImage({ fileName, fileList, imageInfo, blurInfoMap, onRestore })
          }
        />
      )}

      {/* Image Preview Modal */}
      <ImagePreviewModal
        isOpen={!!previewImage}
        folderPath={folderPath}
        fileName={previewImage?.fileName}
        fileList={previewImage?.fileList || []}
        imageInfo={previewImage?.imageInfo}
        blurInfoMap={previewImage?.blurInfoMap}
        onRestore={previewImage?.onRestore}
        onClose={() => setPreviewImage(null)}
      />
    </div>
  );
}

/**
 * Blurry Photos Section - shows detected blurry groups with un-flag ability
 */
function BlurryPhotosSection({ blurDetection, outputPrefix, folderPath, thumbnails: parentThumbnails, onImageClick }) {
  const { blurResults, blurProgress, blurEta, blurryGroups, blurryCount, isAnalyzing, unflaggedGroups, toggleBlurFlag } = blurDetection;
  const [expanded, setExpanded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);
  const [blurThumbnails, setBlurThumbnails] = useState({});
  const requestedRef = useRef(new Set());

  // Fetch thumbnails for currently VISIBLE blurry files only.
  // Tied to visibleCount so each "Load More" triggers a new batch fetch.
  useEffect(() => {
    if (!expanded || !folderPath || !blurResults || blurryGroups.length === 0) return;

    // Only look at files the user can currently see
    const visibleGroups = blurryGroups.slice(0, visibleCount);
    const filesToFetch = visibleGroups
      .map(baseName => blurResults[baseName]?.analyzedFile)
      .filter(f => f && !requestedRef.current.has(f) && !parentThumbnails[f] && !blurThumbnails[f]);

    if (filesToFetch.length === 0) return;

    // FIX: Only mark the batch we're ACTUALLY fetching as requested.
    // Previously all filesToFetch were marked but only 20 were fetched,
    // permanently blocking the rest from ever loading.
    const batch = filesToFetch.slice(0, 30);
    for (const f of batch) {
      requestedRef.current.add(f);
    }

    const fetchThumbs = async () => {
      try {
        const newThumbnails = await window.electronAPI.getThumbnails(folderPath, batch);
        setBlurThumbnails(prev => ({ ...prev, ...newThumbnails }));
      } catch (err) {
        console.error('Failed to fetch blur thumbnails:', err);
        // On failure, un-mark so they can be retried
        for (const f of batch) {
          requestedRef.current.delete(f);
        }
      }
    };
    fetchThumbs();
  }, [expanded, visibleCount, folderPath, blurResults, blurryGroups, parentThumbnails, blurThumbnails]);

  // Reset thumbnails and pagination when blur results change
  useEffect(() => {
    setBlurThumbnails({});
    setVisibleCount(20);
    requestedRef.current = new Set();
  }, [blurResults]);

  if (isAnalyzing) {
    return (
      <div className="blurry-section">
        <div className="blurry-header analyzing">
          <ScanEye size={18} className="icon-inline" />
          <span className="blurry-analyzing-text">
            Analyzing image quality...
            {blurProgress && (
              <> {blurProgress.current.toLocaleString()} / {blurProgress.total.toLocaleString()}</>
            )}
          </span>
          {blurEta?.label && <span className="blurry-eta">{blurEta.label}</span>}
          <Loader2 size={16} className="spin-icon" />
        </div>
        {blurEta && (
          <div className="blurry-progress-bar">
            <div className="blurry-progress-fill" style={{ width: `${Math.round(blurEta.pct * 100)}%` }} />
          </div>
        )}
      </div>
    );
  }

  if (!blurResults) return null;

  const allThumbs = { ...parentThumbnails, ...blurThumbnails };

  return (
    <div className="blurry-section">
      <button
        className={`blurry-header ${expanded ? 'expanded' : ''}`}
        onClick={() => setExpanded(!expanded)}
      >
        <ScanEye size={18} className="icon-inline" />
        <span className="blurry-title">
          {blurryCount > 0 ? `Blurry Photos (${blurryCount} groups)` : 'No blurry photos detected'}
        </span>
        {blurryCount === 0 && <CheckCircle size={16} className="blurry-check" />}
        {blurryCount > 0 && (
          <span className="blurry-folder-hint">
            Will be placed in {outputPrefix}_Blurry
          </span>
        )}
        <span className="expand-icon">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>

      {expanded && blurryCount > 0 && (() => {
        // Build navigable file list once, outside the per-item loop
        const blurryFileList = blurryGroups
          .map(bn => blurResults[bn]?.analyzedFile)
          .filter(Boolean);

        // Build blur info map so the modal can show score & restore for any image during navigation
        const blurInfoMap = {};
        for (const bn of blurryGroups) {
          const r = blurResults[bn];
          const af = r?.analyzedFile;
          if (af) blurInfoMap[af] = { baseName: bn, score: r?.score, edgeDensity: r?.edgeDensity };
        }

        const visibleGroups = blurryGroups.slice(0, visibleCount);
        const hasMore = blurryGroups.length > visibleCount;
        const remainingCount = blurryGroups.length - visibleCount;

        return (
        <div className="blurry-list">
          {visibleGroups.map(baseName => {
            const result = blurResults[baseName];
            const thumbFile = result?.analyzedFile;
            const thumbSrc = thumbFile ? allThumbs[thumbFile] : null;

            return (
              <div key={baseName} className="blurry-item">
                {thumbSrc ? (
                  <img
                    src={thumbSrc}
                    alt=""
                    className="file-thumbnail blurry-thumb file-thumbnail-clickable"
                    onClick={() => onImageClick?.(thumbFile, blurryFileList, { blurScore: result?.score }, blurInfoMap, toggleBlurFlag)}
                  />
                ) : (
                  <span className="thumbnail-placeholder">
                    <Image size={16} />
                  </span>
                )}
                <span className="blurry-name">{baseName}</span>
                <span className="blurry-score">Score: {result?.score >= 0 ? result.score.toFixed(1) : 'N/A'}</span>
                <button
                  className="unflag-btn"
                  onClick={() => toggleBlurFlag(baseName)}
                  title="Restore to normal batches"
                >
                  <Undo2 size={14} />
                  <span>Restore</span>
                </button>
              </div>
            );
          })}
          {hasMore && (
            <button
              className="blurry-load-more"
              onClick={() => setVisibleCount(prev => prev + 20)}
            >
              <ChevronDown size={16} />
              <span>Load More ({remainingCount} remaining)</span>
            </button>
          )}
        </div>
        );
      })()}

      {expanded && blurryCount === 0 && (
        <div className="blurry-empty">
          <CheckCircle size={20} />
          <p>All photos passed quality check.</p>
        </div>
      )}

      {/* Show un-flagged (restored) groups count */}
      {unflaggedGroups.size > 0 && (
        <div className="blurry-restored-note">
          {unflaggedGroups.size} group{unflaggedGroups.size > 1 ? 's' : ''} restored to normal batches
        </div>
      )}
    </div>
  );
}

export default BatchPreview;
