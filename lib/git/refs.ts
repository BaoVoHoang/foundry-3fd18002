// Ref (branch/HEAD) management helpers.

import { getRefs, setRefs, getConfig, setConfig } from '../storage';
import type { RefMap, RepoConfig } from '../types';

const HEADS_PREFIX = 'refs/heads/';

function branchRefName(branch: string): string {
  return `${HEADS_PREFIX}${branch}`;
}

/** Get the commit hash a ref points to, or null if it doesn't exist. */
export function getRef(refName: string): string | null {
  const refs = getRefs();
  return refs[refName] ?? null;
}

/** Set a ref (e.g. `refs/heads/main`) to point at a commit hash. */
export function setRef(refName: string, hash: string): void {
  const refs = getRefs();
  refs[refName] = hash;
  setRefs(refs);
}

/** Remove a ref entirely. */
export function deleteRef(refName: string): void {
  const refs = getRefs();
  delete refs[refName];
  setRefs(refs);
}

/** List all refs currently stored. */
export function listRefs(): RefMap {
  return getRefs();
}

/** List just branch names (without the `refs/heads/` prefix). */
export function listBranches(): string[] {
  const refs = getRefs();
  return Object.keys(refs)
    .filter((name) => name.startsWith(HEADS_PREFIX))
    .map((name) => name.slice(HEADS_PREFIX.length));
}

/**
 * Get HEAD's resolved commit hash. If HEAD is attached to a branch (the
 * common case), resolves through `currentBranch`. If detached, returns the
 * config's raw HEAD hash. Returns null if there is no commit yet.
 */
export function getHEAD(): string | null {
  const config = getConfig();
  if (config.currentBranch) {
    return getRef(branchRefName(config.currentBranch));
  }
  return config.HEAD;
}

/**
 * Set HEAD to a commit hash. If currently attached to a branch, updates
 * that branch's ref (normal commit behavior). If detached, updates the
 * raw HEAD hash in config.
 */
export function setHEAD(hash: string | null): void {
  const config = getConfig();
  if (config.currentBranch) {
    if (hash !== null) {
      setRef(branchRefName(config.currentBranch), hash);
    }
  } else {
    config.HEAD = hash;
    setConfig(config);
  }
}

/** Get the name of the currently checked-out branch, or null if detached. */
export function getCurrentBranch(): string | null {
  return getConfig().currentBranch;
}

/** Switch the current branch pointer (does not touch the working tree). */
export function setCurrentBranch(branch: string | null): void {
  const config = getConfig();
  config.currentBranch = branch;
  setConfig(config);
}

/**
 * Initialize a fresh repository: sets up `gitlite:config` with
 * repoInitialized=true, currentBranch='main', HEAD=null. Does not
 * clobber existing refs/objects, but does reset config state.
 */
export function initRepo(): void {
  const config: RepoConfig = {
    repoInitialized: true,
    currentBranch: 'main',
    HEAD: null,
  };
  setConfig(config);
}
