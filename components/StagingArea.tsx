'use client';

import { useFileSystem } from '@/hooks/useFileSystem';

export default function StagingArea() {
  const { files, stageFile, unstageFile } = useFileSystem();

  const entries = Object.entries(files);
  const staged = entries.filter(([, f]) => f.status === 'staged');
  const unstaged = entries.filter(
    ([, f]) => f.status === 'modified' || f.status === 'untracked' || f.status === 'deleted'
  );

  const totalChanged = staged.length + unstaged.length;

  return (
    <div className="border border-gray-200 rounded p-4 bg-white">
      <h2 className="font-semibold mb-2">Staging Area</h2>
      <p className="text-sm text-gray-500 mb-3" data-testid="staging-summary">
        {staged.length} of {totalChanged} changed file
        {totalChanged === 1 ? '' : 's'} staged
      </p>

      <div className="mb-4">
        <h3 className="text-sm font-medium text-gray-600 mb-1">Staged</h3>
        {staged.length === 0 ? (
          <p className="text-xs text-gray-400">Nothing staged.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {staged.map(([path]) => (
              <li
                key={path}
                className="flex items-center justify-between text-sm bg-green-50 px-2 py-1 rounded"
              >
                <span className="truncate">{path}</span>
                <button
                  type="button"
                  onClick={() => unstageFile(path)}
                  className="text-xs px-2 py-0.5 bg-gray-200 rounded hover:bg-gray-300"
                  data-testid={`unstage-${path}`}
                >
                  Unstage
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-600 mb-1">
          Unstaged / Untracked
        </h3>
        {unstaged.length === 0 ? (
          <p className="text-xs text-gray-400">No pending changes.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {unstaged.map(([path, file]) => (
              <li
                key={path}
                className="flex items-center justify-between text-sm bg-gray-50 px-2 py-1 rounded"
              >
                <span className="truncate">
                  {path}{' '}
                  <span className="text-xs text-gray-400">({file.status})</span>
                </span>
                <button
                  type="button"
                  onClick={() => stageFile(path)}
                  className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700"
                  data-testid={`stage-${path}`}
                >
                  Stage
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
