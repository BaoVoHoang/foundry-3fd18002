// Staging area (index) management helpers.
//
// Builds a tree object graph from the flat staged-file index (a list of
// { path, sha1 } entries) by splitting paths on '/' and nesting entries
// into TreeObjects, writing blobs/trees to the content-addressed store.

import { writeObject, makeBlob, makeTree } from './objects';
import type { IndexEntry, TreeEntry } from '../types';

interface TrieNode {
  files: Map<string, string>; // filename -> sha1 (blob hash)
  dirs: Map<string, TrieNode>;
}

function newNode(): TrieNode {
  return { files: new Map(), dirs: new Map() };
}

/**
 * Build a (possibly nested) tree object from the staged index entries and
 * return the root tree's hash. Each index entry's `sha1` is treated as an
 * already-written blob hash (see useFileSystem.stageFile, which hashes
 * content but does not write the blob object -- so we (re)write the blob
 * here from workspace content when available, falling back to trusting
 * the given hash when no content is supplied).
 */
export function buildTreeFromIndex(
  index: IndexEntry[],
  fileContents: Record<string, string>
): string {
  const root = newNode();

  for (const entry of index) {
    const parts = entry.path.split('/').filter(Boolean);
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts[i];
      if (!node.dirs.has(dir)) {
        node.dirs.set(dir, newNode());
      }
      node = node.dirs.get(dir) as TrieNode;
    }
    const filename = parts[parts.length - 1];

    // Write (or re-write) the blob object from the current content so the
    // stored object matches what's staged, then use the resulting hash.
    const content = fileContents[entry.path] ?? '';
    const blobHash = writeObject(makeBlob(content));
    node.files.set(filename, blobHash);
  }

  function buildNode(node: TrieNode): string {
    const entries: TreeEntry[] = [];
    for (const [name, hash] of node.files.entries()) {
      entries.push({ path: name, sha1: hash, type: 'blob' });
    }
    for (const [name, child] of node.dirs.entries()) {
      const childHash = buildNode(child);
      entries.push({ path: name, sha1: childHash, type: 'tree' });
    }
    return writeObject(makeTree(entries));
  }

  return buildNode(root);
}

/**
 * Flatten a tree object (recursively) back into a map of
 * filePath -> blob content. Used by checkout to restore the workspace.
 */
export function flattenTree(
  treeHash: string,
  readObject: (hash: string) => any,
  prefix = ''
): Record<string, string> {
  const result: Record<string, string> = {};
  const obj = readObject(treeHash);
  if (!obj || obj.type !== 'tree' || !obj.tree) return result;

  for (const entry of obj.tree.entries) {
    const path = prefix ? `${prefix}/${entry.path}` : entry.path;
    if (entry.type === 'blob') {
      const blobObj = readObject(entry.sha1);
      result[path] = blobObj?.blob?.content ?? '';
    } else {
      Object.assign(result, flattenTree(entry.sha1, readObject, path));
    }
  }

  return result;
}
