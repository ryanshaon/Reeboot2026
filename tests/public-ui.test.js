import test from 'node:test';
import assert from 'node:assert/strict';
import * as publicData from '../src/components/public-data.js';

const { validateTeamDraft, gameAction, scoreForTeam } = publicData;

test('team draft requires a team and distinct college emails', () => {
  assert.match(validateTeamDraft({ teamName: 'A', members: [{ name: 'Ryan', email: 'ryan@school.edu' }] }), /Team name/);
  assert.match(validateTeamDraft({ teamName: 'Nova', members: [{ name: 'Ryan', email: 'ryan@school.edu' }, { name: 'Mira', email: 'RYAN@school.edu' }] }), /unique/);
  assert.equal(validateTeamDraft({ teamName: 'Nova', members: [{ name: 'Ryan', email: 'ryan@school.edu' }] }), null);
});

test('team draft leaves allowed domain policy to the server', () => {
  assert.equal(validateTeamDraft({ teamName: 'Nova', members: [{ name: 'Ryan', email: 'ryan@campus.example' }] }), null);
});

test('game action only activates a live game with a safe URL', () => {
  assert.equal(gameAction({ status: 'coming_soon', url: 'https://example.com' }).enabled, false);
  assert.equal(gameAction({ status: 'live', url: null }).enabled, false);
  assert.equal(gameAction({ status: 'live', url: 'javascript:alert(1)' }).enabled, false);
  assert.equal(gameAction({ status: 'live', url: 'https://example.com' }).enabled, true);
});

test('team scores use the flat leaderboard row', () => {
  assert.equal(scoreForTeam([{ teamId: 'one', total: 5 }], 'one').total, 5);
  assert.equal(scoreForTeam([], 'one').total, 0);
});

test('score code drafts normalize to six ASCII base36 characters', () => {
  assert.equal(publicData.normalizeScoreCode(' ab12z9 '), 'AB12Z9');
  assert.equal(publicData.validScoreCode(' ab12z9 '), true);
  for (const invalid of ['AB12Z', 'AB12Z99', 'AB-2Z9', 'ÅB12Z9', 'AB 2Z9', 'ıB12Z9', 'ſB12Z9']) {
    assert.equal(publicData.validScoreCode(invalid), false, invalid);
  }
  assert.equal(publicData.normalizeScoreCode('ıB12Z9'), 'ıB12Z9');
  assert.equal(publicData.normalizeScoreCode('ſB12Z9'), 'ſB12Z9');
});

test('score code paste normalization accepts padded valid input without accepting truncated prefixes', () => {
  assert.equal(publicData.draftFromScoreCodePaste(' ab12z9 '), 'AB12Z9');
  assert.equal(publicData.validScoreCode(publicData.draftFromScoreCodePaste(' ab12z9 ')), true);
  assert.equal(publicData.draftFromScoreCodePaste(' ab12z9x '), 'AB12Z9X');
  assert.equal(publicData.validScoreCode(publicData.draftFromScoreCodePaste(' ab12z9x ')), false);
  assert.equal(publicData.validScoreCode(publicData.draftFromScoreCodePaste(' ab-2z9 ')), false);
});

test('score code feedback distinguishes a new best, lower score, and duplicate', () => {
  assert.equal(publicData.scoreCodeFeedback({ improved: true, score: 70, teamBest: 70, recorded: true }), 'Verified. New team best: 70.');
  assert.equal(publicData.scoreCodeFeedback({ improved: false, score: 50, teamBest: 70, recorded: true }), 'Verified score 50. Team best stays 70.');
  assert.equal(publicData.scoreCodeFeedback({ improved: false, score: 50, teamBest: 70, recorded: false }), 'This score was already submitted. Team best: 70.');
});

test('retry-after notice accepts only a safe positive number of seconds', () => {
  assert.equal(publicData.retryAfterNotice('12'), 'Try again in 12 seconds.');
  assert.equal(publicData.retryAfterNotice(' 05 '), 'Try again in 5 seconds.');
  for (const invalid of [null, '', '0', '-2', '1.5', '12 seconds', 'Infinity', '9007199254740992']) {
    assert.equal(publicData.retryAfterNotice(invalid), '', String(invalid));
  }
});

test('score result updates only the signed-in team and recomputes its total', () => {
  const rows = [{ teamId: 'ours', aiml: 10, syscom: 20, gamedev: 30, webdev: 40, total: 100 }, { teamId: 'other', total: 9 }];
  const updated = publicData.applyScoreResult(rows, 'ours', { gameId: 'syscom', teamBest: 35 });
  assert.deepEqual(updated[0], { ...rows[0], syscom: 35, total: 115 });
  assert.strictEqual(updated[1], rows[1]);
  assert.deepEqual(rows[0], { teamId: 'ours', aiml: 10, syscom: 20, gamedev: 30, webdev: 40, total: 100 });
  assert.equal(publicData.applyScoreResult(updated, 'ours', { gameId: 'aiml', teamBest: 15 })[0].total, 120);
});

test('leaderboard error takes precedence over empty state', () => {
  assert.equal(publicData.leaderboardView({ loading: false, error: 'Offline', teams: [] }), 'error');
  assert.equal(publicData.leaderboardView({ loading: false, error: '', teams: [] }), 'empty');
});

test('enrollment attempt retains secrets for the same draft and rotates on a changed draft', () => {
  const firstDraft = { teamName: 'Nova', members: [{ name: 'Ryan', email: 'r@campus.edu' }, { name: 'Mira', email: 'm@campus.edu' }] };
  const first = publicData.attemptForDraft(null, firstDraft);
  assert.match(first.enrollmentKey, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(first.accessCodes.length, 2);
  assert.ok(first.accessCodes.every((code) => /^[A-Za-z0-9_-]{32}$/.test(code)));
  assert.notEqual(first.accessCodes[0], first.accessCodes[1]);
  assert.strictEqual(publicData.attemptForDraft(first, { ...firstDraft }), first);
  const changed = publicData.attemptForDraft(first, { ...firstDraft, teamName: 'Nova 2' });
  assert.notEqual(changed.enrollmentKey, first.enrollmentKey);
  assert.notDeepEqual(changed.accessCodes, first.accessCodes);
});

test('receipt navigation requires explicit acknowledgement', () => {
  assert.equal(publicData.receiptCanNavigate(false), false);
  assert.equal(publicData.receiptCanNavigate(true), true);
});

test('only the latest leaderboard request may update state', () => {
  assert.equal(publicData.isCurrentRequest(4, 3), false);
  assert.equal(publicData.isCurrentRequest(4, 4), true);
});
