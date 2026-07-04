// Commit DAG traversal and layout helpers (LCA, topological sort).

import type { GitObjectMap } from '../types';

function getParents(hash: string, objects: GitObjectMap): string[] {
  const obj = objects[hash];
  if (!obj || obj.type !== 'commit' || !obj.commit) return [];
  return obj.commit.parentHashes;
}

/**
 * Return the set of all ancestor commit hashes reachable from `hash`
 * (via parent pointers), including `hash` itself.
 */
export function getCommitAncestors(
  hash: string,
  objects: GitObjectMap
): Set<string> {
  const visited = new Set<string>();
  const queue: string[] = [hash];

  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const parent of getParents(current, objects)) {
      if (!visited.has(parent)) {
        queue.push(parent);
      }
    }
  }

  return visited;
}

/**
 * Find the lowest common ancestor of two commits by BFS over parent
 * pointers. Strategy: compute the full ancestor set of hashA (including
 * itself), then BFS out from hashB (which naturally follows chronological
 * order via parent pointers) and return the first hash that is also an
 * ancestor of hashA. This yields a "lowest" (closest) common ancestor for
 * typical linear/merge DAGs.
 */
export function findLCA(
  hashA: string,
  hashB: string,
  objects: GitObjectMap
): string | null {
  if (hashA === hashB) return hashA;

  const ancestorsOfA = getCommitAncestors(hashA, objects);

  const visited = new Set<string>();
  const queue: string[] = [hashB];

  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (visited.has(current)) continue;
    visited.add(current);

    if (ancestorsOfA.has(current)) {
      return current;
    }

    for (const parent of getParents(current, objects)) {
      if (!visited.has(parent)) {
        queue.push(parent);
      }
    }
  }

  return null;
}

/**
 * Topologically sort a set of commit hashes such that every commit
 * appears after all of its ancestors among the given hashes (parents
 * before children), suitable for rendering a commit graph top-to-bottom
 * in reverse-chronological order. Uses Kahn's algorithm with a
 * timestamp-based tie-break so ordering is stable and deterministic.
 */
export function topologicalSort(
  hashes: string[],
  objects: GitObjectMap
): string[] {
  const hashSet = new Set(hashes);

  // in-degree here means "number of parents (within hashSet) not yet emitted"
  const inDegree = new Map<string, number>();
  const children = new Map<string, string[]>();

  for (const hash of hashes) {
    inDegree.set(hash, 0);
    children.set(hash, []);
  }

  for (const hash of hashes) {
    const parents = getParents(hash, objects).filter((p) => hashSet.has(p));
    inDegree.set(hash, parents.length);
    for (const parent of parents) {
      const list = children.get(parent) ?? [];
      list.push(hash);
      children.set(parent, list);
    }
  }

  const timestampOf = (hash: string): number => {
    const obj = objects[hash];
    return obj?.commit?.timestamp ?? 0;
  };

  // Start with commits that have no parents within the set (roots), then
  // process children only once all their in-set parents are emitted.
  // Among available candidates, prefer the most recent timestamp first so
  // the result reads newest-to-oldest, parents-before-children.
  const available: string[] = hashes.filter((h) => inDegree.get(h) === 0);
  const result: string[] = [];
  const inSet = new Set(available);

  const popBest = (list: string[]): string => {
    let bestIdx = 0;
    for (let i = 1; i < list.length; i++) {
      if (timestampOf(list[i]) > timestampOf(list[bestIdx])) {
        bestIdx = i;
      }
    }
    const [best] = list.splice(bestIdx, 1);
    return best;
  };

  while (available.length > 0) {
    const next = popBest(available);
    inSet.delete(next);
    result.push(next);

    for (const child of children.get(next) ?? []) {
      const remaining = (inDegree.get(child) ?? 0) - 1;
      inDegree.set(child, remaining);
      if (remaining === 0 && !inSet.has(child)) {
        available.push(child);
        inSet.add(child);
      }
    }
  }

  return result;
}
