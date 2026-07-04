// Hand-written Myers diff algorithm.
//
// Implements the classic Myers (1986) shortest-edit-script algorithm using
// a diagonal BFS over the edit graph. Given two sequences of lines `a` and
// `b`, `myersDiff` returns a list of hunks tagged '+' (inserted, only in b),
// '-' (deleted, only in a) or ' ' (context, present in both).

import { readObject } from './objects';
import type { GitObjectMap, TreeEntry } from '../types';

export interface DiffHunk {
  type: '+' | '-' | ' ';
  line: string;
}

export interface FileDiff {
  path: string;
  hunks: DiffHunk[];
}

/**
 * Compute the shortest edit script turning `a` into `b` using Myers'
 * O(ND) diff algorithm. Returns an ordered list of DiffHunk entries: ' '
 * for lines common to both, '-' for lines only in `a` (deletions), and
 * '+' for lines only in `b` (insertions).
 */
export function myersDiff(a: string[], b: string[]): DiffHunk[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;

  if (max === 0) {
    return [];
  }

  // trace[d] = snapshot of the V array (as a Map from k -> x) after step d.
  const trace: Map<number, number>[] = [];
  let v = new Map<number, number>();
  v.set(1, 0);

  outer: for (let d = 0; d <= max; d++) {
    const vd = new Map<number, number>(v);
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && (v.get(k - 1) ?? 0) < (v.get(k + 1) ?? 0))) {
        x = v.get(k + 1) ?? 0;
      } else {
        x = (v.get(k - 1) ?? 0) + 1;
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      vd.set(k, x);
      if (x >= n && y >= m) {
        trace.push(vd);
        break outer;
      }
    }
    trace.push(vd);
    v = vd;
  }

  // Backtrack through the trace to build the edit script (built in reverse).
  const reversedHunks: DiffHunk[] = [];
  let x = n;
  let y = m;

  for (let d = trace.length - 1; d >= 0; d--) {
    const vd = trace[d];
    const k = x - y;

    let prevK: number;
    if (k === -d || (k !== d && (vd.get(k - 1) ?? 0) < (vd.get(k + 1) ?? 0))) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }

    const prevX = d > 0 ? (trace[d - 1].get(prevK) ?? 0) : 0;
    const prevY = prevX - prevK;

    // Follow the diagonal (snake) back: these are context lines, added in
    // reverse order (from (x,y) back down to (prevX, prevY)).
    while (x > prevX && y > prevY) {
      reversedHunks.push({ type: ' ', line: a[x - 1] });
      x--;
      y--;
    }

    if (d > 0) {
      if (x === prevX) {
        // insertion (moved along y): b[y-1] was inserted
        reversedHunks.push({ type: '+', line: b[y - 1] });
        y--;
      } else {
        // deletion (moved along x): a[x-1] was deleted
        reversedHunks.push({ type: '-', line: a[x - 1] });
        x--;
      }
    }
  }

  reversedHunks.reverse();
  return reversedHunks;
}

// ---- Commit tree diffing --------------------------------------------

/** Recursively flatten a tree object into a map of filePath -> blob content. */
function flattenTree(
  treeHash: string,
  objects: GitObjectMap,
  prefix = ''
): Record<string, string> {
  const result: Record<string, string> = {};
  const treeObj = objects[treeHash];
  if (!treeObj || treeObj.type !== 'tree' || !treeObj.tree) {
    return result;
  }

  for (const entry of treeObj.tree.entries as TreeEntry[]) {
    const fullPath = prefix ? `${prefix}/${entry.path}` : entry.path;
    if (entry.type === 'blob') {
      const blobObj = objects[entry.sha1];
      const content = blobObj?.blob?.content ?? '';
      result[fullPath] = content;
    } else {
      Object.assign(result, flattenTree(entry.sha1, objects, fullPath));
    }
  }

  return result;
}

function filesForCommit(
  commitHash: string,
  objects: GitObjectMap
): Record<string, string> {
  const commitObj = objects[commitHash];
  if (!commitObj || commitObj.type !== 'commit' || !commitObj.commit) {
    return {};
  }
  return flattenTree(commitObj.commit.treeHash, objects);
}

/**
 * Diff every file between two commits. Resolves both commit trees into
 * flat path -> content maps, then runs myersDiff on the line arrays of
 * each file present in either commit (added, removed, or modified).
 */
export function diffCommits(
  hashA: string,
  hashB: string,
  objects: GitObjectMap
): FileDiff[] {
  const filesA = filesForCommit(hashA, objects);
  const filesB = filesForCommit(hashB, objects);

  const allPaths = new Set<string>([
    ...Object.keys(filesA),
    ...Object.keys(filesB),
  ]);

  const diffs: FileDiff[] = [];

  for (const path of Array.from(allPaths).sort()) {
    const contentA = filesA[path];
    const contentB = filesB[path];

    if (contentA === contentB) {
      // Identical (present unchanged in both) - skip, no diff to report.
      continue;
    }

    const linesA = contentA !== undefined ? contentA.split('\n') : [];
    const linesB = contentB !== undefined ? contentB.split('\n') : [];

    const hunks = myersDiff(linesA, linesB);
    diffs.push({ path, hunks });
  }

  return diffs;
}

// Re-export readObject for convenience in case callers want single-object
// lookups alongside diffCommits.
export { readObject };
