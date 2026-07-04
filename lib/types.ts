// Core data model types for GitLite, matching the ADR schema exactly.

export type GitObjectType = 'blob' | 'tree' | 'commit';

export interface BlobObject {
  content: string;
}

export interface TreeEntry {
  path: string;
  sha1: string;
  type: 'blob' | 'tree';
}

export interface TreeObject {
  entries: TreeEntry[];
}

export interface CommitObject {
  message: string;
  treeHash: string;
  parentHashes: string[];
  author: string;
  timestamp: number;
}

export interface GitObject {
  type: GitObjectType;
  blob?: BlobObject;
  tree?: TreeObject;
  commit?: CommitObject;
}

export type FileStatus = 'untracked' | 'modified' | 'staged' | 'committed';

export interface WorkspaceFile {
  content: string;
  status: FileStatus;
}

export interface IndexEntry {
  path: string;
  sha1: string;
}

export interface RepoConfig {
  repoInitialized: boolean;
  currentBranch: string | null;
  HEAD: string | null;
}

// Convenience map-like aliases used across the app.
export type GitObjectMap = Record<string, GitObject>;
export type RefMap = Record<string, string>;
export type WorkspaceMap = Record<string, WorkspaceFile>;
