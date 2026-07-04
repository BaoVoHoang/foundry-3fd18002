// SHA-1 hashing utilities for content-addressed storage.
//
// Implemented as a hand-written, synchronous, dependency-light SHA-1
// (the classic FIPS 180-1 algorithm operating on UTF-8 bytes). This keeps
// hashing synchronous (required by writeObject/readObject call sites) while
// remaining deterministic: identical string content always yields an
// identical 40-character lowercase hex digest.

function utf8ToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function leftRotate(x: number, c: number): number {
  return ((x << c) | (x >>> (32 - c))) >>> 0;
}

/**
 * Compute the SHA-1 digest of a string and return it as a 40-character
 * lowercase hex string. Deterministic: identical inputs always produce
 * identical output.
 */
export function sha1(content: string): string {
  const bytes = utf8ToBytes(content);
  const bitLength = bytes.length * 8;

  // Pre-processing: padding the message.
  // Total padded length must be a multiple of 64 bytes, and must have
  // room for: original bytes + 0x80 byte + 8 bytes for the length.
  const withOneAndLength = bytes.length + 1 + 8;
  const paddedLength = Math.ceil(withOneAndLength / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  // Append original length in bits as a 64-bit big-endian integer.
  // JS numbers are safe up to 2^53, more than enough for this app's inputs.
  const dv = new DataView(padded.buffer);
  const highBits = Math.floor(bitLength / 0x100000000);
  const lowBits = bitLength >>> 0;
  dv.setUint32(paddedLength - 8, highBits, false);
  dv.setUint32(paddedLength - 4, lowBits, false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const w = new Array<number>(80);

  for (let chunkStart = 0; chunkStart < paddedLength; chunkStart += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = dv.getUint32(chunkStart + i * 4, false);
    }
    for (let i = 16; i < 80; i++) {
      w[i] = leftRotate(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }

      const temp = (leftRotate(a, 5) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = leftRotate(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  return [h0, h1, h2, h3, h4]
    .map((h) => h.toString(16).padStart(8, '0'))
    .join('');
}
