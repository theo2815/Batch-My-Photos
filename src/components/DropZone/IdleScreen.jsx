/**
 * IdleScreen Component
 * 
 * Container for DropZone and RecentFolders (IDLE state)
 */

import React from 'react';
import DropZone from './DropZone';
import RecentFolders from './RecentFolders';
import './DropZone.css';

/**
 * @param {Object} props
 * @param {boolean} props.isDragOver
 * @param {string[]} props.recentFolders
 * @param {(e: React.DragEvent) => void} props.onDragOver
 * @param {(e: React.DragEvent) => void} props.onDragLeave
 * @param {(e: React.DragEvent) => void} props.onDrop
 * @param {() => void} props.onBrowseClick
 * @param {(path: string) => void} props.onSelectRecentFolder
 */
function IdleScreen({
  isDragOver,
  recentFolders,
  onDragOver,
  onDragLeave,
  onDrop,
  onBrowseClick,
  onSelectRecentFolder
}) {
  return (
    <div className="idle-container">
      <DropZone
        isDragOver={isDragOver}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onBrowseClick}
      />
      <RecentFolders
        folders={recentFolders}
        onSelectFolder={onSelectRecentFolder}
      />
    </div>
  );
}

export default IdleScreen;
