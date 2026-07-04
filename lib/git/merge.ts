// Three-way merge algorithm with conflict markers.
//
// Given a base version and two divergent versions (ours/theirs), computes
// diffs from base to each side using myersDiff, then walks both edit
// scripts in tandem: non-overlapping changes are auto-applied, and
// overlapping edits to the same base region are emitted as inline
// conflict markers.

import { myersDiff, DiffHunk } from './diff';
import { findLCA } from './dag';
import { readObject } from './objects';
import type { GitObjectMap, RefMap, TreeEntry } from '../types';

export interface MergeFileResult {
  path: string;
  result: string[];
  hasConflict: boolean;
}

export interface MergeResult {
  success: boolean;
  hasConflicts: boolean;
  files: Record<string, { content: string; hasConflict: boolean }>;
  lca: string | null;
}

/**
 * A single "op" derived from a diff hunk list: either a run of context
 * lines (kept as-is) or a change (a deletion+insertion block) at a given
 * position in the base sequence.
 */
interface Op {
  kind: 'equal' | 'change';
  baseLines: string[]; // lines from base consumed by this op
  newLines: string[]; // resulting lines contributed by this side (equal ops: same as baseLines)
}

/** Convert a myersDiff hunk list into a sequence of equal/change ops. */
function hunksToOps(hunks: DiffHunk[]): Op[] {
  const ops: Op[] = [];
  let i = 0;

  while (i < hunks.length) {
    const hunk = hunks[i];

    if (hunk.type === ' ') {
      ops.push({ kind: 'equal', baseLines: [hunk.line], newLines: [hunk.line] });
      i++;
      continue;
    }

    // Gather a contiguous run of '-' and '+' hunks into one change op.
    const baseLines: string[] = [];
    const newLines: string[] = [];
    while (i < hunks.length && hunks[i].type !== ' ') {
      if (hunks[i].type === '-') {
        baseLines.push(hunks[i].line);
      } else {
        newLines.push(hunks[i].line);
      }
      i++;
    }
    ops.push({ kind: 'change', baseLines, newLines });
  }

  return ops;
}

/**
 * Merge two op streams (ours/theirs), both derived from the same base,
 * into a single result. Walks both op lists in lockstep by base-line
 * consumption. When both sides change the same base region differently,
 * emit conflict markers; when only one side changes a region, apply it;
 * when both make identical changes, apply once.
 */
function mergeOps(oursOps: Op[], theirsOps: Op[]): { result: string[]; hasConflict: boolean } {
  const result: string[] = [];
  let hasConflict = false;

  let oi = 0;
  let ti = 0;

  while (oi < oursOps.length && ti < theirsOps.length) {
    const o = oursOps[oi];
    const t = theirsOps[ti];

    if (o.kind === 'equal' && t.kind === 'equal') {
      // Base lines should match here since both derive from same base.
      result.push(...o.newLines);
      oi++;
      ti++;
      continue;
    }

    if (o.kind === 'change' && t.kind === 'equal' && t.baseLines.length >= o.baseLines.length) {
      // ours changes a region that theirs left untouched (theirs equal run
      // covers it fully or partially) -- apply ours' change, then consume
      // the matching portion of theirs' equal run.
      result.push(...o.newLines);
      const consumed = o.baseLines.length;
      oi++;
      // Consume `consumed` base lines from theirs' equal op.
      consumeEqualBaseLines(theirsOps, ti, consumed, (newTi) => (ti = newTi));
      continue;
    }

    if (t.kind === 'change' && o.kind === 'equal' && o.baseLines.length >= t.baseLines.length) {
      result.push(...t.newLines);
      const consumed = t.baseLines.length;
      ti++;
      consumeEqualBaseLines(oursOps, oi, consumed, (newOi) => (oi = newOi));
      continue;
    }

    if (o.kind === 'change' && t.kind === 'change') {
      // Both changed at (roughly) the same spot.
      const sameChange =
        o.baseLines.join('\n') === t.baseLines.join('\n') &&
        o.newLines.join('\n') === t.newLines.join('\n');

      if (sameChange) {
        result.push(...o.newLines);
      } else {
        hasConflict = true;
        result.push('<<<<<<< ours');
        result.push(...o.newLines);
        result.push('========');
        result.push(...t.newLines);
        result.push('>>>>>>> theirs');
      }
      oi++;
      ti++;
      continue;
    }

    // Mismatched partial overlap (one side's base-run is shorter than the
    // other's change region) - fall back to conservative conflict marker
    // using whichever change is available, consuming both ops.
    if (o.kind === 'change' || t.kind === 'change') {
      hasConflict = true;
      result.push('<<<<<<< ours');
      result.push(...o.newLines);
      result.push('========');
      result.push(...t.newLines);
      result.push('>>>>>>> theirs');
      oi++;
      ti++;
      continue;
    }

    // Both equal but of different lengths (shouldn't normally happen since
    // both are derived from identical base) - just advance the shorter one.
    result.push(...o.newLines);
    oi++;
    ti++;
  }

  // Flush any remaining ops (one side finished first because the other
  // side's base region was longer/shorter due to a preceding change).
  while (oi < oursOps.length) {
    result.push(...oursOps[oi].newLines);
    oi++;
  }
  while (ti < theirsOps.length) {
    result.push(...theirsOps[ti].newLines);
    ti++;
  }

  return { result, hasConflict };
}

/**
 * Helper: given an ops array and a starting index pointing at an 'equal'
 * op, consume `count` base lines worth of equal ops (splitting the current
 * op if it's longer than needed), calling `setIndex` with the resulting
 * index once done. Mutates the ops array in place when splitting.
 */
function consumeEqualBaseLines(
  ops: Op[],
  startIndex: number,
  count: number,
  setIndex: (i: number) => void
): void {
  let remaining = count;
  let idx = startIndex;

  while (remaining > 0 && idx < ops.length) {
    const op = ops[idx];
    if (op.kind !== 'equal') {
      // Nothing to consume against a change op; bail out.
      break;
    }
    if (op.baseLines.length <= remaining) {
      remaining -= op.baseLines.length;
      idx++;
    } else {
      // Split this equal op: consume `remaining` lines from its front.
      const restBase = op.baseLines.slice(remaining);
      const restNew = op.newLines.slice(remaining);
      ops[idx] = { kind: 'equal', baseLines: restBase, newLines: restNew };
      remaining = 0;
    }
  }

  setIndex(idx);
}

/**
 * Perform a three-way merge of `base`, `ours`, and `theirs` line arrays.
 * Computes diffs from base to each side, then merges the resulting op
 * streams, auto-applying non-overlapping changes and emitting conflict
 * markers for overlapping edits.
 */
export function threeWayMerge(
  base: string[],
  ours: string[],
  theirs: string[]
): { result: string[]; hasConflict: boolean } {
  const oursHunks = myersDiff(base, ours);
  const theirsHunks = myersDiff(base, theirs);

  const oursOps = hunksToOps(oursHunks);
  const theirsOps = hunksToOps(theirsHunks);

  return mergeOps(oursOps, theirsOps);
}

// ---- Branch-level merge ----------------------------------------------

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
      result[fullPath] = blobObj?.blob?.content ?? '';
    } else {
      Object.assign(result, flattenTree(entry.sha1, objects, fullPath));
    }
  }

  return result;
}

function filesForCommit(
  commitHash: string | null,
  objects: GitObjectMap
): Record<string, string> {
  if (!commitHash) return {};
  const commitObj = objects[commitHash];
  if (!commitObj || commitObj.type !== 'commit' || !commitObj.commit) {
    return {};
  }
  return flattenTree(commitObj.commit.treeHash, objects);
}

/**
 * Merge `targetBranch` into `currentBranch`. Finds the LCA commit via
 * `dag.findLCA`, resolves the base/ours/theirs file contents for every
 * path touched by either side, and runs `threeWayMerge` per file.
 * Returns the resulting workspace state plus whether any conflicts were
 * produced.
 */
export function mergeBranches(
  currentBranch: string,
  targetBranch: string,
  objects: GitObjectMap,
  refs: RefMap
): MergeResult {
  const oursHash = refs[`refs/heads/${currentBranch}`] ?? null;
  const theirsHash = refs[`refs/heads/${targetBranch}`] ?? null;

  if (!oursHash || !theirsHash) {
    return { success: false, hasConflicts: false, files: {}, lca: null };
  }

  const lca = findLCA(oursHash, theirsHash, objects);

  const baseFiles = filesForCommit(lca, objects);
  const oursFiles = filesForCommit(oursHash, objects);
  const theirsFiles = filesForCommit(theirsHash, objects);

  const allPaths = new Set<string>([
    ...Object.keys(baseFiles),
    ...Object.keys(oursFiles),
    ...Object.keys(theirsFiles),
  ]);

  const files: Record<string, { content: string; hasConflict: boolean }> = {};
  let hasConflicts = false;

  for (const path of allPaths) {
    const inBase = Object.prototype.hasOwnProperty.call(baseFiles, path);
    const inOurs = Object.prototype.hasOwnProperty.call(oursFiles, path);
    const inTheirs = Object.prototype.hasOwnProperty.call(theirsFiles, path);

    const baseContent = baseFiles[path];
    const oursContent = oursFiles[path];
    const theirsContent = theirsFiles[path];

    // Neither side has it (shouldn't happen since path came from union) - skip.
    if (!inOurs && !inTheirs) {
      continue;
    }

    // File newly added on exactly one side (didn't exist in base): just
    // take that side's content, no conflict.
    if (!inBase) {
      if (inOurs && inTheirs) {
        if (oursContent === theirsContent) {
          files[path] = { content: oursContent, hasConflict: false };
        } else {
          // Both sides independently added the same path with different
          // content -> conflict.
          const baseLines: string[] = [];
          const oursLines = oursContent.split('\n');
          const theirsLines = theirsContent.split('\n');
          const { result, hasConflict } = threeWayMerge(baseLines, oursLines, theirsLines);
          if (hasConflict) hasConflicts = true;
          files[path] = { content: result.join('\n'), hasConflict };
        }
      } else if (inOurs) {
        files[path] = { content: oursContent, hasConflict: false };
      } else {
        files[path] = { content: theirsContent, hasConflict: false };
      }
      continue;
    }

    // File existed in base. Was it deleted on one/both sides?
    if (!inOurs && !inTheirs) {
      continue; // both deleted
    }

    if (!inOurs && inTheirs) {
      // ours deleted it.
      if (theirsContent === baseContent) {
        // theirs left it unchanged -> honor the deletion.
        continue;
      }
      // theirs modified a file ours deleted -> conflict.
      hasConflicts = true;
      files[path] = {
        content: `<<<<<<< ours\n(deleted)\n========\n${theirsContent}\n>>>>>>> theirs`,
        hasConflict: true,
      };
      continue;
    }

    if (!inTheirs && inOurs) {
      // theirs deleted it.
      if (oursContent === baseContent) {
        continue;
      }
      hasConflicts = true;
      files[path] = {
        content: `<<<<<<< ours\n${oursContent}\n========\n(deleted)\n>>>>>>> theirs`,
        hasConflict: true,
      };
      continue;
    }

    // Present on all three sides: run a proper three-way merge.
    const baseLines = (baseContent ?? '').split('\n');
    const oursLines = oursContent.split('\n');
    const theirsLines = theirsContent.split('\n');

    const { result, hasConflict } = threeWayMerge(baseLines, oursLines, theirsLines);
    if (hasConflict) hasConflicts = true;

    files[path] = { content: result.join('\n'), hasConflict };
  }

  return { success: true, hasConflicts, files, lca };
}

export { readObject };
