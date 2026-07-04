import { writeObject, readObject, makeBlob, makeTree, makeCommit } from '../lib/git/objects';
import { getRef, setRef, listRefs, getHEAD, setHEAD, getCurrentBranch, initRepo } from '../lib/git/refs';
import { getCommitAncestors, findLCA, topologicalSort } from '../lib/git/dag';
import { getConfig, clearAll } from '../lib/storage';
import type { GitObjectMap } from '../lib/types';

// jsdom provides localStorage in the default next/jest-less environment;
// this project's jest.config uses testEnvironment 'node', so we polyfill a
// minimal in-memory localStorage for these tests.
beforeEach(() => {
  const store: Record<string, string> = {};
  (global as any).window = {
    localStorage: {
      getItem: (key: string) => (key in store ? store[key] : null),
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    },
  };
});

afterEach(() => {
  delete (global as any).window;
});

describe('objects', () => {
  it('round-trips a blob without data loss', () => {
    const blob = makeBlob('hello world');
    const hash = writeObject(blob);
    const read = readObject(hash);
    expect(read).toEqual(blob);
  });

  it('round-trips a tree without data loss', () => {
    const blobHash = writeObject(makeBlob('file contents'));
    const tree = makeTree([{ path: 'file.txt', sha1: blobHash, type: 'blob' }]);
    const hash = writeObject(tree);
    const read = readObject(hash);
    expect(read).toEqual(tree);
    expect(read.tree?.entries[0].sha1).toBe(blobHash);
  });

  it('round-trips a commit without data loss', () => {
    const blobHash = writeObject(makeBlob('content'));
    const treeHash = writeObject(makeTree([{ path: 'a.txt', sha1: blobHash, type: 'blob' }]));
    const commit = makeCommit('Initial commit', treeHash, [], 'tester', 1700000000000);
    const hash = writeObject(commit);
    const read = readObject(hash);
    expect(read).toEqual(commit);
  });

  it('produces the same hash for identical objects (content-addressed)', () => {
    const a = writeObject(makeBlob('same content'));
    const b = writeObject(makeBlob('same content'));
    expect(a).toBe(b);
  });
});

describe('refs', () => {
  it('initRepo populates gitlite:config correctly', () => {
    initRepo();
    const config = getConfig();
    expect(config.repoInitialized).toBe(true);
    expect(config.currentBranch).toBe('main');
    expect(config.HEAD).toBe(null);
  });

  it('sets and gets refs, resolving HEAD through currentBranch', () => {
    initRepo();
    expect(getCurrentBranch()).toBe('main');
    expect(getHEAD()).toBe(null);

    setRef('refs/heads/main', 'abc123');
    expect(getRef('refs/heads/main')).toBe('abc123');
    expect(getHEAD()).toBe('abc123');

    setHEAD('def456');
    expect(getHEAD()).toBe('def456');
    expect(getRef('refs/heads/main')).toBe('def456');
  });

  it('listRefs returns all stored refs', () => {
    initRepo();
    setRef('refs/heads/main', 'hash1');
    setRef('refs/heads/feature', 'hash2');
    const refs = listRefs();
    expect(refs['refs/heads/main']).toBe('hash1');
    expect(refs['refs/heads/feature']).toBe('hash2');
  });
});

describe('dag', () => {
  // Helper to build a fake commit object map from a parent adjacency list.
  function buildCommits(parents: Record<string, string[]>): GitObjectMap {
    const objects: GitObjectMap = {};
    let t = 0;
    for (const [hash, parentHashes] of Object.entries(parents)) {
      objects[hash] = {
        type: 'commit',
        commit: {
          message: hash,
          treeHash: 'tree-' + hash,
          parentHashes,
          author: 'tester',
          timestamp: t++,
        },
      };
    }
    return objects;
  }

  it('getCommitAncestors returns all reachable ancestors including self', () => {
    // A -> B -> C (C is child of B, B is child of A)
    const objects = buildCommits({
      C: ['B'],
      B: ['A'],
      A: [],
    });
    const ancestors = getCommitAncestors('C', objects);
    expect(ancestors).toEqual(new Set(['C', 'B', 'A']));
  });

  it('findLCA works on a simple linear chain', () => {
    // A -> B -> C, A -> B -> D  (both C and D descend from B)
    const objects = buildCommits({
      D: ['B'],
      C: ['B'],
      B: ['A'],
      A: [],
    });
    expect(findLCA('C', 'D', objects)).toBe('B');
  });

  it('findLCA works on a diamond merge topology', () => {
    //        A
    //       / \
    //      B   C
    //       \ /
    //        M (merge commit, parents B and C)
    const objects = buildCommits({
      M: ['B', 'C'],
      B: ['A'],
      C: ['A'],
      A: [],
    });
    expect(findLCA('B', 'C', objects)).toBe('A');
    expect(findLCA('M', 'A', objects)).toBe('A');
  });

  it('findLCA works on an asymmetric-depth topology', () => {
    // A -> B -> C -> D (long branch)
    // A -> E (short branch)
    const objects = buildCommits({
      D: ['C'],
      C: ['B'],
      B: ['A'],
      E: ['A'],
      A: [],
    });
    expect(findLCA('D', 'E', objects)).toBe('A');
  });

  it('findLCA returns the same hash when comparing a commit to itself', () => {
    const objects = buildCommits({ A: [] });
    expect(findLCA('A', 'A', objects)).toBe('A');
  });

  it('findLCA returns null when commits share no common ancestor', () => {
    const objects = buildCommits({ A: [], B: [] });
    expect(findLCA('A', 'B', objects)).toBe(null);
  });

  it('topologicalSort orders parents before children', () => {
    const objects = buildCommits({
      D: ['C'],
      C: ['B'],
      B: ['A'],
      A: [],
    });
    const sorted = topologicalSort(['A', 'B', 'C', 'D'], objects);
    expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('B'));
    expect(sorted.indexOf('B')).toBeLessThan(sorted.indexOf('C'));
    expect(sorted.indexOf('C')).toBeLessThan(sorted.indexOf('D'));
  });

  it('topologicalSort handles a merge commit with two parents', () => {
    const objects = buildCommits({
      M: ['B', 'C'],
      B: ['A'],
      C: ['A'],
      A: [],
    });
    const sorted = topologicalSort(['A', 'B', 'C', 'M'], objects);
    expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('B'));
    expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('C'));
    expect(sorted.indexOf('B')).toBeLessThan(sorted.indexOf('M'));
    expect(sorted.indexOf('C')).toBeLessThan(sorted.indexOf('M'));
  });
});
