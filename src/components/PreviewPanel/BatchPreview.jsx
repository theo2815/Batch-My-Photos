/**
 * BatchPreview Component
 * 
 * Accordion list showing preview of batch folders
 */

import React from 'react';
import { Package, ChevronRight, ChevronDown } from 'lucide-react';
import './PreviewPanel.css';

/**
 * @param {Object} props
 * @param {Array} props.batchDetails - Array of batch detail objects
 * @param {string} props.outputPrefix - Folder name prefix
 * @param {number|null} props.expandedBatch - Currently expanded batch number
 * @param {(batchNumber: number) => void} props.onToggleBatch - Toggle batch expansion
 */
function BatchPreview({ batchDetails, outputPrefix, expandedBatch, onToggleBatch }) {
  if (!batchDetails || batchDetails.length === 0) return null;

  return (
    <div className="batch-preview">
      <h3><Package className="icon-inline" size={18} /> Batch Preview</h3>
      <div className="batch-list">
        {batchDetails.slice(0, 10).map((batch) => (
          <div key={batch.batchNumber} className="batch-item">
            <button
              className={`batch-header ${expandedBatch === batch.batchNumber ? 'expanded' : ''}`}
              onClick={() => onToggleBatch(batch.batchNumber)}
            >
              <span className="batch-name">
                {outputPrefix}_{String(batch.batchNumber).padStart(3, '0')}
              </span>
              <span className="batch-count">{batch.fileCount} files</span>
              <span className="expand-icon">
                {expandedBatch === batch.batchNumber ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </span>
            </button>
            {expandedBatch === batch.batchNumber && (
              <div className="batch-files">
                {batch.sampleFiles.map((file, i) => (
                  <div key={i} className="file-item">{file}</div>
                ))}
                {batch.hasMore && (
                  <div className="file-item more">... and {batch.fileCount - 5} more</div>
                )}
              </div>
            )}
          </div>
        ))}
        {batchDetails.length > 10 && (
          <p className="more-batches">
            ... and {batchDetails.length - 10} more batches
          </p>
        )}
      </div>
    </div>
  );
}

export default BatchPreview;
