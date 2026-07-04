import { sha1 } from '../lib/git/sha1';

describe('sha1', () => {
  it('computes deterministic SHA-1 hashes across multiple calls', () => {
    const content = 'hello world';
    const first = sha1(content);
    const second = sha1(content);
    expect(first).toBe(second);
  });

  it('returns a 40-character lowercase hex string', () => {
    const hash = sha1('some content');
    expect(hash).toMatch(/^[0-9a-f]{40}$/);
  });

  it('produces identical hashes for identical content', () => {
    const a = sha1('blob content: file.txt');
    const b = sha1('blob content: file.txt');
    expect(a).toBe(b);
  });

  it('produces different hashes for different content', () => {
    const a = sha1('content A');
    const b = sha1('content B');
    expect(a).not.toBe(b);
  });

  it('produces different hashes for empty vs non-empty content', () => {
    const empty = sha1('');
    const nonEmpty = sha1('a');
    expect(empty).not.toBe(nonEmpty);
  });

  it('matches known SHA-1 test vectors', () => {
    // SHA-1('abc') is a well-known FIPS 180-1 test vector.
    expect(sha1('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    // SHA-1('') is also well known.
    expect(sha1('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
  });

  it('is sensitive to whitespace and case differences', () => {
    expect(sha1('Hello')).not.toBe(sha1('hello'));
    expect(sha1('hello ')).not.toBe(sha1('hello'));
  });

  it('produces stable hashes for larger multi-line content (e.g. serialized objects)', () => {
    const content = JSON.stringify({
      type: 'commit',
      commit: {
        message: 'Initial commit',
        treeHash: 'deadbeef',
        parentHashes: [],
        author: 'tester',
        timestamp: 1700000000000,
      },
    });
    const a = sha1(content);
    const b = sha1(content);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{40}$/);
  });
});
