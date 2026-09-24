import test from 'node:test';
import assert from 'node:assert/strict';
import { storageBackend, createConfiguredStore } from '../src/lib/configured-store.js';
import { diffState, rowToState } from '../src/lib/postgres-state.js';
import { errorResponse } from '../src/lib/error-response.js';
import { applyDiff } from '../src/lib/postgres-store.js';
import { createClientCache } from '../src/lib/postgres-client.js';

test('storage selection requires a database on deployments', async () => {
  assert.equal(storageBackend({ DATABASE_URL: 'postgres://example', VERCEL: '1' }), 'postgres');
  assert.equal(storageBackend({ VERCEL: '1' }), 'unavailable');
  assert.equal(storageBackend({ NODE_ENV: 'production' }), 'unavailable');
  assert.equal(storageBackend({ NODE_ENV: 'production', DEPLOYMENT_ENV: 'production' }), 'unavailable');
  assert.equal(storageBackend({ NODE_ENV: 'production', ALLOW_JSON_STORAGE: 'true' }), 'json');
  assert.equal(storageBackend({ NODE_ENV: 'test' }), 'json');
  await assert.rejects(createConfiguredStore({ VERCEL: '1' }).read(), (error) => error.status === 503);
  await assert.rejects(createConfiguredStore({ NODE_ENV: 'production' }).read(), (error) => error.status === 503);
});

test('state row mapping preserves optional hashes, timestamps, and numeric scores', () => {
  const state = rowToState({
    teams: [{ id: 't', name: 'Team', captain_id: 'm', enrollment_key_hash: null, created_at: new Date('2026-01-01T00:00:00Z') }],
    members: [{ id: 'm', team_id: 't', name: 'Member', email: 'a@example.edu', access_code_hash: 'hash', session_version: 2, is_captain: true, created_at: new Date('2026-01-01T00:00:00Z') }],
    games: [{ id: 'aiml', url: null, status: 'live' }],
    attempts: [{ id: 'a', member_id: 'm', game_id: 'aiml', score: '1.5', created_at: new Date('2026-01-02T00:00:00Z') }],
  });
  assert.equal(state.teams[0].enrollmentKeyHash, undefined);
  assert.equal(state.members[0].teamId, 't');
  assert.equal(state.attempts[0].score, 1.5);
  assert.equal(state.attempts[0].createdAt, '2026-01-02T00:00:00.000Z');
});

test('diff finds only changed rows and rejects duplicate IDs', () => {
  const before = { teams: [{ id: '1', name: 'Old' }], members: [], games: [], attempts: [] };
  const after = { teams: [{ id: '1', name: 'New' }, { id: '2', name: 'Added' }], members: [], games: [], attempts: [] };
  assert.deepEqual(diffState(before, after).teams, { upsert: after.teams, remove: [] });
  assert.throws(() => diffState(before, { ...after, teams: [...after.teams, after.teams[0]] }), /Duplicate/);
});

test('diff persists member position when members are reordered without field edits', () => {
  const captain = { id: 'a', teamId: 'team', name: 'A' };
  const second = { id: 'b', teamId: 'team', name: 'B' };
  const before = { teams: [], members: [captain, second], games: [], attempts: [] };
  const after = { ...before, members: [second, captain] };
  assert.deepEqual(diffState(before, after).members.upsert, [second, captain]);
});

test('database writes remove dependents before inserting replacement unique values', async () => {
  const statements = [];
  const tx = (parts, ...values) => {
    if (Array.isArray(parts) && Object.hasOwn(parts, 'raw')) {
      statements.push(parts.join('?'));
      return Promise.resolve();
    }
    return { rows: parts, columns: values };
  };
  const state = { teams: [{ id: 'new', name: 'New', captainId: 'new-member', enrollmentKeyHash: 'key', createdAt: '2026-01-01T00:00:00Z' }], members: [{ id: 'new-member', teamId: 'new', name: 'New', email: 'same@example.edu', accessCodeHash: 'hash', isCaptain: true, createdAt: '2026-01-01T00:00:00Z' }], games: [], attempts: [] };
  const diff = { teams: { remove: ['old'], upsert: state.teams }, members: { remove: ['old-member'], upsert: state.members }, games: { remove: [], upsert: [] }, attempts: { remove: ['old-attempt'], upsert: [] } };
  await applyDiff(tx, diff, state);
  assert.deepEqual(statements.map((sql) => sql.trim().split(' ')[0]), ['DELETE', 'DELETE', 'DELETE', 'INSERT', 'UPDATE', 'INSERT']);
});

test('captain transfer clears the old captain before member upserts', async () => {
  const statements = [];
  const tx = (parts, ...values) => {
    if (Array.isArray(parts) && Object.hasOwn(parts, 'raw')) {
      statements.push(parts.join('?'));
      return Promise.resolve();
    }
    return { rows: parts, columns: values };
  };
  const oldCaptain = { id: 'old', teamId: 'team', name: 'Old', email: 'old@example.edu', accessCodeHash: 'hash', isCaptain: false, createdAt: '2026-01-01T00:00:00Z' };
  const newCaptain = { id: 'new', teamId: 'team', name: 'New', email: 'new@example.edu', accessCodeHash: 'hash', isCaptain: true, createdAt: '2026-01-01T00:00:00Z' };
  const state = { teams: [], members: [newCaptain, oldCaptain], games: [], attempts: [] };
  const diff = { teams: { remove: [], upsert: [] }, members: { remove: [], upsert: [newCaptain, oldCaptain] }, games: { remove: [], upsert: [] }, attempts: { remove: [], upsert: [] } };
  await applyDiff(tx, diff, state);
  assert.deepEqual(statements.map((sql) => sql.trim().split(' ')[0]), ['UPDATE', 'INSERT']);
  assert.match(statements[0], /SET is_captain = false/);
});

test('client initialization is shared, rejects a different URL, and retries failure', async () => {
  let calls = 0;
  let rejectFirst;
  const client = createClientCache((url) => {
    calls += 1;
    if (calls === 1) return new Promise((resolve, reject) => { rejectFirst = reject; });
    return Promise.resolve({ url });
  });
  const first = client('postgres://one');
  const second = client('postgres://one');
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);
  await assert.rejects(client('postgres://two'), /different database/);
  rejectFirst(new Error('initial connection failed'));
  await assert.rejects(first, /initial connection failed/);
  await assert.rejects(second, /initial connection failed/);
  const recovered = await client('postgres://two');
  assert.deepEqual(recovered, { url: 'postgres://two' });
  assert.equal(calls, 2);
});

test('explicit storage outage stays 503 while unexpected errors stay private', () => {
  assert.equal(errorResponse(Object.assign(new Error('Database unavailable'), { status: 503 }), () => {}).status, 503);
  assert.deepEqual(errorResponse(new Error('secret detail'), () => {}).body, { error: 'Internal server error.' });
});
