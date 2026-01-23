/**
 * RecentFolders Component
 * 
 * Shows list of recently used folders for quick access
 */

import React from 'react';
import { History, Folder } from 'lucide-react';
import './DropZone.css';

/**
 * @param {Object} props
 * @param {string[]} props.folders - Array of recent folder paths
 * @param {(path: string) => void} props.onSelectFolder - Callback when a folder is selected
 */
function RecentFolders({ folders, onSelectFolder }) {
  if (!folders || folders.length === 0) return null;

  return (
    <div className="recent-folders">
      <h3><History className="icon-inline" size={16} /> Recent Folders</h3>
      <div className="recent-list">
        {folders.map((folder, i) => (
          <button
            key={i}
            className="recent-item"
            onClick={() => onSelectFolder(folder)}
            title={folder}
          >
            <Folder className="folder-icon" size={18} />
            <span className="folder-name">{folder.split(/[/\\]/).pop()}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default RecentFolders;
