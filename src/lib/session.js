import { createHmac, timingSafeEqual } from 'node:crypto';

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const mac = (value, secret) => createHmac('sha256', secret).update(value).digest('base64url');

export function signSession(payload, secret, now = Math.floor(Date.now() / 1000), lifetime = 60 * 60 * 24 * 14) {
  if (!secret) throw new Error('Session secret is required.');
  const body = encode({ ...payload, exp: now + lifetime });
  return `${body}.${mac(body, secret)}`;
}

export function verifySession(token, secret, now = Math.floor(Date.now() / 1000)) {
  if (!token || !secret || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const expected = Buffer.from(mac(parts[0], secret));
  const supplied = Buffer.from(parts[1]);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const { exp, ...payload } = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (!Number.isFinite(exp) || exp <= now) return null;
    return payload;
  } catch { return null; }
}

export async function verifyMemberSession(token, secret, memberLookup, now = Math.floor(Date.now() / 1000)) {
  const session = verifySession(token, secret, now);
  if (session?.role !== 'member' || !session.memberId || !Number.isInteger(session.sessionVersion)) return null;
  const member = await memberLookup(session.memberId);
  return member && member.sessionVersion === session.sessionVersion ? session.memberId : null;
}

export function adminCredentialFingerprint(credentials, secret) {
  if (!credentials || !secret) return null;
  return createHmac('sha256', secret).update('admin-credentials:').update(JSON.stringify([credentials.username, credentials.password])).digest('base64url');
}

export function verifyAdminSession(token, secret, credentials, now = Math.floor(Date.now() / 1000)) {
  const session = verifySession(token, secret, now);
  const expected = adminCredentialFingerprint(credentials, secret);
  if (session?.role !== 'admin' || typeof session.credentialVersion !== 'string' || !expected) return null;
  const actualBytes = Buffer.from(session.credentialVersion);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes) ? session : null;
}

export function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET is required in production.');
  return 'local-development-only-change-me';
}
