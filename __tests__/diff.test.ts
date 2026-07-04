import { myersDiff, diffCommits, DiffHunk } from '../lib/git/diff';
import { makeBlob, makeTree, makeCommit } from '../lib/git/objects';
import type { GitObjectMap } from '../lib/types';

function applyForward(a: string[], hunks: DiffHunk[]): string[] {
  // Reconstruct `b` from the hunks (all lines except '-').
  return hunks.filter((h) => h.type !== '-').map((h) => h.line);
}

function applyBackward(hunks: DiffHunk[]): string[] {
  // Reconstruct `a` from the hunks (all lines except '+').
  return hunks.filter((h) => h.type !== '+').map((h) => h.line);
}

describe('myersDiff', () => {
  it('handles pure insertion', () => {
    const a = ['x', 'y'];
    const b = ['x', 'a', 'b', 'y'];
    const hunks = myersDiff(a, b);
    expect(applyForward(a, hunks)).toEqual(b);
    expect(applyBackward(hunks)).toEqual(a);
    expect(hunks.filter((h) => h.type === '+').map((h) => h.line)).toEqual(['a', 'b']);
  });

  it('handles pure deletion', () => {
    const a = ['x', 'a', 'b', 'y'];
    const b = ['x', 'y'];
    const hunks = myersDiff(a, b);
    expect(applyForward(a, hunks)).toEqual(b);
    expect(applyBackward(hunks)).toEqual(a);
    expect(hunks.filter((h) => h.type === '-').map((h) => h.line)).toEqual(['a', 'b']);
  });

  it('handles a single-line modification (delete+insert)', () => {
    const a = ['line1', 'line2', 'line3'];
    const b = ['line1', 'changed', 'line3'];
    const hunks = myersDiff(a, b);
    expect(applyForward(a, hunks)).toEqual(b);
    expect(applyBackward(hunks)).toEqual(a);
    expect(hunks.some((h) => h.type === '-' && h.line === 'line2')).toBe(true);
    expect(hunks.some((h) => h.type === '+' && h.line === 'changed')).toBe(true);
  });

  it('returns all context lines for identical files (no-op)', () => {
    const a = ['same', 'lines', 'here'];
    const b = ['same', 'lines', 'here'];
    const hunks = myersDiff(a, b);
    expect(hunks.every((h) => h.type === ' ')).toBe(true);
    expect(hunks.map((h) => h.line)).toEqual(a);
  });

  it('handles empty a -> content b (all insertions)', () => {
    const a: string[] = [];
    const b = ['new1', 'new2'];
    const hunks = myersDiff(a, b);
    expect(hunks).toEqual([
      { type: '+', line: 'new1' },
      { type: '+', line: 'new2' },
    ]);
  });

  it('handles content a -> empty b (all deletions)', () => {
    const a = ['old1', 'old2'];
    const b: string[] = [];
    const hunks = myersDiff(a, b);
    expect(hunks).toEqual([
      { type: '-', line: 'old1' },
      { type: '-', line: 'old2' },
    ]);
  });

  it('handles both empty (no-op, no hunks)', () => {
    const hunks = myersDiff([], []);
    expect(hunks).toEqual([]);
  });

  it('handles multi-hunk edits with several separate changes', () => {
    const a = ['a', 'b', 'c', 'd', 'e', 'f'];
    const b = ['a', 'X', 'c', 'd', 'Y', 'Z', 'f'];
    const hunks = myersDiff(a, b);
    expect(applyForward(a, hunks)).toEqual(b);
    expect(applyBackward(hunks)).toEqual(a);
    // Should contain context lines a, c, d, f
    const context = hunks.filter((h) => h.type === ' ').map((h) => h.line);
    expect(context).toEqual(['a', 'c', 'd', 'f']);
  });

  it('produces a shortest edit script (classic example)', () => {
    // Classic Myers paper example: A B C A B B A, C B A B A C
    const a = ['A', 'B', 'C', 'A', 'B', 'B', 'A'];
    const b = ['C', 'B', 'A', 'B', 'A', 'C'];
    const hunks = myersDiff(a, b);
    expect(applyForward(a, hunks)).toEqual(b);
    expect(applyBackward(hunks)).toEqual(a);
    const edits = hunks.filter((h) => h.type !== ' ').length;
    // The minimal edit distance for this classic example is 5.
    expect(edits).toBe(5);
  });

  it('handles complete rewrite (nothing in common)', () => {
    const a = ['one', 'two', 'three'];
    const b = ['four', 'five'];
    const hunks = myersDiff(a, b);
    expect(applyForward(a, hunks)).toEqual(b);
    expect(applyBackward(hunks)).toEqual(a);
    expect(hunks.every((h) => h.type !== ' ')).toBe(true);
  });

  it('handles single line files that differ', () => {
    const hunks = myersDiff(['foo'], ['bar']);
    expect(applyForward(['foo'], hunks)).toEqual(['bar']);
    expect(hunks).toEqual([
      { type: '-', line: 'foo' },
      { type: '+', line: 'bar' },
    ]);
  });

  it('handles insertion at the start', () => {
    const a = ['b', 'c'];
    const b = ['a', 'b', 'c'];
    const hunks = myersDiff(a, b);
    expect(hunks[0]).toEqual({ type: '+', line: 'a' });
    expect(applyForward(a, hunks)).toEqual(b);
  });

  it('handles deletion at the end', () => {
    const a = ['a', 'b', 'c'];
    const b = ['a', 'b'];
    const hunks = myersDiff(a, b);
    expect(hunks[hunks.length - 1]).toEqual({ type: '-', line: 'c' });
    expect(applyForward(a, hunks)).toEqual(b);
  });
});

describe('diffCommits', () => {
  function buildCommitWithFiles(
    objects: GitObjectMap,
    files: Record<string, string>,
    parentHashes: string[] = []
  ): { hash: string; objects: GitObjectMap } {
    const entries = Object.entries(files).map(([path, content]) => {
      const blob = makeBlob(content);
      const blobHash = fakeHash(blob);
      objects[blobHash] = blob;
      return { path, sha1: blobHash, type: 'blob' as const };
    });
    const tree = makeTree(entries);
    const treeHash = fakeHash(tree);
    objects[treeHash] = tree;

    const commit = makeCommit('msg', treeHash, parentHashes, 'tester', 0);
    const commitHash = fakeHash(commit);
    objects[commitHash] = commit;

    return { hash: commitHash, objects };
  }

  let counter = 0;
  function fakeHash(obj: unknown): string {
    counter += 1;
    return `hash-${counter}-${JSON.stringify(obj).length}`;
  }

  it('diffs files added, removed, and modified between two commits', () => {
    const objects: GitObjectMap = {};

    const commitA = buildCommitWithFiles(objects, {
      'a.txt': 'line1\nline2',
      'removed.txt': 'gone soon',
    }).hash;

    const commitB = buildCommitWithFiles(objects, {
      'a.txt': 'line1\nchanged',
      'added.txt': 'brand new',
    }).hash;

    const diffs = diffCommits(commitA, commitB, objects);
    const paths = diffs.map((d) => d.path).sort();
    expect(paths).toEqual(['a.txt', 'added.txt', 'removed.txt']);

    const aDiff = diffs.find((d) => d.path === 'a.txt')!;
    expect(aDiff.hunks.some((h) => h.type === '-' && h.line === 'line2')).toBe(true);
    expect(aDiff.hunks.some((h) => h.type === '+' && h.line === 'changed')).toBe(true);

    const addedDiff = diffs.find((d) => d.path === 'added.txt')!;
    expect(addedDiff.hunks.every((h) => h.type === '+')).toBe(true);

    const removedDiff = diffs.find((d) => d.path === 'removed.txt')!;
    expect(removedDiff.hunks.every((h) => h.type === '-')).toBe(true);
  });

  it('returns no diffs for identical commits', () => {
    const objects: GitObjectMap = {};
    const commitA = buildCommitWithFiles(objects, { 'a.txt': 'same content' }).hash;
    const diffs = diffCommits(commitA, commitA, objects);
    expect(diffs).toEqual([]);
  });
});
