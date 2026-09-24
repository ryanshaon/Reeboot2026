import { timingSafeEqual } from 'node:crypto';
import { adminCredentials } from '@/lib/http.js';
import { handle, json, body, requireOrigin, setSession, adminLoginThrottle, throttleError } from '@/lib/api.js';
import { loginKeys } from '@/lib/login-throttle.js';

function equal(a, b) {
  const left = Buffer.from(typeof a === 'string' ? a : '');
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const runtime = 'nodejs';
export const POST = handle(async (request) => {
  requireOrigin(request);
  const [key] = loginKeys(request, 'admin');
  const retryAfter = await adminLoginThrottle.attempt(key);
  if (retryAfter) throw throttleError(retryAfter);
  const credentials = adminCredentials();
  if (!credentials) return json({ error: 'Admin credentials are not configured.' }, 503);
  const input = await body(request);
  if (!equal(input?.username, credentials.username) || !equal(input?.password, credentials.password)) {
    return json({ error: 'Invalid credentials.' }, 401);
  }
  await adminLoginThrottle.success(key);
  return setSession(json({ authenticated: true }), 'admin');
});
