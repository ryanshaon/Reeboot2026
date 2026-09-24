import assert from 'node:assert/strict';

const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const PRIME = 381001n;

// Test fixture generator only; the application never exposes an encoder.
export function encodeValue(value, key = 98765n) {
  let remainder = value;
  let code = '';
  for (let i = 0n; i < 6n; i += 1n) {
    const digit = remainder % 36n;
    remainder /= 36n;
    code += CHARSET[Number(((digit + key + i) % 36n + 36n) % 36n)];
  }
  assert.equal(remainder, 0n);
  return code;
}

export function encodeScore(score, key = 98765n) {
  return encodeValue(BigInt(score) * PRIME + key, key);
}
