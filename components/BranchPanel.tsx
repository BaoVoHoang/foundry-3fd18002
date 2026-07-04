'use client';

// Lists all branches, highlights the current one, and provides Create
// Branch (from HEAD) and Checkout actions, wired through useRepository.
// Also exposes a button to open MergeDialog for merging another branch
// into the current one.

import { useState } from 'react';
import { useRepository } from '@/hooks/useRepository';
import MergeDialog from './MergeDialog';

export default function BranchPanel() {
  const { branches, currentBranch, createBranch, checkout, head, refresh } =
    useRepository();
  const [newBranchName, setNewBranchName] = useState('');
  const [mergeOpen, setMergeOpen] = useState(false);

  function handleCreate() {
    const name = newBranchName.trim();
    if (!name) return;
    createBranch(name);
    setNewBranchName('');
    refresh();
  }

  function handleCheckout(branch: string) {
    checkout(branch);
    refresh();
  }

  const otherBranchCount = branches.filter((b) => b !== currentBranch).length;

  return (
    <div className="border border-gray-200 rounded p-4 bg-white">
      <h2 className="font-semibold mb-2">Branch Panel</h2>

      {!head && (
        <p
          className="text-xs text-gray-400 mb-2"
          data-testid="branch-panel-no-head"
        >
          HEAD is null &mdash; create a commit before branching.
        </p>
      )}

      <ul className="flex flex-col gap-1 mb-3" data-testid="branch-list">
        {branches.length === 0 && (
          <li className="text-sm text-gray-400">No branches yet.</li>
        )}
        {branches.map((branch) => {
          const isCurrent = branch === currentBranch;
          return (
            <li
              key={branch}
              className={`flex items-center justify-between px-2 py-1 rounded text-sm ${
                isCurrent ? 'bg-blue-50 font-semibold text-blue-700' : ''
              }`}
              data-testid={`branch-item-${branch}`}
            >
              <span>
                {isCurrent ? '\u2713 ' : ''}
                {branch}
              </span>
              {!isCurrent && (
                <button
                  type="button"
                  onClick={() => handleCheckout(branch)}
                  className="text-xs px-2 py-0.5 bg-gray-200 rounded hover:bg-gray-300"
                  data-testid={`checkout-${branch}`}
                >
                  Checkout
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-2 mb-3">
        <input
          type="text"
          value={newBranchName}
          onChange={(e) => setNewBranchName(e.target.value)}
          placeholder="new-branch-name"
          className="border border-gray-300 rounded px-2 py-1 text-sm flex-1"
          data-testid="new-branch-input"
        />
        <button
          type="button"
          onClick={handleCreate}
          disabled={!head}
          className="text-sm px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          data-testid="create-branch-button"
        >
          Create Branch (from HEAD)
        </button>
      </div>

      <button
        type="button"
        onClick={() => setMergeOpen(true)}
        disabled={otherBranchCount === 0}
        className="w-full text-sm px-2 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        data-testid="open-merge-dialog-button"
      >
        Merge Branch...
      </button>

      <MergeDialog open={mergeOpen} onClose={() => setMergeOpen(false)} />
    </div>
  );
}
