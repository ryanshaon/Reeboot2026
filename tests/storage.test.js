import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../src/lib/store.js';
import { makeAccessCode, hashAccessCode, verifyAccessCode } from '../src/lib/access-code.js';

test('access codes are independent and verify only against their own scrypt hashes', async () => {
  const first = makeAccessCode();
  const second = makeAccessCode();
  assert.notEqual(first, second);
  const hash = await hashAccessCode(first);
  assert.ok(hash.startsWith('scrypt$'));
  assert.equal(hash.includes(first), false);
  assert.equal(await verifyAccessCode(first, hash), true);
  assert.equal(await verifyAccessCode(second, hash), false);
});

test('store serializes concurrent transactions and persists their result', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'enigma-store-'));
  try {
    const store = createStore(join(directory, 'event.json'));
    await Promise.all(Array.from({ length: 10 }, () => store.update(async (state) => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      state.attempts.push({ id: String(state.attempts.length) });
    })));
    assert.equal((await store.read()).attempts.length, 10);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
