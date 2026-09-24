import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLoginThrottle, loginKeys } from '../src/lib/login-throttle.js';
import { createConfiguredLoginThrottle, throttleBackend } from '../src/lib/configured-login-throttle.js';
import { createPostgresLoginThrottle, throttleKeyHash } from '../src/lib/postgres-login-throttle.js';

test('login throttle blocks a key after repeated failures and provides retry time', () => {
  const throttle = createLoginThrottle({ maxFailures: 3, windowMs: 60_000 });
  throttle.failure('ip|alice@college.edu', 1000);
  throttle.failure('ip|alice@college.edu', 1000);
  assert.equal(throttle.check('ip|alice@college.edu', 1000), 0);
  throttle.failure('ip|alice@college.edu', 1000);
  assert.equal(throttle.check('ip|alice@college.edu', 1000), 60);
  assert.equal(throttle.check('other-ip|alice@college.edu', 1000), 0);
  assert.equal(throttle.check('ip|alice@college.edu', 61_001), 0);
});

test('successful login clears prior failures for its key', () => {
  const throttle = createLoginThrottle({ maxFailures: 2, windowMs: 60_000 });
  throttle.failure('ip', 1000);
  throttle.success('ip');
  throttle.failure('ip', 1000);
  assert.equal(throttle.check('ip', 1000), 0);
});

test('spoofed forwarding headers cannot change login throttle keys', () => {
  const first = new Request('https://event.test/api/member/login', { headers: { 'x-forwarded-for': '1.1.1.1' } });
  const second = new Request('https://event.test/api/member/login', { headers: { 'x-forwarded-for': '2.2.2.2' } });
  assert.deepEqual(loginKeys(first, 'member', ' Alice@College.edu ', {}), loginKeys(second, 'member', 'alice@college.edu', {}));
  assert.deepEqual(loginKeys(first, 'admin', '', {}), loginKeys(second, 'admin', '', {}));
  assert.deepEqual(loginKeys(first, 'member', 'alice@college.edu', {}), ['member:local:alice@college.edu', 'member:global:local']);
  assert.deepEqual(loginKeys(first, 'admin', '', {}), ['admin-login:local']);
});

test('trusted Vercel client IPs isolate admin, global, and member login keys', () => {
  const first = new Request('https://event.test/api/member/login', { headers: { 'x-vercel-forwarded-for': '2001:db8::1' } });
  const second = new Request('https://event.test/api/member/login', { headers: { 'x-vercel-forwarded-for': '2001:db8::2' } });
  assert.notDeepEqual(loginKeys(first, 'admin', '', { VERCEL: '1' }), loginKeys(second, 'admin', '', { VERCEL: '1' }));
  assert.notDeepEqual(loginKeys(first, 'member', 'alice@example.edu', { VERCEL: '1' }), loginKeys(second, 'member', 'alice@example.edu', { VERCEL: '1' }));
  assert.deepEqual(loginKeys(first, 'member', ' Alice@Example.edu ', { VERCEL: '1' }), ['member:2001:db8::1:alice@example.edu', 'member:global:2001:db8::1']);
  const fallback = new Request('https://event.test/api/admin/login', { headers: { 'x-forwarded-for': '192.0.2.1, 10.0.0.1' } });
  assert.deepEqual(loginKeys(fallback, 'admin', '', { VERCEL: '1' }), ['admin-login:192.0.2.1']);
  const invalid = new Request('https://event.test/api/admin/login', { headers: { 'x-vercel-forwarded-for': 'not-an-ip' } });
  assert.deepEqual(loginKeys(invalid, 'admin', '', { VERCEL: '1' }), ['admin-login:unknown']);
});

test('non-Vercel production requires an explicitly configured trusted IP header', () => {
  const request = new Request('https://event.test/api/admin/login', { headers: { 'x-forwarded-for': '192.0.2.1' } });
  for (const env of [{ NODE_ENV: 'production' }, { RENDER: 'true' }, { FLY_APP_NAME: 'event' }, { RAILWAY_ENVIRONMENT: 'production' }, { DEPLOYMENT_ENV: 'production' }]) {
    assert.throws(() => loginKeys(request, 'admin', '', env), (error) => error.status === 503 && !error.message.includes('192.0.2.1'));
  }
});

test('configured non-Vercel proxy header isolates clients and ignores unrelated spoofed headers', () => {
  const env = { NODE_ENV: 'production', TRUSTED_CLIENT_IP_HEADER: 'x-real-ip' };
  const first = new Request('https://event.test/api/member/login', { headers: { 'x-real-ip': '192.0.2.1', 'x-forwarded-for': '198.51.100.8' } });
  const spoofed = new Request('https://event.test/api/member/login', { headers: { 'x-real-ip': '192.0.2.1', 'x-forwarded-for': '203.0.113.9' } });
  const second = new Request('https://event.test/api/member/login', { headers: { 'x-real-ip': '192.0.2.2', 'x-forwarded-for': '198.51.100.8' } });
  assert.deepEqual(loginKeys(first, 'member', 'alice@example.edu', env), loginKeys(spoofed, 'member', 'alice@example.edu', env));
  assert.notDeepEqual(loginKeys(first, 'member', 'alice@example.edu', env), loginKeys(second, 'member', 'alice@example.edu', env));
  assert.deepEqual(loginKeys(first, 'admin', '', env), ['admin-login:192.0.2.1']);
});

test('non-Vercel production rejects invalid trusted header names and IP values', () => {
  const request = new Request('https://event.test/api/admin/login', { headers: { 'x-real-ip': 'not-an-ip', 'x-forwarded-for': '192.0.2.1' } });
  assert.throws(() => loginKeys(request, 'admin', '', { NODE_ENV: 'production', TRUSTED_CLIENT_IP_HEADER: 'x-real-ip' }), (error) => error.status === 503);
  assert.throws(() => loginKeys(request, 'admin', '', { NODE_ENV: 'production', TRUSTED_CLIENT_IP_HEADER: 'x-real-ip\nfoo' }), (error) => error.status === 503);
  assert.throws(() => loginKeys(request, 'admin', '', { NODE_ENV: 'production', TRUSTED_CLIENT_IP_HEADER: 'x-missing-ip' }), (error) => error.status === 503);
});

test('atomic local attempt allows the limit, then blocks until the original window expires', () => {
  const throttle = createLoginThrottle({ maxFailures: 2, windowMs: 60_000 });
  assert.equal(throttle.attempt('key', 1000), 0);
  assert.equal(throttle.attempt('key', 2000), 0);
  assert.equal(throttle.attempt('key', 3000), 58);
  assert.equal(throttle.attempt('key', 61_000), 0);
});

test('throttle evicts expired records before enforcing its capacity', () => {
  const throttle = createLoginThrottle({ maxFailures: 1, windowMs: 1000, maxEntries: 2 });
  throttle.failure('expired', 0);
  throttle.failure('active', 500);
  throttle.failure('new', 1001);
  assert.equal(throttle.check('active', 1001), 1);
  assert.equal(throttle.check('new', 1001), 1);
});

test('throttle caps live records to prevent unbounded growth', () => {
  const throttle = createLoginThrottle({ maxFailures: 1, windowMs: 60_000, maxEntries: 2 });
  throttle.failure('oldest', 1000);
  throttle.failure('middle', 1001);
  throttle.failure('newest', 1002);
  assert.equal(throttle.check('oldest', 1002), 0);
  assert.equal(throttle.check('middle', 1002), 60);
  assert.equal(throttle.check('newest', 1002), 60);
});

test('configured throttle selects shared DB on deployments and preserves local synchronous calls', async () => {
  assert.equal(throttleBackend({ DATABASE_URL: 'postgres://example', VERCEL: '1' }), 'postgres');
  assert.equal(throttleBackend({ VERCEL: '1' }), 'unavailable');
  assert.equal(throttleBackend({ NODE_ENV: 'production' }), 'unavailable');
  assert.equal(throttleBackend({ NODE_ENV: 'production', ALLOW_JSON_STORAGE: 'true' }), 'memory');
  const local = createConfiguredLoginThrottle({ NODE_ENV: 'test' }, { maxFailures: 1 });
  assert.equal(local.failure('key', 1000), undefined);
  assert.equal(local.check('key', 1000), 900);
  const unavailable = createConfiguredLoginThrottle({ VERCEL: '1' });
  await assert.rejects(unavailable.check('key'), (error) => error.status === 503);
  await assert.rejects(unavailable.attempt('key'), (error) => error.status === 503);
  await assert.rejects(unavailable.failure('key'), (error) => error.status === 503);
  await assert.rejects(unavailable.success('key'), (error) => error.status === 503);
});

test('shared atomic attempt uses UPSERT RETURNING and blocks the first over-limit attempt', async () => {
  const calls = [];
  let count = 4;
  const sql = async (parts, ...values) => {
    const query = parts.join('?');
    calls.push({ query, values });
    if (query.includes('INSERT INTO reboot.login_throttle')) return [{ failure_count: ++count, expires_at: new Date(61_000) }];
    return [];
  };
  const throttle = createPostgresLoginThrottle({ url: 'postgres://example', secret: 'secret', maxFailures: 5, windowMs: 60_000, getClient: async () => sql });
  assert.equal(await throttle.attempt('member:192.0.2.1:alice@example.edu', 1000), 0);
  assert.equal(await throttle.attempt('member:192.0.2.1:alice@example.edu', 1500), 60);
  const write = calls.find(({ query }) => query.includes('INSERT INTO reboot.login_throttle'));
  assert.match(write.query, /ON CONFLICT \(key_hash\) DO UPDATE/);
  assert.match(write.query, /RETURNING failure_count, expires_at/);
  assert.ok(!write.values.some((value) => String(value).includes('192.0.2.1') || String(value).includes('alice@example.edu')));
  assert.equal(calls.filter(({ query }) => query.includes('ORDER BY expires_at LIMIT 100')).length, 2);
});

test('shared throttle hashes keys with a domain-separated HMAC', () => {
  const hash = throttleKeyHash('member:alice@example.edu', 'secret');
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(hash, throttleKeyHash('member:alice@example.edu', 'other-secret'));
  assert.notEqual(hash, throttleKeyHash('member:bob@example.edu', 'secret'));
  assert.notEqual(hash, 'member:alice@example.edu');
});

test('shared throttle writes only opaque keys and preserves the first active expiry in an atomic upsert', async () => {
  const calls = [];
  const sql = async (parts, ...values) => { calls.push({ query: parts.join('?'), values }); return []; };
  const throttle = createPostgresLoginThrottle({ url: 'postgres://example', secret: 'secret', maxFailures: 2, windowMs: 60_000, getClient: async () => sql });
  await throttle.failure('member:alice@example.edu', 1000);
  const write = calls.find(({ query }) => query.includes('INSERT INTO reboot.login_throttle'));
  assert.ok(write);
  assert.match(write.query, /ON CONFLICT \(key_hash\) DO UPDATE/);
  assert.match(write.query, /reboot\.login_throttle\.expires_at <=/);
  assert.ok(write.values.some((value) => value === throttleKeyHash('member:alice@example.edu', 'secret')));
  assert.ok(!write.values.some((value) => String(value).includes('alice@example.edu') || value === 'secret'));
  assert.ok(!write.query.includes('alice@example.edu'));
});

test('shared throttle checks remaining seconds and clears successes', async () => {
  const calls = [];
  const sql = async (parts, ...values) => {
    const query = parts.join('?');
    calls.push({ query, values });
    if (query.includes('SELECT failure_count')) return [{ failure_count: 2, expires_at: new Date(61_000) }];
    return [];
  };
  const throttle = createPostgresLoginThrottle({ url: 'postgres://example', secret: 'secret', maxFailures: 2, getClient: async () => sql });
  assert.equal(await throttle.check('member:alice@example.edu', 1500), 60);
  assert.equal(await throttle.check('member:alice@example.edu', 61_000), 0);
  await throttle.success('member:alice@example.edu');
  assert.ok(calls.some(({ query }) => query.includes('DELETE FROM reboot.login_throttle WHERE key_hash')));
});

test('shared throttle fails safely on missing production secret and sanitizes database failures', async () => {
  const missing = createConfiguredLoginThrottle({ DATABASE_URL: 'postgres://example', NODE_ENV: 'production' });
  await assert.rejects(missing.check('key'), (error) => error.status === 503 && !error.message.includes('postgres://'));
  const db = createPostgresLoginThrottle({ url: 'postgres://example', secret: 'secret', getClient: async () => {
    throw Object.assign(new Error('postgres://example private detail'), { code: '42P01' });
  } });
  await assert.rejects(db.check('key'), (error) => error.status === 503 && /npm run db:migrate/.test(error.message));
  const unsafe = createPostgresLoginThrottle({ url: 'postgres://example', secret: 'secret', getClient: async () => {
    throw Object.assign(new Error('postgres://example private detail'), { status: 503 });
  } });
  await assert.rejects(unsafe.attempt('key'), (error) => error.status === 503 && error.message === 'Database request failed.');
});

test('stale-row cleanup rechecks expiry before deleting a concurrently refreshed key', async () => {
  const queries = [];
  const sql = async (parts) => { const query = parts.join('?'); queries.push(query); return query.includes('INSERT INTO') ? [{ failure_count: 1, expires_at: new Date(61_000) }] : []; };
  await createPostgresLoginThrottle({ url: 'postgres://example', secret: 'secret', getClient: async () => sql }).attempt('key', 1000);
  const cleanup = queries.find((query) => query.includes('ORDER BY expires_at LIMIT 100'));
  assert.match(cleanup, /DELETE FROM reboot\.login_throttle WHERE expires_at <= \? AND key_hash IN/);
  assert.match(cleanup, /FOR UPDATE SKIP LOCKED/);
});

test('login routes await atomic attempts and clear both member keys on success', async () => {
  const admin = await readFile(new URL('../src/app/api/admin/login/route.js', import.meta.url), 'utf8');
  const member = await readFile(new URL('../src/app/api/member/login/route.js', import.meta.url), 'utf8');
  assert.match(admin, /await adminLoginThrottle\.attempt\(key\)/);
  assert.doesNotMatch(admin, /adminLoginThrottle\.(?:check|failure)\(/);
  assert.match(member, /await Promise\.all\(\[[\s\S]*memberLoginThrottle\.attempt\(emailKey\)[\s\S]*memberGlobalLoginThrottle\.attempt\(globalKey\)/);
  assert.match(member, /await Promise\.all\(\[[\s\S]*memberLoginThrottle\.success\(emailKey\)[\s\S]*memberGlobalLoginThrottle\.success\(globalKey\)/);
  assert.doesNotMatch(member, /(?:memberLoginThrottle|memberGlobalLoginThrottle)\.(?:check|failure)\(/);
});
