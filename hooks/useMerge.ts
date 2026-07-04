'use client';

// Hook for performing three-way merges between the current branch and a
// target branch, wrapping lib/git/merge.mergeBranches.
//
// On success (no conflicts): writes merged file contents to
// gitlite:workspace (status 'committed'), creates a merge commit with two
// parent hashes via the objects/refs layer, and advances HEAD/current
// branch ref to the new commit.
//
// On conflict: writes the conflict-marked file contents to
// gitlite:workspace with status 'modified' (NOT auto-committed) so the
// user can resolve them manually and stage/commit as usual.

import { useCallback, useState } from 'react';
import { getObjects, getRefs, getWorkspace, setWorkspace } from '@/lib/storage';
import { getCurrentBranch, getRef, setRef, setHEAD } from '@/lib/git/refs';
import { writeObject, makeCommit } from '@/lib/git/objects';
import { mergeBranches, MergeResult } from '@/lib/git/merge';
import type { WorkspaceMap, FileStatus } from '@/lib/types';

export interface MergeSummary {
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
}

export interface MergeOutcome {
  success: boolean;
  hasConflicts: boolean;
  conflictFiles: string[];
  summary: MergeSummary | null;
  commitHash: string | null;
}

export interface UseMergeResult {
  merging: boolean;
  lastOutcome: MergeOutcome | null;
  merge: (targetBranch: string) => MergeOutcome;
}

function countLineDelta(
  oldContent: string | undefined,
  newContent: string
): { added: number; removed: number } {
  const oldLines = oldContent !== undefined ? oldContent.split('\n') : [];
  const newLines = newContent.split('\n');
  // Simple line-count delta (not a full diff) sufficient for summary stats.
  const added = Math.max(0, newLines.length - oldLines.length);
  const removed = Math.max(0, oldLines.length - newLines.length);
  return { added, removed };
}

export function useMerge(): UseMergeResult {
  const [merging, setMerging] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<MergeOutcome | null>(null);

  const merge = useCallback((targetBranch: string): MergeOutcome => {
    setMerging(true);
    try {
      const currentBranch = getCurrentBranch();
      if (!currentBranch) {
        const outcome: MergeOutcome = {
          success: false,
          hasConflicts: false,
          conflictFiles: [],
          summary: null,
          commitHash: null,
        };
        setLastOutcome(outcome);
        return outcome;
      }

      const objects = getObjects();
      const refs = getRefs();

      const result: MergeResult = mergeBranches(
        currentBranch,
        targetBranch,
        objects,
        refs
      );

      if (!result.success) {
        const outcome: MergeOutcome = {
          success: false,
          hasConflicts: false,
          conflictFiles: [],
          summary: null,
          commitHash: null,
        };
        setLastOutcome(outcome);
        return outcome;
      }

      const workspace = getWorkspace();
      const conflictFiles: string[] = [];
      let linesAdded = 0;
      let linesRemoved = 0;
      let filesChanged = 0;

      const nextWorkspace: WorkspaceMap = { ...workspace };

      for (const [path, fileResult] of Object.entries(result.files)) {
        filesChanged++;
        const previous = workspace[path]?.content;
        const delta = countLineDelta(previous, fileResult.content);
        linesAdded += delta.added;
        linesRemoved += delta.removed;

        if (fileResult.hasConflict) {
          conflictFiles.push(path);
          nextWorkspace[path] = {
            content: fileResult.content,
            status: 'modified' as FileStatus,
          };
        } else {
          nextWorkspace[path] = {
            content: fileResult.content,
            status: result.hasConflicts
              ? ('modified' as FileStatus)
              : ('committed' as FileStatus),
          };
        }
      }

      if (result.hasConflicts) {
        // Conflict: write workspace with conflict markers, do NOT commit.
        setWorkspace(nextWorkspace);

        const outcome: MergeOutcome = {
          success: false,
          hasConflicts: true,
          conflictFiles,
          summary: null,
          commitHash: null,
        };
        setLastOutcome(outcome);
        return outcome;
      }

      // Auto-merge succeeded with no conflicts: write files, create merge
      // commit with two parent hashes, advance HEAD/branch ref.
      setWorkspace(nextWorkspace);

      const oursHash = getRef(`refs/heads/${currentBranch}`);
      const theirsHash = getRef(`refs/heads/${targetBranch}`);
      const parents = [oursHash, theirsHash].filter(
        (h): h is string => h !== null
      );

      // Build a tree from the merged file set directly (rather than going
      // through the staging index) so the merge commit captures the full
      // resulting file set even if the user hasn't staged anything.
      const { buildTreeFromIndex } = require('@/lib/git/index');
      const fileContents: Record<string, string> = {};
      const indexEntries = Object.keys(nextWorkspace).map((path) => {
        fileContents[path] = nextWorkspace[path].content;
        return { path, sha1: '' };
      });
      const treeHash = buildTreeFromIndex(indexEntries, fileContents);

      const commitMessage = `Merge branch '${targetBranch}' into ${currentBranch}`;
      const commitObj = makeCommit(
        commitMessage,
        treeHash,
        parents,
        'user',
        Date.now()
      );
      const commitHash = writeObject(commitObj);

      setRef(`refs/heads/${currentBranch}`, commitHash);
      setHEAD(commitHash);

      const outcome: MergeOutcome = {
        success: true,
        hasConflicts: false,
        conflictFiles: [],
        summary: { filesChanged, linesAdded, linesRemoved },
        commitHash,
      };
      setLastOutcome(outcome);
      return outcome;
    } finally {
      setMerging(false);
    }
  }, []);

  return { merging, lastOutcome, merge };
}

export default useMerge;
