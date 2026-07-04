'use client';

// Modal dialog for merging a target branch into the current branch.
// Triggered from BranchPanel via the `open`/`onClose` props. Presents a
// dropdown of all branches except the current one, and on confirm calls
// useMerge's merge(targetBranch). Displays the outcome: an auto-merge
// summary (files changed / lines added / lines removed) on success, or a
// list of conflicted files (with a preview of the conflict markers) when
// the merge produces conflicts.

import { useEffect, useState } from 'react';
import { useRepository } from '@/hooks/useRepository';
import { useMerge, MergeOutcome } from '@/hooks/useMerge';

export interface MergeDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function MergeDialog({ open, onClose }: MergeDialogProps) {
  const { branches, currentBranch, refresh } = useRepository();
  const { merge, merging } = useMerge();
  const [target, setTarget] = useState('');
  const [outcome, setOutcome] = useState<MergeOutcome | null>(null);

  const otherBranches = branches.filter((b) => b !== currentBranch);

  useEffect(() => {
    if (open) {
      setOutcome(null);
      setTarget(otherBranches[0] ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, branches.join(','), currentBranch]);

  if (!open) return null;

  function handleConfirm() {
    if (!target) return;
    const result = merge(target);
    setOutcome(result);
    refresh();
  }

  function handleClose() {
    setOutcome(null);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      data-testid="merge-dialog-overlay"
    >
      <div
        className="bg-white rounded shadow-lg p-4 w-full max-w-md"
        data-testid="merge-dialog"
      >
        <h2 className="font-semibold mb-2">Merge Branch</h2>

        <p className="text-xs text-gray-500 mb-3">
          Merge a branch into <strong>{currentBranch ?? '(none)'}</strong>.
        </p>

        {otherBranches.length === 0 && (
          <p className="text-sm text-gray-400 mb-3" data-testid="merge-no-branches">
            No other branches available to merge.
          </p>
        )}

        {otherBranches.length > 0 && (
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1" htmlFor="merge-target-select">
              Merge this branch into {currentBranch}:
            </label>
            <select
              id="merge-target-select"
              data-testid="merge-target-select"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
            >
              {otherBranches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        )}

        {outcome && (
          <div
            className={`mb-3 rounded p-2 text-sm ${
              outcome.success
                ? 'bg-green-50 text-green-800'
                : outcome.hasConflicts
                ? 'bg-yellow-50 text-yellow-800'
                : 'bg-red-50 text-red-800'
            }`}
            data-testid="merge-outcome"
          >
            {outcome.success && outcome.summary && (
              <div data-testid="merge-success-summary">
                <p className="font-semibold">Merge succeeded &mdash; commit created.</p>
                <ul className="list-disc list-inside">
                  <li>Files changed: {outcome.summary.filesChanged}</li>
                  <li>Lines added: {outcome.summary.linesAdded}</li>
                  <li>Lines removed: {outcome.summary.linesRemoved}</li>
                </ul>
                {outcome.commitHash && (
                  <p className="text-xs mt-1" data-testid="merge-commit-hash">
                    Merge commit: {outcome.commitHash.slice(0, 10)}
                  </p>
                )}
              </div>
            )}

            {outcome.hasConflicts && (
              <div data-testid="merge-conflict-summary">
                <p className="font-semibold">
                  Merge produced conflicts &mdash; resolve manually.
                </p>
                <p className="text-xs mb-1">
                  The following files contain conflict markers
                  (&lt;&lt;&lt;&lt;&lt;&lt;&lt; ours / ======== /
                  &gt;&gt;&gt;&gt;&gt;&gt;&gt; theirs) in the workspace and
                  are marked modified in the staging area:
                </p>
                <ul className="list-disc list-inside" data-testid="merge-conflict-files">
                  {outcome.conflictFiles.map((f) => (
                    <li key={f} data-testid={`merge-conflict-file-${f}`}>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!outcome.success && !outcome.hasConflicts && (
              <p data-testid="merge-failure">
                Merge could not be performed (missing branch or HEAD).
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="text-sm px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
            data-testid="merge-dialog-close"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!target || merging || otherBranches.length === 0}
            className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            data-testid="merge-confirm-button"
          >
            {merging ? 'Merging...' : 'Merge'}
          </button>
        </div>
      </div>
    </div>
  );
}
