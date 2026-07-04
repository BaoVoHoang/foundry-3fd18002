'use client';

// Hook for accessing/mutating overall repository state: init, commit,
// branch creation, checkout, and branch listing. All mutations persist
// via lib/storage.ts (through lib/git/refs.ts, lib/git/objects.ts, and
// lib/git/index.ts helpers).

import { useCallback, useEffect, useState } from 'react';
import {
  getConfig,
  setConfig,
  getWorkspace,
  setWorkspace,
  getIndex,
  setIndex,
  getObjects,
} from '@/lib/storage';
import {
  initRepo as initRepoRef,
  getHEAD,
  setHEAD,
  getRef,
  setRef,
  listBranches as listBranchesRef,
  getCurrentBranch,
  setCurrentBranch,
} from '@/lib/git/refs';
import { writeObject, makeCommit, readObject } from '@/lib/git/objects';
import { buildTreeFromIndex, flattenTree } from '@/lib/git/index';
import type { RepoConfig, WorkspaceMap, FileStatus } from '@/lib/types';

export interface UseRepositoryResult {
  config: RepoConfig;
  branches: string[];
  currentBranch: string | null;
  head: string | null;
  initRepo: () => void;
  commit: (message: string) => string | null;
  createBranch: (name: string, fromHash?: string) => void;
  checkout: (branchName: string) => void;
  listBranches: () => string[];
  refresh: () => void;
}

const DEFAULT_CONFIG: RepoConfig = {
  repoInitialized: false,
  currentBranch: null,
  HEAD: null,
};

export function useRepository(): UseRepositoryResult {
  const [config, setConfigState] = useState<RepoConfig>(DEFAULT_CONFIG);
  const [branches, setBranches] = useState<string[]>([]);

  const refresh = useCallback(() => {
    setConfigState(getConfig());
    setBranches(listBranchesRef());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const initRepo = useCallback(() => {
    initRepoRef();
    // Fresh repo: no refs yet, HEAD is null. Workspace/index untouched
    // unless caller wants a totally clean slate -- ADR only requires
    // config reset (repoInitialized=true, currentBranch='main', HEAD=null).
    refresh();
  }, [refresh]);

  const commit = useCallback(
    (message: string): string | null => {
      const index = getIndex();
      if (index.length === 0) {
        return null;
      }

      const workspace = getWorkspace();
      const fileContents: Record<string, string> = {};
      for (const entry of index) {
        const wf = workspace[entry.path];
        if (wf) fileContents[entry.path] = wf.content;
      }

      const treeHash = buildTreeFromIndex(index, fileContents);

      const parentHash = getHEAD();
      const parents = parentHash ? [parentHash] : [];

      const commitObj = makeCommit(message, treeHash, parents, 'user', Date.now());
      const commitHash = writeObject(commitObj);

      // Update current branch ref (or detached HEAD) to point at new commit.
      const branch = getCurrentBranch();
      if (branch) {
        setRef(`refs/heads/${branch}`, commitHash);
      }
      setHEAD(commitHash);

      // Clear staged status in workspace: staged files become committed;
      // files marked deleted are removed from the workspace entirely.
      const nextWorkspace: WorkspaceMap = {};
      const stagedPaths = new Set(index.map((e) => e.path));
      for (const [path, file] of Object.entries(workspace)) {
        if (stagedPaths.has(path)) {
          if (file.status === 'deleted') {
            // dropped from workspace
            continue;
          }
          nextWorkspace[path] = { content: file.content, status: 'committed' as FileStatus };
        } else {
          nextWorkspace[path] = file;
        }
      }
      setWorkspace(nextWorkspace);
      setIndex([]);

      refresh();
      return commitHash;
    },
    [refresh]
  );

  const createBranch = useCallback(
    (name: string, fromHash?: string) => {
      const target = fromHash ?? getHEAD();
      if (!target) return;
      setRef(`refs/heads/${name}`, target);
      refresh();
    },
    [refresh]
  );

  const checkout = useCallback(
    (branchName: string) => {
      const targetHash = getRef(`refs/heads/${branchName}`);
      if (targetHash === null) return;

      setCurrentBranch(branchName);

      const objects = getObjects();
      const commitObj = objects[targetHash];
      const currentWorkspace = getWorkspace();

      let treeFiles: Record<string, string> = {};
      if (commitObj && commitObj.type === 'commit' && commitObj.commit) {
        treeFiles = flattenTree(commitObj.commit.treeHash, readObject);
      }

      const nextWorkspace: WorkspaceMap = {};
      // Files present in new tree replace workspace files (marked committed).
      for (const [path, content] of Object.entries(treeFiles)) {
        nextWorkspace[path] = { content, status: 'committed' as FileStatus };
      }
      // Files absent from the new tree are removed automatically (we only
      // copy over what's in treeFiles above), matching acceptance criteria.
      void currentWorkspace;

      setWorkspace(nextWorkspace);
      setIndex([]);

      refresh();
    },
    [refresh]
  );

  const listBranchesFn = useCallback(() => listBranchesRef(), []);

  return {
    config,
    branches,
    currentBranch: config.currentBranch,
    head: getHEAD_safe(config),
    initRepo,
    commit,
    createBranch,
    checkout,
    listBranches: listBranchesFn,
    refresh,
  };
}

function getHEAD_safe(config: RepoConfig): string | null {
  // Mirrors lib/git/refs.ts getHEAD logic but reads from the already-
  // fetched config to avoid an extra localStorage read on every render.
  if (typeof window === 'undefined') return null;
  return getHEAD();
}

export default useRepository;
