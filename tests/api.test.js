import test from 'node:test';
import assert from 'node:assert/strict';
import { errorResponse } from '../src/lib/error-response.js';

test('unexpected server errors hide their details from clients', async () => {
  let loggedError;
  const response = errorResponse(new Error('private filesystem path and secret'), (_label, error) => { loggedError = error; });
  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { error: 'Internal server error.' });
  assert.equal(loggedError.message, 'private filesystem path and secret');
});

test('throttled errors carry Retry-After', async () => {
  const response = errorResponse(Object.assign(new Error('Too many login attempts.'), { status: 429, retryAfter: 30 }));
  assert.equal(response.status, 429);
  assert.equal(response.headers['Retry-After'], '30');
});
