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

// The ADR's base schema lists 'untracked' | 'modified' | 'staged' | 'committed'.
// 'deleted' is added to represent a workspace file that has been removed but
// not yet committed, so its removal can flow through the same stage/unstage
// lifecycle as any other change (per acceptance criteria: "Deleting a file
// marks it as deleted and the deletion can be staged").
export type FileStatus =
  | 'untracked'
  | 'modified'
  | 'staged'
  | 'committed'
  | 'deleted';

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
