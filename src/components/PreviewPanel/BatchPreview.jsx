/**
 * BatchPreview Component
 * 
 * Accordion list showing preview of batch folders with image thumbnails
 * Includes "Load More" functionality for viewing additional files and batches
 */

import React, { useState, useEffect, useRef } from 'react';
import { Package, ChevronRight, ChevronDown, Image, ChevronDownCircle } from 'lucide-react';
import { generateBatchFolderName } from '../../utils/batchNaming';
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
 */
function BatchPreview({ batchDetails, outputPrefix, expandedBatch, onToggleBatch, folderPath }) {
  const [thumbnails, setThumbnails] = useState({});
  const [_loadingThumbnails, setLoadingThumbnails] = useState(false);
  const [visibleFilesCount, setVisibleFilesCount] = useState({}); // { batchNumber: count }
  const [visibleBatchesCount, setVisibleBatchesCount] = useState(10); // Number of batches to show

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
                          className="file-thumbnail"
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
    </div>
  );
}

export default BatchPreview;
