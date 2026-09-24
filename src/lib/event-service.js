import { randomUUID, createHash } from 'node:crypto';
import { normalizeEmail, validateEnrollment, validateScore } from './validation.js';
import { makeAccessCode, hashAccessCode, verifyAccessCode } from './access-code.js';
import { teamScores } from './scoring.js';
import { GAME_IDS } from './constants.js';
import { decodeScoreCode } from './score-code.js';

export function eventError(message, status = 400) { return Object.assign(new Error(message), { status }); }

export function createEventService(store) {
  return {
    async enroll(input, domains = []) {
      const validation = validateEnrollment(input, domains);
      if (!validation.ok) throw eventError(validation.error);
      const enrollmentKeyHash = input.enrollmentKey ? createHash('sha256').update(input.enrollmentKey).digest('hex') : null;
      return store.update(async (state) => {
        const existingTeam = enrollmentKeyHash && state.teams.find((team) => team.enrollmentKeyHash === enrollmentKeyHash);
        if (existingTeam) {
          const members = state.members.filter((member) => member.teamId === existingTeam.id);
          const sameIdentities = existingTeam.name === input.teamName.trim() && members.length === input.members.length && members.every((member, index) => member.name === input.members[index].name.trim() && member.email === normalizeEmail(input.members[index].email));
          const sameCodes = sameIdentities && (await Promise.all(members.map((member, index) => verifyAccessCode(input.members[index].accessCode, member.accessCodeHash)))).every(Boolean);
          if (!sameCodes) throw eventError('Enrollment key conflicts with an existing enrollment.', 409);
          return { team: { id: existingTeam.id, name: existingTeam.name }, members: members.map((member, index) => ({ id: member.id, name: member.name, email: member.email, sessionVersion: member.sessionVersion ?? 1, isCaptain: member.isCaptain, accessCode: input.members[index].accessCode })) };
        }
        const emails = new Set(state.members.map((member) => member.email));
        if (input.members.some((member) => emails.has(normalizeEmail(member.email)))) throw eventError('An email is already enrolled.', 409);
        const codes = await Promise.all(input.members.map(async (member) => {
          const accessCode = enrollmentKeyHash ? member.accessCode : makeAccessCode();
          return { accessCode, accessCodeHash: await hashAccessCode(accessCode) };
        }));
        const teamId = randomUUID();
        const now = new Date().toISOString();
        const members = input.members.map((member, index) => {
          const id = randomUUID();
          state.members.push({ id, teamId, name: member.name.trim(), email: normalizeEmail(member.email), accessCodeHash: codes[index].accessCodeHash, sessionVersion: 1, isCaptain: index === 0, createdAt: now });
          return { id, name: member.name.trim(), email: normalizeEmail(member.email), sessionVersion: 1, isCaptain: index === 0, accessCode: codes[index].accessCode };
        });
        state.teams.push({ id: teamId, name: input.teamName.trim(), captainId: members[0].id, ...(enrollmentKeyHash ? { enrollmentKeyHash } : {}), createdAt: now });
        return { team: { id: teamId, name: input.teamName.trim() }, members };
      });
    },
    async memberLogin(input) {
      const email = normalizeEmail(input?.email);
      if (!email || typeof input?.accessCode !== 'string') throw eventError('Email and access code are required.');
      const member = (await store.read()).members.find((item) => item.email === email);
      if (!member || !await verifyAccessCode(input.accessCode, member.accessCodeHash)) throw eventError('Invalid email or access code.', 401);
      return { id: member.id, teamId: member.teamId, name: member.name, email: member.email, sessionVersion: member.sessionVersion ?? 1, isCaptain: member.isCaptain };
    },
    async memberById(id) {
      const state = await store.read();
      const member = state.members.find((item) => item.id === id);
      if (!member) return null;
      const team = state.teams.find((item) => item.id === member.teamId);
      return { id: member.id, teamId: member.teamId, teamName: team?.name, name: member.name, email: member.email, sessionVersion: member.sessionVersion ?? 1, isCaptain: member.isCaptain };
    },
    async games() { return (await store.read()).games; },
    async leaderboard() {
      const state = await store.read();
      return state.teams.map((team) => {
        const ids = state.members.filter((member) => member.teamId === team.id).map((member) => member.id);
        return { teamId: team.id, teamName: team.name, ...teamScores(ids, state.attempts) };
      }).sort((a, b) => b.total - a.total || a.teamName.localeCompare(b.teamName));
    },
    async adminTeams() {
      const state = await store.read();
      return state.teams.map(({ enrollmentKeyHash, ...team }) => {
        const members = state.members.filter((member) => member.teamId === team.id);
        const memberIds = new Set(members.map((member) => member.id));
        return {
          ...team,
          members: members.map(({ accessCodeHash, ...member }) => member),
          scores: teamScores(memberIds, state.attempts),
          attempts: state.attempts
            .filter((attempt) => memberIds.has(attempt.memberId))
            .map(({ id, memberId, gameId, score, createdAt }) => ({ id, memberId, gameId, score, createdAt }))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        };
      });
    },
    async addScore(input) {
      const validation = validateScore(input);
      if (!validation.ok) throw eventError(validation.error);
      return store.update((state) => {
        if (!state.members.some((member) => member.id === input.memberId)) throw eventError('Unknown member.', 404);
        const attempt = { id: randomUUID(), memberId: input.memberId, gameId: input.gameId, score: input.score, createdAt: new Date().toISOString() };
        state.attempts.push(attempt);
        return attempt;
      });
    },
    async redeemScoreCode(memberId, input, key) {
      if (!GAME_IDS.includes(input?.gameId)) throw eventError('Unknown game.');
      const score = decodeScoreCode(input?.code, key);
      return store.update((state) => {
        const member = state.members.find((item) => item.id === memberId);
        if (!member) throw eventError('Unknown member.', 404);
        const game = state.games.find((item) => item.id === input.gameId);
        if (game?.status !== 'live') throw eventError('Game is not live.', 409);
        const teammateIds = new Set(state.members.filter((item) => item.teamId === member.teamId).map((item) => item.id));
        let previousBest = 0;
        let previousMemberBest = 0;
        let recorded = true;
        for (const attempt of state.attempts) {
          if (attempt.gameId !== input.gameId || !Number.isFinite(attempt.score) || attempt.score < 0 || attempt.score > 1_000_000) continue;
          if (teammateIds.has(attempt.memberId)) previousBest = Math.max(previousBest, attempt.score);
          if (attempt.memberId === memberId) {
            previousMemberBest = Math.max(previousMemberBest, attempt.score);
            if (attempt.score === score) recorded = false;
          }
        }
        if (recorded) state.attempts.push({ id: randomUUID(), memberId, gameId: input.gameId, score, createdAt: new Date().toISOString() });
        return { gameId: input.gameId, score, improved: score > previousBest, previousBest, teamBest: Math.max(previousBest, score), memberBest: Math.max(previousMemberBest, score), recorded };
      });
    },
    async updateGame(id, input) {
      if (!GAME_IDS.includes(id)) throw eventError('Unknown game.', 404);
      const hasStatus = input && Object.hasOwn(input, 'status');
      const hasUrl = input && Object.hasOwn(input, 'url');
      let validUrl = input?.url === null;
      if (hasUrl && typeof input.url === 'string') {
        try { validUrl = ['http:', 'https:'].includes(new URL(input.url).protocol); }
        catch { validUrl = false; }
      }
      if ((!hasStatus && !hasUrl) || (hasStatus && !['coming_soon', 'live', 'closed'].includes(input.status)) || (hasUrl && !validUrl)) throw eventError('Game status or URL is invalid.');
      return store.update((state) => {
        const game = state.games.find((item) => item.id === id);
        if (hasStatus) game.status = input.status;
        if (hasUrl) game.url = input.url;
        return game;
      });
    },
    async resetCode(id) {
      const accessCode = makeAccessCode();
      const accessCodeHash = await hashAccessCode(accessCode);
      return store.update((state) => {
        const member = state.members.find((item) => item.id === id);
        if (!member) throw eventError('Unknown member.', 404);
        member.accessCodeHash = accessCodeHash;
        member.sessionVersion = (member.sessionVersion ?? 1) + 1;
        return { memberId: id, accessCode };
      });
    },
  };
}
