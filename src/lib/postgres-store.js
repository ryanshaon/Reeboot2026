import { diffState, rowToState } from './postgres-state.js';
import { getPostgresClient, databaseError } from './postgres-client.js';

async function snapshot(sql) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const [before] = await sql`SELECT revision FROM reboot.event_meta WHERE id = true`;
    if (!before) throw Object.assign(new Error('Database schema is missing its event_meta row. Run npm run db:migrate.'), { status: 503 });
    const [teams, members, games, attempts] = await Promise.all([
      sql`SELECT * FROM reboot.teams ORDER BY created_at, id`,
      sql`SELECT * FROM reboot.members ORDER BY team_id, member_position`,
      sql`SELECT * FROM reboot.games ORDER BY id`,
      sql`SELECT * FROM reboot.attempts ORDER BY created_at, id`,
    ]);
    const [after] = await sql`SELECT revision FROM reboot.event_meta WHERE id = true`;
    if (before.revision === after.revision) return { revision: before.revision, state: rowToState({ teams, members, games, attempts }) };
  }
  throw Object.assign(new Error('Database changed repeatedly while reading. Retry the request.'), { status: 503 });
}

export async function applyDiff(tx, diff, state) {
  // Remove dependents first so replacement rows may reuse unique hashes, emails, and positions.
  if (diff.attempts.remove.length) await tx`DELETE FROM reboot.attempts WHERE id IN ${tx(diff.attempts.remove)}`;
  if (diff.members.remove.length) await tx`DELETE FROM reboot.members WHERE id IN ${tx(diff.members.remove)}`;
  if (diff.teams.remove.length) await tx`DELETE FROM reboot.teams WHERE id IN ${tx(diff.teams.remove)}`;
  if (diff.games.remove.length) await tx`DELETE FROM reboot.games WHERE id IN ${tx(diff.games.remove)}`;
  // A deferred captain FK permits teams and members to be inserted in this order.
  if (diff.teams.upsert.length) await tx`INSERT INTO reboot.teams ${tx(diff.teams.upsert.map((r) => ({ id: r.id, name: r.name, captain_id: r.captainId, enrollment_key_hash: r.enrollmentKeyHash ?? null, created_at: r.createdAt })), 'id', 'name', 'captain_id', 'enrollment_key_hash', 'created_at')} ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, captain_id = EXCLUDED.captain_id, enrollment_key_hash = EXCLUDED.enrollment_key_hash, created_at = EXCLUDED.created_at`;
  const captainTeams = [...new Set(diff.members.upsert.filter((member) => member.isCaptain).map((member) => member.teamId))];
  if (captainTeams.length) await tx`UPDATE reboot.members SET is_captain = false WHERE team_id IN ${tx(captainTeams)} AND is_captain`;
  if (diff.members.upsert.length) await tx`INSERT INTO reboot.members ${tx(diff.members.upsert.map((r) => ({ id: r.id, team_id: r.teamId, name: r.name, email: r.email, access_code_hash: r.accessCodeHash, session_version: r.sessionVersion ?? 1, is_captain: r.isCaptain, member_position: state.members.filter((m) => m.teamId === r.teamId).findIndex((m) => m.id === r.id), created_at: r.createdAt })), 'id', 'team_id', 'name', 'email', 'access_code_hash', 'session_version', 'is_captain', 'member_position', 'created_at')} ON CONFLICT (id) DO UPDATE SET team_id = EXCLUDED.team_id, name = EXCLUDED.name, email = EXCLUDED.email, access_code_hash = EXCLUDED.access_code_hash, session_version = EXCLUDED.session_version, is_captain = EXCLUDED.is_captain, member_position = EXCLUDED.member_position, created_at = EXCLUDED.created_at`;
  if (diff.games.upsert.length) await tx`INSERT INTO reboot.games ${tx(diff.games.upsert.map((r) => ({ id: r.id, url: r.url, status: r.status })), 'id', 'url', 'status')} ON CONFLICT (id) DO UPDATE SET url = EXCLUDED.url, status = EXCLUDED.status`;
  if (diff.attempts.upsert.length) await tx`INSERT INTO reboot.attempts ${tx(diff.attempts.upsert.map((r) => ({ id: r.id, member_id: r.memberId, game_id: r.gameId, score: r.score, created_at: r.createdAt })), 'id', 'member_id', 'game_id', 'score', 'created_at')} ON CONFLICT (id) DO UPDATE SET member_id = EXCLUDED.member_id, game_id = EXCLUDED.game_id, score = EXCLUDED.score, created_at = EXCLUDED.created_at`;
}

export function createPostgresStore(url) {
  return {
    async read() {
      try { return (await snapshot(await getPostgresClient(url))).state; }
      catch (error) { throw databaseError(error); }
    },
    async update(callback) {
      try {
        const sql = await getPostgresClient(url);
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const { revision, state } = await snapshot(sql);
          const before = structuredClone(state);
          const result = await callback(state);
          const diff = diffState(before, state);
          const committed = await sql.begin(async (tx) => {
            await tx`SELECT pg_advisory_xact_lock(7748160342561)`;
            const [current] = await tx`SELECT revision FROM reboot.event_meta WHERE id = true`;
            if (current.revision !== revision) return false;
            await applyDiff(tx, diff, state);
            await tx`UPDATE reboot.event_meta SET revision = revision + 1 WHERE id = true`;
            return true;
          });
          if (committed) return result;
        }
        throw Object.assign(new Error('Database changed repeatedly while updating. Retry the request.'), { status: 503 });
      } catch (error) { throw databaseError(error); }
    },
  };
}
