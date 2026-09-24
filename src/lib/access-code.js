import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
export const makeAccessCode = () => randomBytes(24).toString('base64url');

export async function hashAccessCode(code) {
  const salt = randomBytes(16);
  const hash = await scrypt(code, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyAccessCode(code, stored) {
  if (typeof code !== 'string' || typeof stored !== 'string') return false;
  const [algorithm, saltEncoded, hashEncoded] = stored.split('$');
  if (algorithm !== 'scrypt' || !saltEncoded || !hashEncoded) return false;
  try {
    const expected = Buffer.from(hashEncoded, 'base64url');
    if (expected.length !== 64) return false;
    const actual = await scrypt(code, Buffer.from(saltEncoded, 'base64url'), 64);
    return timingSafeEqual(expected, actual);
  } catch { return false; }
}
