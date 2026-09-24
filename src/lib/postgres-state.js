const iso = (value) => value instanceof Date ? value.toISOString() : new Date(value).toISOString();

export function rowToState(rows) {
  return {
    version: 1,
    teams: rows.teams.map((row) => ({ id: row.id, name: row.name, captainId: row.captain_id, ...(row.enrollment_key_hash == null ? {} : { enrollmentKeyHash: row.enrollment_key_hash }), createdAt: iso(row.created_at) })),
    members: rows.members.map((row) => ({ id: row.id, teamId: row.team_id, name: row.name, email: row.email, accessCodeHash: row.access_code_hash, sessionVersion: row.session_version, isCaptain: row.is_captain, createdAt: iso(row.created_at) })),
    games: rows.games.map((row) => ({ id: row.id, url: row.url, status: row.status })),
    attempts: rows.attempts.map((row) => ({ id: row.id, memberId: row.member_id, gameId: row.game_id, score: Number(row.score), createdAt: iso(row.created_at) })),
  };
}

export function diffState(before, after) {
  const diff = {};
  const memberPositions = (members) => {
    const perTeam = new Map();
    return new Map(members.map((member) => {
      const position = perTeam.get(member.teamId) ?? 0;
      perTeam.set(member.teamId, position + 1);
      return [member.id, position];
    }));
  };
  const oldPositions = memberPositions(before.members);
  const newPositions = memberPositions(after.members);
  for (const name of ['teams', 'members', 'games', 'attempts']) {
    if (!Array.isArray(after[name])) throw new Error(`Invalid ${name} state.`);
    const oldRows = new Map(before[name].map((row) => [row.id, row]));
    const ids = new Set();
    const upsert = [];
    for (const row of after[name]) {
      if (!row?.id || ids.has(row.id)) throw new Error(`Duplicate or missing ${name} ID.`);
      ids.add(row.id);
      if (JSON.stringify(oldRows.get(row.id)) !== JSON.stringify(row) || (name === 'members' && oldPositions.get(row.id) !== newPositions.get(row.id))) upsert.push(row);
    }
    diff[name] = { upsert, remove: [...oldRows.keys()].filter((id) => !ids.has(id)) };
  }
  return diff;
}
