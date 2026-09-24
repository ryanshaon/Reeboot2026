import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../src/lib/store.js';
import { createEventService } from '../src/lib/event-service.js';
import { makeAccessCode } from '../src/lib/access-code.js';
import { randomBytes, createHash } from 'node:crypto';
import { encodeScore } from './score-code-fixtures.js';

test('redeemed attempts are individual while team and member bests use the maximum', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'enigma-event-'));
  try {
    const store = createStore(join(directory, 'event.json'));
    const service = createEventService(store);
    const enrolled = await service.enroll({ teamName: 'Alpha', members: [{ name: 'Alice', email: 'alice@college.edu' }, { name: 'Bob', email: 'bob@college.edu' }] });
    const [alice, bob] = enrolled.members;
    await service.updateGame('aiml', { status: 'live' });
    assert.deepEqual(await service.redeemScoreCode(alice.id, { gameId: 'aiml', code: encodeScore(100) }), { gameId: 'aiml', score: 100, improved: true, previousBest: 0, teamBest: 100, memberBest: 100, recorded: true });
    assert.deepEqual(await service.redeemScoreCode(bob.id, { gameId: 'aiml', code: encodeScore(100) }), { gameId: 'aiml', score: 100, improved: false, previousBest: 100, teamBest: 100, memberBest: 100, recorded: true });
    assert.deepEqual(await service.redeemScoreCode(bob.id, { gameId: 'aiml', code: encodeScore(80) }), { gameId: 'aiml', score: 80, improved: false, previousBest: 100, teamBest: 100, memberBest: 100, recorded: true });
    assert.deepEqual(await service.redeemScoreCode(bob.id, { gameId: 'aiml', code: encodeScore(125) }), { gameId: 'aiml', score: 125, improved: true, previousBest: 100, teamBest: 125, memberBest: 125, recorded: true });
    const attempts = (await store.read()).attempts;
    assert.deepEqual(attempts.map(({ memberId, score }) => [memberId, score]), [[alice.id, 100], [bob.id, 100], [bob.id, 80], [bob.id, 125]]);
    assert.equal((await service.leaderboard())[0].aiml, 125);
    assert.equal((await service.adminTeams())[0].attempts.length, 4);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('identical score redemption is idempotent sequentially and concurrently in the JSON store', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'enigma-event-'));
  try {
    const store = createStore(join(directory, 'event.json'));
    const service = createEventService(store);
    const enrolled = await service.enroll({ teamName: 'Alpha', members: [{ name: 'Alice', email: 'alice@college.edu' }] });
    const memberId = enrolled.members[0].id;
    await service.updateGame('aiml', { status: 'live' });
    const input = { gameId: 'aiml', code: encodeScore(40) };
    const first = await service.redeemScoreCode(memberId, input);
    const replay = await service.redeemScoreCode(memberId, input);
    assert.equal(first.recorded, true);
    assert.deepEqual(replay, { gameId: 'aiml', score: 40, improved: false, previousBest: 40, teamBest: 40, memberBest: 40, recorded: false });
    const simultaneous = await Promise.all(Array.from({ length: 8 }, () => service.redeemScoreCode(memberId, { gameId: 'aiml', code: encodeScore(41) })));
    assert.equal(simultaneous.filter((result) => result.recorded).length, 1);
    assert.equal(simultaneous.filter((result) => result.improved).length, 1);
    assert.deepEqual((await store.read()).attempts.map((attempt) => attempt.score), [40, 41]);
    assert.equal((await service.redeemScoreCode(memberId, { gameId: 'aiml', code: encodeScore(39) })).recorded, true);
    assert.deepEqual((await store.read()).attempts.map((attempt) => attempt.score), [40, 41, 39]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('redemption computes maxima for a large attempt history without argument spreading', async () => {
  const memberId = 'member-1';
  const state = {
    members: [{ id: memberId, teamId: 'team-1' }],
    games: [{ id: 'aiml', status: 'live' }],
    attempts: Array.from({ length: 150_000 }, (_, index) => ({ id: `old-${index}`, memberId, gameId: 'aiml', score: 1 })),
  };
  const service = createEventService({ update: (callback) => callback(state) });
  const result = await service.redeemScoreCode(memberId, { gameId: 'aiml', code: encodeScore(2) });
  assert.deepEqual(result, { gameId: 'aiml', score: 2, improved: true, previousBest: 1, teamBest: 2, memberBest: 2, recorded: true });
  assert.equal(state.attempts.length, 150_001);
});

test('redemption requires a known member and live selected game', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'enigma-event-'));
  try {
    const store = createStore(join(directory, 'event.json'));
    const service = createEventService(store);
    const enrolled = await service.enroll({ teamName: 'Alpha', members: [{ name: 'Alice', email: 'alice@college.edu' }] });
    const memberId = enrolled.members[0].id;
    const input = { gameId: 'aiml', code: encodeScore(42) };
    await assert.rejects(service.redeemScoreCode(memberId, input), /live/i);
    await service.updateGame('aiml', { status: 'live' });
    await assert.rejects(service.redeemScoreCode(memberId, { ...input, gameId: 'bogus' }), /game/i);
    await assert.rejects(service.redeemScoreCode('missing', input), /member/i);
    await service.updateGame('aiml', { status: 'closed' });
    await assert.rejects(service.redeemScoreCode(memberId, input), /live/i);
    assert.equal((await store.read()).attempts.length, 0);
    const adminAttempt = await service.addScore({ memberId, gameId: 'aiml', score: 7 });
    assert.equal(adminAttempt.score, 7);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('invalid redeemed codes append no attempt', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'enigma-event-'));
  try {
    const store = createStore(join(directory, 'event.json'));
    const service = createEventService(store);
    const enrolled = await service.enroll({ teamName: 'Alpha', members: [{ name: 'Alice', email: 'alice@college.edu' }] });
    await service.updateGame('aiml', { status: 'live' });
    await assert.rejects(service.redeemScoreCode(enrolled.members[0].id, { gameId: 'aiml', code: 'ABCDEF' }), { status: 400 });
    assert.equal((await store.read()).attempts.length, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('enrollment stores only code hashes and rejects an email already enrolled', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'enigma-event-'));
  try {
    const store = createStore(join(directory, 'event.json'));
    const service = createEventService(store);
    const enrolled = await service.enroll({ teamName: 'Alpha', members: [{ name: 'Alice', email: 'ALICE@college.edu' }, { name: 'Bob', email: 'bob@college.edu' }] });
    assert.equal(enrolled.members.length, 2);
    assert.notEqual(enrolled.members[0].accessCode, enrolled.members[1].accessCode);
    const state = await store.read();
    assert.equal(state.members[0].email, 'alice@college.edu');
    assert.equal(state.members[0].accessCodeHash.includes(enrolled.members[0].accessCode), false);
    await assert.rejects(service.enroll({ teamName: 'Other', members: [{ name: 'Someone', email: 'alice@college.edu' }] }), /already enrolled/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('leaderboard exposes team scores without member emails or access codes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'enigma-event-'));
  try {
    const store = createStore(join(directory, 'event.json'));
    const service = createEventService(store);
    const team = await service.enroll({ teamName: 'Alpha', members: [{ name: 'Alice', email: 'alice@college.edu' }] });
    await service.addScore({ memberId: team.members[0].id, gameId: 'aiml', score: 19 });
    const board = await service.leaderboard();
    assert.equal(board[0].total, 19);
    assert.equal(JSON.stringify(board).includes('alice@college.edu'), false);
    assert.equal(JSON.stringify(board).includes('accessCode'), false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('admin team history scopes attempts and projects only audit fields newest first', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'enigma-event-'));
  try {
    const store = createStore(join(directory, 'event.json'));
    const service = createEventService(store);
    const alpha = await service.enroll({ teamName: 'Alpha', members: [{ name: 'Alice', email: 'alice@college.edu' }] });
    const beta = await service.enroll({ teamName: 'Beta', members: [{ name: 'Bob', email: 'bob@college.edu' }] });
    const earlier = await service.addScore({ memberId: alpha.members[0].id, gameId: 'aiml', score: 10 });
    const other = await service.addScore({ memberId: beta.members[0].id, gameId: 'webdev', score: 40 });
    const later = await service.addScore({ memberId: alpha.members[0].id, gameId: 'aiml', score: 20 });
    await store.update((state) => {
      state.attempts.find((attempt) => attempt.id === earlier.id).createdAt = '2026-01-01T00:00:00.000Z';
      state.attempts.find((attempt) => attempt.id === later.id).createdAt = '2026-01-03T00:00:00.000Z';
      state.attempts.find((attempt) => attempt.id === other.id).createdAt = '2026-01-02T00:00:00.000Z';
      state.attempts[0].privateNote = 'never expose this';
    });
    const teams = await service.adminTeams();
    const alphaView = teams.find((team) => team.id === alpha.team.id);
    const betaView = teams.find((team) => team.id === beta.team.id);
    assert.deepEqual(alphaView.attempts.map((attempt) => attempt.id), [later.id, earlier.id]);
    assert.deepEqual(betaView.attempts.map((attempt) => attempt.id), [other.id]);
    assert.deepEqual(Object.keys(alphaView.attempts[0]).sort(), ['createdAt', 'gameId', 'id', 'memberId', 'score']);
    assert.equal(JSON.stringify(teams).includes('privateNote'), false);
    assert.equal(JSON.stringify(teams).includes('accessCodeHash'), false);
    assert.equal(JSON.stringify(teams).includes('enrollmentKeyHash'), false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('game patch can change status without replacing the URL', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'enigma-event-'));
  try {
    const service = createEventService(createStore(join(directory, 'event.json')));
    await service.updateGame('aiml', { status: 'live', url: 'https://example.edu/game' });
    const game = await service.updateGame('aiml', { status: 'closed' });
    assert.deepEqual(game, { id: 'aiml', url: 'https://example.edu/game', status: 'closed' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('game update rejects malformed and non-HTTP launch URLs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'enigma-event-'));
  try {
    const service = createEventService(createStore(join(directory, 'event.json')));
    await assert.rejects(service.updateGame('aiml', { url: 'https://' }), /invalid/i);
    await assert.rejects(service.updateGame('aiml', { url: 'javascript:alert(1)' }), /invalid/i);
    await assert.rejects(service.updateGame('aiml', { url: 'ftp://example.edu/game' }), /invalid/i);
    assert.equal((await service.updateGame('aiml', { url: 'https://example.edu/game' })).url, 'https://example.edu/game');
    assert.equal((await service.updateGame('aiml', { url: null })).url, null);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('resetting a member code increments its session version', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'enigma-event-'));
  try {
    const service = createEventService(createStore(join(directory, 'event.json')));
    const enrolled = await service.enroll({ teamName: 'Alpha', members: [{ name: 'Alice', email: 'alice@college.edu' }] });
    const memberId = enrolled.members[0].id;
    assert.equal((await service.memberById(memberId)).sessionVersion, 1);
    await service.resetCode(memberId);
    assert.equal((await service.memberById(memberId)).sessionVersion, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('same enrollment key, identities, and codes replay one team after concurrent requests', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'enigma-event-'));
  try {
    const store = createStore(join(directory, 'event.json'));
    const service = createEventService(store);
    const input = { enrollmentKey: randomBytes(32).toString('base64url'), teamName: 'Alpha', members: [
      { name: 'Alice', email: 'ALICE@college.edu', accessCode: makeAccessCode() },
      { name: 'Bob', email: 'bob@college.edu', accessCode: makeAccessCode() },
    ] };
    const [first, replay] = await Promise.all([service.enroll(input), service.enroll(input)]);
    assert.deepEqual(replay, first);
    assert.equal((await store.read()).teams.length, 1);
    assert.equal((await store.read()).members.length, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('reusing an enrollment key with changed identity or code returns conflict', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'enigma-event-'));
  try {
    const service = createEventService(createStore(join(directory, 'event.json')));
    const input = { enrollmentKey: randomBytes(32).toString('base64url'), teamName: 'Alpha', members: [{ name: 'Alice', email: 'alice@college.edu', accessCode: makeAccessCode() }] };
    await service.enroll(input);
    await assert.rejects(service.enroll({ ...input, teamName: 'Changed' }), /Enrollment key conflicts/);
    await assert.rejects(service.enroll({ ...input, members: [{ ...input.members[0], accessCode: makeAccessCode() }] }), /Enrollment key conflicts/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('idempotent enrollment stores no raw key or codes and admin view hides key hash', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'enigma-event-'));
  try {
    const store = createStore(join(directory, 'event.json'));
    const service = createEventService(store);
    const input = { enrollmentKey: randomBytes(32).toString('base64url'), teamName: 'Alpha', members: [{ name: 'Alice', email: 'alice@college.edu', accessCode: makeAccessCode() }] };
    await service.enroll(input);
    const state = await store.read();
    const serialized = JSON.stringify(state);
    assert.equal(state.teams[0].enrollmentKeyHash, createHash('sha256').update(input.enrollmentKey).digest('hex'));
    assert.equal(serialized.includes(input.enrollmentKey), false);
    assert.equal(serialized.includes(input.members[0].accessCode), false);
    assert.equal(JSON.stringify(await service.adminTeams()).includes('enrollmentKeyHash'), false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('legacy enrollment still generates codes without an idempotency key', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'enigma-event-'));
  try {
    const store = createStore(join(directory, 'event.json'));
    const enrolled = await createEventService(store).enroll({ teamName: 'Alpha', members: [{ name: 'Alice', email: 'alice@college.edu' }] });
    assert.ok(enrolled.members[0].accessCode.length >= 32);
    assert.equal((await store.read()).teams[0].enrollmentKeyHash, undefined);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
