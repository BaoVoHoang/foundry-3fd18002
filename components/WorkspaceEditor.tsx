'use client';

import { useState } from 'react';
import { useFileSystem } from '@/hooks/useFileSystem';
import type { FileStatus } from '@/lib/types';

const STATUS_STYLES: Record<FileStatus, string> = {
  untracked: 'bg-gray-200 text-gray-700',
  modified: 'bg-yellow-200 text-yellow-800',
  staged: 'bg-green-200 text-green-800',
  committed: 'bg-blue-200 text-blue-800',
  deleted: 'bg-red-200 text-red-800',
};

function statusBadgeClass(status: FileStatus): string {
  return STATUS_STYLES[status] ?? 'bg-gray-200 text-gray-700';
}

export default function WorkspaceEditor() {
  const { files, createFile, editFile, deleteFile } = useFileSystem();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  const paths = Object.keys(files).sort();
  const selectedFile = selectedPath ? files[selectedPath] : undefined;

  function handleCreateSubmit() {
    const trimmed = newFileName.trim();
    if (!trimmed) return;
    createFile(trimmed, '');
    setSelectedPath(trimmed);
    setNewFileName('');
    setIsCreating(false);
  }

  function handleEdit(content: string) {
    if (!selectedPath) return;
    editFile(selectedPath, content);
  }

  function handleDelete(path: string) {
    deleteFile(path);
  }

  return (
    <div className="border border-gray-200 rounded p-4 bg-white">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold">Workspace Editor</h2>
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="text-sm px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
          data-testid="new-file-button"
        >
          + New File
        </button>
      </div>

      {isCreating && (
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            autoFocus
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateSubmit();
              if (e.key === 'Escape') {
                setIsCreating(false);
                setNewFileName('');
              }
            }}
            placeholder="path/to/file.txt"
            className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
            data-testid="new-file-input"
          />
          <button
            type="button"
            onClick={handleCreateSubmit}
            className="text-sm px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => {
              setIsCreating(false);
              setNewFileName('');
            }}
            className="text-sm px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-1 border-r border-gray-100 pr-2">
          {paths.length === 0 && (
            <p className="text-sm text-gray-400">No files yet.</p>
          )}
          <ul className="flex flex-col gap-1">
            {paths.map((path) => {
              const file = files[path];
              return (
                <li key={path}>
                  <button
                    type="button"
                    onClick={() => setSelectedPath(path)}
                    className={`w-full text-left text-sm px-2 py-1 rounded flex items-center justify-between gap-2 ${
                      selectedPath === path
                        ? 'bg-blue-50 border border-blue-300'
                        : 'hover:bg-gray-50'
                    }`}
                    data-testid={`file-item-${path}`}
                  >
                    <span className="truncate">{path}</span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${statusBadgeClass(
                        file.status
                      )}`}
                      data-testid={`file-status-${path}`}
                    >
                      {file.status}
                    </span>
                  </button>
                  {file.status !== 'deleted' && (
                    <button
                      type="button"
                      onClick={() => handleDelete(path)}
                      className="text-xs text-red-500 hover:underline ml-2"
                      data-testid={`delete-file-${path}`}
                    >
                      delete
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="col-span-2">
          {selectedPath && selectedFile ? (
            <textarea
              value={selectedFile.content}
              onChange={(e) => handleEdit(e.target.value)}
              className="w-full h-64 border border-gray-300 rounded p-2 text-sm font-mono"
              data-testid="file-editor-textarea"
              disabled={selectedFile.status === 'deleted'}
            />
          ) : (
            <p className="text-sm text-gray-400">Select a file to edit.</p>
          )}
        </div>
      </div>
    </div>
  );
}
