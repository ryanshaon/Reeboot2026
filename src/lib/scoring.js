import { GAME_IDS } from './constants.js';

export function teamScores(memberIds, attempts) {
  const ids = new Set(memberIds);
  const scores = Object.fromEntries(GAME_IDS.map((id) => [id, 0]));
  for (const attempt of attempts) {
    if (ids.has(attempt.memberId) && GAME_IDS.includes(attempt.gameId) && Number.isFinite(attempt.score) && attempt.score >= 0 && attempt.score <= 1_000_000) {
      scores[attempt.gameId] = Math.max(scores[attempt.gameId], attempt.score);
    }
  }
  return { ...scores, total: GAME_IDS.reduce((total, id) => total + scores[id], 0) };
}
