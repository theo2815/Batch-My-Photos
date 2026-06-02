/**
 * DropZone Component
 * 
 * Drag and drop zone for folder selection
 */

import React from 'react';
import { FolderOpen } from 'lucide-react';
import './DropZone.css';

/**
 * @param {Object} props
 * @param {boolean} props.isDragOver - Whether a drag is currently over the zone
 * @param {(e: React.DragEvent) => void} props.onDragOver
 * @param {(e: React.DragEvent) => void} props.onDragLeave
 * @param {(e: React.DragEvent) => void} props.onDrop
 * @param {() => void} props.onClick - Handle click to browse
 */
function DropZone({ isDragOver, onDragOver, onDragLeave, onDrop, onClick, title, subtitle }) {
  return (
    <div
      className={`drop-zone ${isDragOver ? 'drag-over' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick}
    >
      <div className="drop-zone-content">
        <div className="drop-icon"><FolderOpen size={64} strokeWidth={1.5} /></div>
        <h2>{title || "Drop a Folder Here"}</h2>
        <p>{subtitle || "or click to browse"}</p>
      </div>
    </div>
  );
}

export default DropZone;
