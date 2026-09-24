export const GAME_META = [
  { id: 'aiml', name: 'AI / ML', description: 'Think beyond the prompt. Build intelligence with purpose.', index: '01' },
  { id: 'syscom', name: 'SYS / COM', description: 'Decode systems. Make every signal count.', index: '02' },
  { id: 'gamedev', name: 'GAME DEV', description: 'Turn a mechanic into a world worth playing.', index: '03' },
  { id: 'webdev', name: 'WEB DEV', description: 'Design for the browser. Build for impact.', index: '04' },
];

export function validateTeamDraft(input) {
  if (!input.teamName?.trim() || input.teamName.trim().length < 2 || input.teamName.trim().length > 80) return 'Team name must be 2-80 characters.';
  if (!Array.isArray(input.members) || input.members.length < 1 || input.members.length > 4) return 'A team needs 1-4 members.';
  const seen = new Set();
  for (const member of input.members) {
    if (!member.name?.trim() || member.name.trim().length < 2 || member.name.trim().length > 80) return 'Every member needs a name of 2-80 characters.';
    const email = member.email?.trim().toLowerCase() || '';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Every member needs a valid college email.';
    if (seen.has(email)) return 'Member emails must be unique.';
    seen.add(email);
  }
  return null;
}

export function gameAction(game) {
  if (game?.status === 'closed') return { enabled: false, label: 'Closed' };
  if (game?.status !== 'live' || !game?.url) return { enabled: false, label: 'Coming soon' };
  try {
    const url = new URL(game.url);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return { enabled: false, label: 'Coming soon' };
    return { enabled: true, label: 'Launch game', url: url.href };
  } catch { return { enabled: false, label: 'Coming soon' }; }
}

export function scoreForTeam(leaderboard, teamId) {
  return leaderboard.find((team) => team.teamId === teamId) || { aiml: 0, syscom: 0, gamedev: 0, webdev: 0, total: 0 };
}

export function normalizeScoreCode(draft) {
  return String(draft ?? '').trim().replace(/[a-z]/g, (letter) => String.fromCharCode(letter.charCodeAt(0) - 32));
}

export function draftFromScoreCodePaste(text) { return normalizeScoreCode(text); }

export function retryAfterNotice(header) {
  const value = typeof header === 'string' ? header.trim() : '';
  if (!/^\d+$/.test(value)) return '';
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) && seconds > 0 ? `Try again in ${seconds} seconds.` : '';
}

export function validScoreCode(draft) { return /^[0-9A-Z]{6}$/.test(normalizeScoreCode(draft)); }

export function scoreCodeFeedback(result) {
  if (!result.recorded) return `This score was already submitted. Team best: ${result.teamBest}.`;
  if (result.improved) return `Verified. New team best: ${result.teamBest}.`;
  return `Verified score ${result.score}. Team best stays ${result.teamBest}.`;
}

export function applyScoreResult(leaderboard, teamId, result) {
  if (!GAME_META.some((game) => game.id === result.gameId)) return leaderboard;
  const update = (row) => {
    const next = { ...row, [result.gameId]: Math.max(Number(row[result.gameId]) || 0, result.teamBest) };
    next.total = GAME_META.reduce((sum, game) => sum + (Number(next[game.id]) || 0), 0);
    return next;
  };
  if (!leaderboard.some((team) => team.teamId === teamId)) return [...leaderboard, update({ teamId })];
  return leaderboard.map((team) => team.teamId === teamId ? update(team) : team);
}

export function leaderboardView({ loading, error, teams }) {
  if (loading) return 'loading';
  if (error) return 'error';
  return teams.length === 0 ? 'empty' : 'ranked';
}

function randomBase64url(cryptoSource, byteLength) {
  const bytes = cryptoSource.getRandomValues(new Uint8Array(byteLength));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function attemptForDraft(previous, draft, cryptoSource = globalThis.crypto) {
  const fingerprint = JSON.stringify(draft);
  if (previous?.fingerprint === fingerprint) return previous;
  return {
    fingerprint,
    enrollmentKey: randomBase64url(cryptoSource, 32),
    accessCodes: draft.members.map(() => randomBase64url(cryptoSource, 24)),
  };
}

export function receiptCanNavigate(savedCodes) { return savedCodes === true; }

export function isCurrentRequest(activeId, requestId) { return activeId === requestId; }
