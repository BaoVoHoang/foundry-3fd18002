// Hook for computing line-based diffs between two commits.
//
// Wraps lib/git/diff.diffCommits: given two commit hashes it resolves each
// commit's tree into flat file contents and runs the hand-written Myers
// diff algorithm over every changed file. Also exposes helpers for
// resolving a commit's first parent, so the UI can auto-diff a single
// selected commit against its parent.

'use client';

import { useMemo } from 'react';
import { diffCommits, type DiffHunk } from '@/lib/git/diff';
import { getObjects } from '@/lib/storage';
import type { GitObjectMap } from '@/lib/types';

export type DiffLineTag = '+' | '-' | ' ';

export interface DiffLine {
  tag: DiffLineTag;
  content: string;
}

export interface FileDiff {
  path: string;
  lines: DiffLine[];
}

export interface DiffSummary {
  filesChanged: number;
  insertions: number;
  deletions: number;
}

function hunksToLines(hunks: DiffHunk[]): DiffLine[] {
  return hunks.map((h) => ({ tag: h.type, content: h.line }));
}

/** Returns the first parent hash of a commit, or null if it has none. */
export function getFirstParent(
  hash: string | null,
  objects: GitObjectMap
): string | null {
  if (!hash) return null;
  const obj = objects[hash];
  const parents = obj?.commit?.parentHashes ?? [];
  return parents.length > 0 ? parents[0] : null;
}

export function summarize(diffs: FileDiff[]): DiffSummary {
  let insertions = 0;
  let deletions = 0;
  for (const file of diffs) {
    for (const line of file.lines) {
      if (line.tag === '+') insertions++;
      else if (line.tag === '-') deletions++;
    }
  }
  return { filesChanged: diffs.length, insertions, deletions };
}

/**
 * Compute the diff between two commits (hashA -> hashB). If only hashA is
 * provided (hashB is null/undefined), diffs hashA against its first parent
 * (standard single-commit diff). Recomputes whenever the objects store or
 * hashes change; objects can optionally be passed in explicitly (e.g. for
 * testing) and otherwise are read from localStorage.
 */
export function useDiff(
  hashA: string | null,
  hashB?: string | null,
  objectsOverride?: GitObjectMap
): { diffs: FileDiff[]; summary: DiffSummary; compareHashes: [string, string] | null } {
  return useMemo(() => {
    const objects = objectsOverride ?? getObjects();

    if (!hashA) {
      return { diffs: [], summary: { filesChanged: 0, insertions: 0, deletions: 0 }, compareHashes: null };
    }

    let base: string | null;
    let target: string;

    if (hashB) {
      base = hashA;
      target = hashB;
    } else {
      // Single commit selected: diff against its first parent.
      base = getFirstParent(hashA, objects);
      target = hashA;
    }

    if (base === null) {
      // Root commit with no parent: diff against an empty tree by comparing
      // it to itself with an empty base is not directly supported by
      // diffCommits (which needs a real commit hash), so we synthesize the
      // "everything added" case by diffing target against itself using an
      // empty-objects lookup for the base side is not possible either.
      // Fall back to treating every file in target as added.
      const rawDiffs = diffCommits(target, target, objects).map((d) => ({
        path: d.path,
        lines: hunksToLines(d.hunks),
      }));
      // diffCommits(target, target) yields no diffs (identical), so instead
      // build the added-file view directly from the commit's tree.
      const filesDiff = diffAgainstEmpty(target, objects);
      void rawDiffs;
      return {
        diffs: filesDiff,
        summary: summarize(filesDiff),
        compareHashes: [target, target],
      };
    }

    const rawDiffs = diffCommits(base, target, objects);
    const diffs: FileDiff[] = rawDiffs.map((d) => ({
      path: d.path,
      lines: hunksToLines(d.hunks),
    }));

    return {
      diffs,
      summary: summarize(diffs),
      compareHashes: [base, target],
    };
  }, [hashA, hashB, objectsOverride]);
}

function diffAgainstEmpty(hash: string, objects: GitObjectMap): FileDiff[] {
  const obj = objects[hash];
  if (!obj || obj.type !== 'commit' || !obj.commit) return [];

  const files = flattenTreeLocal(obj.commit.treeHash, objects);
  return Object.keys(files)
    .sort()
    .map((path) => ({
      path,
      lines: files[path].split('\n').map((content) => ({ tag: '+' as const, content })),
    }));
}

function flattenTreeLocal(
  treeHash: string,
  objects: GitObjectMap,
  prefix = ''
): Record<string, string> {
  const result: Record<string, string> = {};
  const treeObj = objects[treeHash];
  if (!treeObj || treeObj.type !== 'tree' || !treeObj.tree) return result;

  for (const entry of treeObj.tree.entries) {
    const fullPath = prefix ? `${prefix}/${entry.path}` : entry.path;
    if (entry.type === 'blob') {
      const blobObj = objects[entry.sha1];
      result[fullPath] = blobObj?.blob?.content ?? '';
    } else {
      Object.assign(result, flattenTreeLocal(entry.sha1, objects, fullPath));
    }
  }
  return result;
}

export default useDiff;
