import test from 'node:test';
import assert from 'node:assert/strict';
import { filterTeams, scoreDraftError, gameDraftError, summarizeTeams, attemptRows, mergeGameDraftState, editGameDraftState, saveGameDraftState } from '../src/components/admin-data.js';

const teams = [
  { id: 'a', name: 'Circuit Breakers', members: [{ name: 'Anika', email: 'anika@college.edu' }], scores: { total: 20 } },
  { id: 'b', name: 'Night Shift', members: [{ name: 'Dev', email: 'dev@college.edu' }], scores: { total: 40 } },
];

test('team search matches team, member, and email without case sensitivity', () => {
  assert.deepEqual(filterTeams(teams, 'CIRCUIT').map((team) => team.id), ['a']);
  assert.deepEqual(filterTeams(teams, 'dev@COLLEGE').map((team) => team.id), ['b']);
  assert.deepEqual(filterTeams(teams, '  anika ').map((team) => team.id), ['a']);
});

test('score draft accepts zero and the upper bound, rejects invalid values', () => {
  assert.equal(scoreDraftError({ memberId: 'a', gameId: 'aiml', score: '0' }), null);
  assert.equal(scoreDraftError({ memberId: 'a', gameId: 'webdev', score: '1000000' }), null);
  assert.match(scoreDraftError({ memberId: 'a', gameId: 'aiml', score: '' }), /score/i);
  assert.match(scoreDraftError({ memberId: 'a', gameId: 'aiml', score: '   ' }), /score/i);
  assert.match(scoreDraftError({ memberId: 'a', gameId: 'aiml', score: '-1' }), /score/i);
  assert.match(scoreDraftError({ memberId: 'a', gameId: 'aiml', score: '1000001' }), /score/i);
  assert.match(scoreDraftError({ memberId: 'a', gameId: 'aiml', score: 'Infinity' }), /score/i);
  assert.match(scoreDraftError({ memberId: '', gameId: 'aiml', score: '2' }), /member/i);
  assert.match(scoreDraftError({ memberId: 'a', gameId: 'cybersec', score: '2' }), /game/i);
});

test('game draft accepts empty URL as null and HTTP URLs only', () => {
  assert.deepEqual(gameDraftError({ status: 'live', url: '  ' }), { error: null, url: null });
  assert.deepEqual(gameDraftError({ status: 'closed', url: 'https://games.example/x' }), { error: null, url: 'https://games.example/x' });
  assert.match(gameDraftError({ status: 'live', url: 'javascript:alert(1)' }).error, /URL/i);
  assert.match(gameDraftError({ status: 'unknown', url: '' }).error, /status/i);
});

test('overview summary uses real team and member totals', () => {
  assert.deepEqual(summarizeTeams(teams), { teamCount: 2, memberCount: 2, scoredTeams: 2 });
  assert.deepEqual(summarizeTeams([]), { teamCount: 0, memberCount: 0, scoredTeams: 0 });
});

test('attempt rows resolve member and game labels from the selected team', () => {
  const team = {
    members: [{ id: 'm1', name: 'Anika' }],
    attempts: [{ id: 'a1', memberId: 'm1', gameId: 'aiml', score: 25, createdAt: '2026-01-03T00:00:00.000Z' }],
  };
  assert.deepEqual(attemptRows(team), [{ id: 'a1', memberName: 'Anika', gameName: 'AI / ML', score: 25, createdAt: '2026-01-03T00:00:00.000Z' }]);
  assert.deepEqual(attemptRows({ members: [], attempts: [] }), []);
});

test('game refresh preserves dirty drafts while updating clean ones', () => {
  const base = mergeGameDraftState({ drafts: {}, dirtyIds: [], feedback: {} }, [
    { id: 'aiml', status: 'coming_soon', url: null },
    { id: 'webdev', status: 'coming_soon', url: null },
  ]);
  const edited = editGameDraftState(base, 'aiml', { status: 'live', url: 'https://draft.example/game' });
  const refreshed = mergeGameDraftState(edited, [
    { id: 'aiml', status: 'closed', url: 'https://server.example/game' },
    { id: 'webdev', status: 'live', url: 'https://server.example/web' },
  ]);
  assert.deepEqual(refreshed.drafts.aiml, { status: 'live', url: 'https://draft.example/game' });
  assert.deepEqual(refreshed.drafts.webdev, { status: 'live', url: 'https://server.example/web' });
  assert.deepEqual(refreshed.dirtyIds, ['aiml']);
});

test('in-flight game save keeps later edits dirty and reports the saved snapshot', () => {
  const before = editGameDraftState({ drafts: { aiml: { status: 'live', url: 'https://first.example' } }, dirtyIds: [], feedback: {} }, 'aiml', { status: 'live', url: 'https://first.example' });
  const submitted = { ...before.drafts.aiml };
  const changed = editGameDraftState(before, 'aiml', { url: 'https://second.example' });
  const saved = saveGameDraftState(changed, 'aiml', submitted, { id: 'aiml', status: 'live', url: 'https://first.example' });
  assert.equal(saved.drafts.aiml.url, 'https://second.example');
  assert.deepEqual(saved.dirtyIds, ['aiml']);
  assert.match(saved.feedback.aiml.success, /previous values saved; current edits unsaved/i);
  const clean = saveGameDraftState(before, 'aiml', submitted, { id: 'aiml', status: 'live', url: 'https://first.example' });
  assert.deepEqual(clean.dirtyIds, []);
  assert.match(clean.feedback.aiml.success, /settings saved/i);
});
