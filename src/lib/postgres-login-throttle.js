import { createHmac } from 'node:crypto';
import { databaseError, getPostgresClient } from './postgres-client.js';

class MissingThrottleSecretError extends Error {
  constructor() {
    super('SESSION_SECRET is required for shared login throttling.');
    this.status = 503;
  }
}

export function throttleKeyHash(key, secret) {
  return createHmac('sha256', secret).update('login-throttle:v1:').update(key).digest('hex');
}

export function createPostgresLoginThrottle({ url, secret, maxFailures = 5, windowMs = 15 * 60_000, getClient = getPostgresClient } = {}) {
  function hash(key) {
    const value = typeof secret === 'function' ? secret() : secret;
    if (!value) throw new MissingThrottleSecretError();
    return throttleKeyHash(key, value);
  }
  async function run(operation) {
    try { return await operation(); }
    catch (error) { if (error instanceof MissingThrottleSecretError) throw error; throw databaseError(error, true); }
  }
  async function write(sql, keyHash, now) {
    const timestamp = new Date(now);
    const expiry = new Date(now + windowMs);
    const [entry] = await sql`INSERT INTO reboot.login_throttle (key_hash, failure_count, expires_at, updated_at)
      VALUES (${keyHash}, 1, ${expiry}, ${timestamp})
      ON CONFLICT (key_hash) DO UPDATE SET
        failure_count = CASE WHEN reboot.login_throttle.expires_at <= ${timestamp} THEN 1 ELSE reboot.login_throttle.failure_count + 1 END,
        expires_at = CASE WHEN reboot.login_throttle.expires_at <= ${timestamp} THEN ${expiry} ELSE reboot.login_throttle.expires_at END,
        updated_at = ${timestamp}
      RETURNING failure_count, expires_at`;
    return entry;
  }
  async function cleanup(sql, now) {
    const timestamp = new Date(now);
    await sql`DELETE FROM reboot.login_throttle WHERE expires_at <= ${timestamp} AND key_hash IN (
      SELECT key_hash FROM reboot.login_throttle WHERE expires_at <= ${timestamp} ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED
    )`;
  }
  return {
    check(key, now = Date.now()) {
      return run(async () => {
        const keyHash = hash(key);
        const sql = await getClient(url);
        const [entry] = await sql`SELECT failure_count, expires_at FROM reboot.login_throttle WHERE key_hash = ${keyHash} AND expires_at > ${new Date(now)}`;
        if (!entry || Number(entry.failure_count) < maxFailures) return 0;
        return Math.max(0, Math.ceil((new Date(entry.expires_at).getTime() - now) / 1000));
      });
    },
    failure(key, now = Date.now()) {
      return run(async () => {
        const keyHash = hash(key);
        const sql = await getClient(url);
        await write(sql, keyHash, now);
      });
    },
    attempt(key, now = Date.now()) {
      return run(async () => {
        const keyHash = hash(key);
        const sql = await getClient(url);
        const entry = await write(sql, keyHash, now);
        await cleanup(sql, now);
        if (!entry || Number(entry.failure_count) <= maxFailures) return 0;
        return Math.max(0, Math.ceil((new Date(entry.expires_at).getTime() - now) / 1000));
      });
    },
    success(key) {
      return run(async () => {
        const keyHash = hash(key);
        const sql = await getClient(url);
        await sql`DELETE FROM reboot.login_throttle WHERE key_hash = ${keyHash}`;
      });
    },
  };
}
