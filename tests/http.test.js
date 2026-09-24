import test from 'node:test';
import assert from 'node:assert/strict';
import { sameOrigin, adminCredentials } from '../src/lib/http.js';

test('mutation origin check rejects cross-origin requests', () => {
  assert.equal(sameOrigin(new Request('https://event.test/api/enroll', { method: 'POST', headers: { origin: 'https://event.test' } })), true);
  assert.equal(sameOrigin(new Request('https://event.test/api/enroll', { method: 'POST', headers: { origin: 'https://evil.test' } })), false);
});

test('mutation origin check accepts the browser-facing host when the server URL is internal', () => {
  const proxied = new Request('http://localhost:3100/api/enroll', { method: 'POST', headers: { origin: 'http://127.0.0.1:3100', host: '127.0.0.1:3100' } });
  const crossed = new Request('http://localhost:3100/api/enroll', { method: 'POST', headers: { origin: 'http://evil.test', host: '127.0.0.1:3100' } });
  assert.equal(sameOrigin(proxied), true);
  assert.equal(sameOrigin(crossed), false);
});

test('production rejects requests with no origin metadata', () => {
  const request = new Request('https://event.test/api/enroll', { method: 'POST' });
  assert.equal(sameOrigin(request, { NODE_ENV: 'production' }), false);
  assert.equal(sameOrigin(request, { NODE_ENV: 'development' }), true);
});

test('production accepts only same-origin fetch metadata without Origin', () => {
  const same = new Request('https://event.test/api/enroll', { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' } });
  const related = new Request('https://event.test/api/enroll', { method: 'POST', headers: { 'sec-fetch-site': 'same-site' } });
  assert.equal(sameOrigin(same, { NODE_ENV: 'production' }), true);
  assert.equal(sameOrigin(related, { NODE_ENV: 'production' }), false);
});

test('admin fallback is unavailable in production', () => {
  assert.deepEqual(adminCredentials({ NODE_ENV: 'development' }), { username: 'admin', password: 'admin' });
  assert.equal(adminCredentials({ NODE_ENV: 'production' }), null);
  assert.equal(adminCredentials({ NODE_ENV: 'test' }), null);
  assert.equal(adminCredentials({}), null);
  assert.deepEqual(adminCredentials({ NODE_ENV: 'production', ADMIN_USERNAME: 'operator', ADMIN_PASSWORD: 'secret' }), { username: 'operator', password: 'secret' });
});
