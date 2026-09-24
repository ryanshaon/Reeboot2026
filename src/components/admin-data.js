export const ADMIN_GAMES = [
  { id: 'aiml', name: 'AI / ML' },
  { id: 'syscom', name: 'SYS / COM' },
  { id: 'gamedev', name: 'GAME DEV' },
  { id: 'webdev', name: 'WEB DEV' },
];

export function filterTeams(teams, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return teams;
  return teams.filter((team) => [team.name, ...team.members.flatMap((member) => [member.name, member.email])].some((value) => value?.toLowerCase().includes(needle)));
}

export function scoreDraftError({ memberId, gameId, score }) {
  if (!memberId) return 'Select a member.';
  if (!ADMIN_GAMES.some((game) => game.id === gameId)) return 'Select a game.';
  if (typeof score !== 'string' || !score.trim() || !Number.isFinite(Number(score)) || Number(score) < 0 || Number(score) > 1_000_000) return 'Enter a score from 0 to 1,000,000.';
  return null;
}

export function gameDraftError({ status, url }) {
  if (!['coming_soon', 'live', 'closed'].includes(status)) return { error: 'Select a valid status.', url: null };
  const trimmed = typeof url === 'string' ? url.trim() : '';
  if (!trimmed) return { error: null, url: null };
  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
    return { error: null, url: trimmed };
  } catch { return { error: 'Enter a full HTTP or HTTPS URL.', url: null }; }
}

export function summarizeTeams(teams) {
  return {
    teamCount: teams.length,
    memberCount: teams.reduce((total, team) => total + team.members.length, 0),
    scoredTeams: teams.filter((team) => team.scores.total > 0).length,
  };
}

export function attemptRows(team) {
  const memberNames = new Map(team.members.map((member) => [member.id, member.name]));
  const gameNames = new Map(ADMIN_GAMES.map((game) => [game.id, game.name]));
  return (team.attempts || []).map(({ id, memberId, gameId, score, createdAt }) => ({
    id,
    memberName: memberNames.get(memberId) || 'Unknown member',
    gameName: gameNames.get(gameId) || gameId,
    score,
    createdAt,
  }));
}

const gameDraft = (game) => ({ status: game.status, url: game.url || '' });
const sameGameDraft = (left, right) => left?.status === right?.status && (left?.url || '') === (right?.url || '');

export function mergeGameDraftState(state, games) {
  const drafts = { ...state.drafts };
  const dirty = new Set(state.dirtyIds);
  for (const game of games) if (!dirty.has(game.id)) drafts[game.id] = gameDraft(game);
  return { ...state, drafts };
}

export function editGameDraftState(state, id, patch) {
  return {
    ...state,
    drafts: { ...state.drafts, [id]: { ...state.drafts[id], ...patch } },
    dirtyIds: [...new Set([...state.dirtyIds, id])],
    feedback: { ...state.feedback, [id]: null },
  };
}

export function saveGameDraftState(state, id, submitted, savedGame) {
  const changedDuringSave = !sameGameDraft(state.drafts[id], submitted);
  const dirty = new Set(state.dirtyIds);
  if (changedDuringSave) dirty.add(id);
  else dirty.delete(id);
  return {
    ...state,
    drafts: changedDuringSave ? state.drafts : { ...state.drafts, [id]: gameDraft(savedGame) },
    dirtyIds: [...dirty],
    feedback: { ...state.feedback, [id]: { success: changedDuringSave ? 'Previous values saved; current edits unsaved.' : 'Settings saved.' } },
  };
}
