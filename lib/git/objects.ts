// Git object (blob/tree/commit) creation and retrieval helpers.

import { sha1 } from './sha1';
import { getObjects, setObjects } from '../storage';
import type {
  GitObject,
  BlobObject,
  TreeObject,
  TreeEntry,
  CommitObject,
} from '../types';

/**
 * Serialize a GitObject into a canonical, deterministic string that is fed
 * into the SHA-1 hash. Canonical JSON.stringify is sufficient here because
 * object fields are always constructed in the same order by the factory
 * helpers below.
 */
function serialize(obj: GitObject): string {
  return JSON.stringify(obj);
}

/**
 * Write a GitObject to the content-addressed store (`gitlite:objects`).
 * Returns the SHA-1 hash used as its key. Writing the same content twice
 * is idempotent (same hash, object simply overwritten with identical data).
 */
export function writeObject(obj: GitObject): string {
  const content = serialize(obj);
  const hash = sha1(content);
  const objects = getObjects();
  objects[hash] = obj;
  setObjects(objects);
  return hash;
}

/**
 * Read a GitObject back out of the store by hash. Throws if not found.
 */
export function readObject(hash: string): GitObject {
  const objects = getObjects();
  const obj = objects[hash];
  if (!obj) {
    throw new Error(`Object not found: ${hash}`);
  }
  return obj;
}

/** Check whether an object exists in the store without throwing. */
export function hasObject(hash: string): boolean {
  const objects = getObjects();
  return Object.prototype.hasOwnProperty.call(objects, hash);
}

// ---- Factory helpers -------------------------------------------------

export function makeBlob(content: string): GitObject {
  const blob: BlobObject = { content };
  return { type: 'blob', blob };
}

export function makeTree(entries: TreeEntry[]): GitObject {
  const tree: TreeObject = {
    entries: [...entries].sort((a, b) => a.path.localeCompare(b.path)),
  };
  return { type: 'tree', tree };
}

export function makeCommit(
  message: string,
  treeHash: string,
  parentHashes: string[],
  author: string,
  timestamp: number = Date.now()
): GitObject {
  const commit: CommitObject = {
    message,
    treeHash,
    parentHashes,
    author,
    timestamp,
  };
  return { type: 'commit', commit };
}
