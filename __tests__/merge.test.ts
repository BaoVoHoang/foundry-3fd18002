import { threeWayMerge, mergeBranches } from '../lib/git/merge';
import { makeBlob, makeTree, makeCommit } from '../lib/git/objects';
import type { GitObjectMap, RefMap } from '../lib/types';

let counter = 0;
function fakeHash(obj: unknown): string {
  counter += 1;
  return `hash-${counter}-${JSON.stringify(obj).length}`;
}

function commitWithFiles(
  objects: GitObjectMap,
  files: Record<string, string>,
  parentHashes: string[] = []
): string {
  const entries = Object.entries(files).map(([path, content]) => {
    const blob = makeBlob(content);
    const blobHash = fakeHash(blob);
    objects[blobHash] = blob;
    return { path, sha1: blobHash, type: 'blob' as const };
  });
  const tree = makeTree(entries);
  const treeHash = fakeHash(tree);
  objects[treeHash] = tree;

  const commit = makeCommit('msg', treeHash, parentHashes, 'tester', Date.now() + counter);
  const commitHash = fakeHash(commit);
  objects[commitHash] = commit;
  return commitHash;
}

describe('threeWayMerge', () => {
  it('scenario 1: no conflict - only one side changes', () => {
    const base = ['line1', 'line2', 'line3'];
    const ours = ['line1', 'line2', 'line3'];
    const theirs = ['line1', 'CHANGED', 'line3'];

    const { result, hasConflict } = threeWayMerge(base, ours, theirs);
    expect(hasConflict).toBe(false);
    expect(result).toEqual(['line1', 'CHANGED', 'line3']);
  });

  it('scenario 5: both edit non-overlapping lines - auto merges', () => {
    const base = ['line1', 'line2', 'line3', 'line4'];
    const ours = ['OURS1', 'line2', 'line3', 'line4'];
    const theirs = ['line1', 'line2', 'line3', 'THEIRS4'];

    const { result, hasConflict } = threeWayMerge(base, ours, theirs);
    expect(hasConflict).toBe(false);
    expect(result).toEqual(['OURS1', 'line2', 'line3', 'THEIRS4']);
  });

  it('scenario 6: both edit the same overlapping line - conflict markers', () => {
    const base = ['line1', 'line2', 'line3'];
    const ours = ['line1', 'OURS-CHANGE', 'line3'];
    const theirs = ['line1', 'THEIRS-CHANGE', 'line3'];

    const { result, hasConflict } = threeWayMerge(base, ours, theirs);
    expect(hasConflict).toBe(true);
    expect(result).toContain('<<<<<<< ours');
    expect(result).toContain('========');
    expect(result).toContain('>>>>>>> theirs');
    expect(result).toContain('OURS-CHANGE');
    expect(result).toContain('THEIRS-CHANGE');

    const startIdx = result.indexOf('<<<<<<< ours');
    const sepIdx = result.indexOf('========');
    const endIdx = result.indexOf('>>>>>>> theirs');
    expect(startIdx).toBeGreaterThanOrEqual(0);
    expect(sepIdx).toBeGreaterThan(startIdx);
    expect(endIdx).toBeGreaterThan(sepIdx);
  });

  it('identical edits on both sides do not create a conflict', () => {
    const base = ['a', 'b', 'c'];
    const ours = ['a', 'SAME', 'c'];
    const theirs = ['a', 'SAME', 'c'];
    const { result, hasConflict } = threeWayMerge(base, ours, theirs);
    expect(hasConflict).toBe(false);
    expect(result).toEqual(['a', 'SAME', 'c']);
  });
});

describe('mergeBranches', () => {
  it('scenario 1: no conflict - target adds unrelated file', () => {
    const objects: GitObjectMap = {};
    const base = commitWithFiles(objects, { 'shared.txt': 'hello' });
    const ours = commitWithFiles(objects, { 'shared.txt': 'hello' }, [base]);
    const theirs = commitWithFiles(
      objects,
      { 'shared.txt': 'hello', 'new.txt': 'added by theirs' },
      [base]
    );

    const refs: RefMap = {
      'refs/heads/main': ours,
      'refs/heads/feature': theirs,
    };

    const result = mergeBranches('main', 'feature', objects, refs);
    expect(result.success).toBe(true);
    expect(result.hasConflicts).toBe(false);
    expect(result.files['new.txt'].content).toBe('added by theirs');
    expect(result.files['shared.txt'].content).toBe('hello');
  });

  it('scenario 2: both add same file identically - no conflict', () => {
    const objects: GitObjectMap = {};
    const base = commitWithFiles(objects, { 'base.txt': 'x' });
    const ours = commitWithFiles(objects, { 'base.txt': 'x', 'same.txt': 'identical content' }, [base]);
    const theirs = commitWithFiles(objects, { 'base.txt': 'x', 'same.txt': 'identical content' }, [base]);

    const refs: RefMap = {
      'refs/heads/main': ours,
      'refs/heads/feature': theirs,
    };

    const result = mergeBranches('main', 'feature', objects, refs);
    expect(result.hasConflicts).toBe(false);
    expect(result.files['same.txt'].content).toBe('identical content');
    expect(result.files['same.txt'].hasConflict).toBe(false);
  });

  it('scenario 3: both delete same file - no conflict, file absent from result', () => {
    const objects: GitObjectMap = {};
    const base = commitWithFiles(objects, { 'keep.txt': 'k', 'doomed.txt': 'to be deleted' });
    const ours = commitWithFiles(objects, { 'keep.txt': 'k' }, [base]);
    const theirs = commitWithFiles(objects, { 'keep.txt': 'k' }, [base]);

    const refs: RefMap = {
      'refs/heads/main': ours,
      'refs/heads/feature': theirs,
    };

    const result = mergeBranches('main', 'feature', objects, refs);
    expect(result.hasConflicts).toBe(false);
    expect(result.files['doomed.txt']).toBeUndefined();
    expect(result.files['keep.txt'].content).toBe('k');
  });

  it('scenario 4: one side edits, other side deletes - conflict', () => {
    const objects: GitObjectMap = {};
    const base = commitWithFiles(objects, { 'contested.txt': 'original content' });
    const ours = commitWithFiles(objects, { 'contested.txt': 'edited by ours' }, [base]);
    const theirs = commitWithFiles(objects, {}, [base]); // theirs deletes the file

    const refs: RefMap = {
      'refs/heads/main': ours,
      'refs/heads/feature': theirs,
    };

    const result = mergeBranches('main', 'feature', objects, refs);
    expect(result.hasConflicts).toBe(true);
    expect(result.files['contested.txt'].hasConflict).toBe(true);
    expect(result.files['contested.txt'].content).toContain('edited by ours');
  });

  it('scenario 5: both edit non-overlapping lines of same file - auto-merge', () => {
    const objects: GitObjectMap = {};
    const baseContent = 'line1\nline2\nline3\nline4';
    const base = commitWithFiles(objects, { 'file.txt': baseContent });
    const ours = commitWithFiles(objects, { 'file.txt': 'OURS1\nline2\nline3\nline4' }, [base]);
    const theirs = commitWithFiles(objects, { 'file.txt': 'line1\nline2\nline3\nTHEIRS4' }, [base]);

    const refs: RefMap = {
      'refs/heads/main': ours,
      'refs/heads/feature': theirs,
    };

    const result = mergeBranches('main', 'feature', objects, refs);
    expect(result.hasConflicts).toBe(false);
    expect(result.files['file.txt'].content).toBe('OURS1\nline2\nline3\nTHEIRS4');
  });

  it('scenario 6: both edit overlapping lines - conflict markers in merged content', () => {
    const objects: GitObjectMap = {};
    const baseContent = 'line1\nline2\nline3';
    const base = commitWithFiles(objects, { 'file.txt': baseContent });
    const ours = commitWithFiles(objects, { 'file.txt': 'line1\nOURS-CHANGE\nline3' }, [base]);
    const theirs = commitWithFiles(objects, { 'file.txt': 'line1\nTHEIRS-CHANGE\nline3' }, [base]);

    const refs: RefMap = {
      'refs/heads/main': ours,
      'refs/heads/feature': theirs,
    };

    const result = mergeBranches('main', 'feature', objects, refs);
    expect(result.hasConflicts).toBe(true);
    const content = result.files['file.txt'].content;
    expect(content).toContain('<<<<<<< ours');
    expect(content).toContain('========');
    expect(content).toContain('>>>>>>> theirs');
    expect(content).toContain('OURS-CHANGE');
    expect(content).toContain('THEIRS-CHANGE');
  });
});
