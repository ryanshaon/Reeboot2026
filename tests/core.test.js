import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEnrollment, normalizeEmail, validateScore } from '../src/lib/validation.js';
import { signSession, verifySession, verifyMemberSession, adminCredentialFingerprint, verifyAdminSession } from '../src/lib/session.js';
import { teamScores } from '../src/lib/scoring.js';

test('enrollment requires one to four members with distinct normalized college emails', () => {
  assert.equal(validateEnrollment({ teamName: 'Alpha', members: [] }).ok, false);
  assert.equal(validateEnrollment({ teamName: 'Alpha', members: Array(5).fill({ name: 'Alice', email: 'a@college.edu' }) }).ok, false);
  assert.equal(validateEnrollment({ teamName: 'Alpha', members: [{ name: 'Alice', email: ' A@college.edu ' }, { name: 'Bob', email: 'a@college.edu' }] }).ok, false);
  assert.equal(normalizeEmail(' A@College.EDU '), 'a@college.edu');
  assert.equal(validateEnrollment({ teamName: 'Alpha', members: [{ name: 'Alice', email: 'a@college.edu' }] }).ok, true);
});

test('enrollment enforces configured email domains', () => {
  assert.equal(validateEnrollment({ teamName: 'Alpha', members: [{ name: 'Alice', email: 'a@elsewhere.edu' }] }, ['college.edu']).ok, false);
  assert.equal(validateEnrollment({ teamName: 'Alpha', members: [{ name: 'Alice', email: 'a@college.edu' }] }, ['college.edu']).ok, true);
});

test('without an allowlist enrollment accepts academic domains and rejects consumer email', () => {
  const team = (email) => ({ teamName: 'Alpha', members: [{ name: 'Alice', email }] });
  assert.equal(validateEnrollment(team('alice@gmail.com')).ok, false);
  assert.equal(validateEnrollment(team('alice@college.edu')).ok, true);
  assert.equal(validateEnrollment(team('alice@college.ac.in')).ok, true);
  assert.equal(validateEnrollment(team('alice@college.ac')).ok, true);
  assert.equal(validateEnrollment(team('alice@college.edu.evil.com')).ok, false);
});

test('an explicit allowlist overrides the academic domain default', () => {
  const team = { teamName: 'Alpha', members: [{ name: 'Alice', email: 'alice@partner.org' }] };
  assert.equal(validateEnrollment(team, ['partner.org']).ok, true);
  assert.equal(validateEnrollment(team, ['college.edu']).ok, false);
});

test('idempotent enrollment requires a strong key and code for every member', () => {
  const member = { name: 'Alice', email: 'alice@college.edu', accessCode: 'a'.repeat(32) };
  assert.equal(validateEnrollment({ teamName: 'Alpha', enrollmentKey: 'a'.repeat(43), members: [member] }).ok, false);
  assert.equal(validateEnrollment({ teamName: 'Alpha', enrollmentKey: 'bad', members: [member] }).ok, false);
  assert.equal(validateEnrollment({ teamName: 'Alpha', enrollmentKey: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrs', members: [{ name: 'Alice', email: 'alice@college.edu' }] }).ok, false);
});

test('signed sessions reject tampering and expiry', () => {
  const token = signSession({ role: 'member', memberId: 'm1' }, 'secret', 1000, 60);
  assert.deepEqual(verifySession(token, 'secret', 1020), { role: 'member', memberId: 'm1' });
  assert.equal(verifySession(token + 'x', 'secret', 1020), null);
  assert.equal(verifySession(token, 'secret', 1061), null);
});

test('member session fails when its stored session version changes', async () => {
  const token = signSession({ role: 'member', memberId: 'm1', sessionVersion: 1 }, 'secret', 1000, 60);
  assert.equal(await verifyMemberSession(token, 'secret', async () => ({ id: 'm1', sessionVersion: 1 }), 1020), 'm1');
  assert.equal(await verifyMemberSession(token, 'secret', async () => ({ id: 'm1', sessionVersion: 2 }), 1020), null);
});

test('admin session fingerprint revokes on credential changes without exposing credentials', () => {
  const original = { username: 'operator', password: 'private-value' };
  const changed = { username: 'operator', password: 'new-private-value' };
  const secret = 'session-secret';
  const credentialVersion = adminCredentialFingerprint(original, secret);
  const token = signSession({ role: 'admin', credentialVersion }, secret, 1000, 60);
  assert.equal(token.includes(original.username), false);
  assert.equal(token.includes(original.password), false);
  assert.deepEqual(verifyAdminSession(token, secret, original, 1020), { role: 'admin', credentialVersion });
  assert.equal(verifyAdminSession(token, secret, changed, 1020), null);
  assert.equal(verifyAdminSession(token, secret, { username: 'new-operator', password: original.password }, 1020), null);
  assert.equal(verifyAdminSession(token, secret, null, 1020), null);
  assert.equal(verifyAdminSession(signSession({ role: 'admin' }, secret, 1000, 60), secret, original, 1020), null);
});

test('team score uses the best attempt across every member for each game', () => {
  const scores = teamScores(['a', 'b'], [
    { memberId: 'a', gameId: 'aiml', score: 10 },
    { memberId: 'a', gameId: 'aiml', score: 25 },
    { memberId: 'b', gameId: 'aiml', score: 40 },
    { memberId: 'b', gameId: 'webdev', score: 12 },
  ]);
  assert.deepEqual(scores, { aiml: 40, syscom: 0, gamedev: 0, webdev: 12, total: 52 });
});

test('scores must be finite nonnegative numbers', () => {
  assert.equal(validateScore({ memberId: 'a', gameId: 'aiml', score: 0 }).ok, true);
  assert.equal(validateScore({ memberId: 'a', gameId: 'aiml', score: -1 }).ok, false);
  assert.equal(validateScore({ memberId: 'a', gameId: 'aiml', score: '10' }).ok, false);
  assert.equal(validateScore({ memberId: 'a', gameId: 'aiml', score: 1_000_001 }).ok, false);
});

test('aggregation ignores out-of-range persisted attempts', () => {
  assert.deepEqual(teamScores(['a'], [{ memberId: 'a', gameId: 'aiml', score: Number.MAX_SAFE_INTEGER }]), { aiml: 0, syscom: 0, gamedev: 0, webdev: 0, total: 0 });
});
