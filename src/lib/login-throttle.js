import { isIP } from 'node:net';

export function createLoginThrottle({ maxFailures = 5, windowMs = 15 * 60_000, maxEntries = 10_000 } = {}) {
  const failures = new Map();
  function prune(now) {
    for (const [key, entry] of failures) if (now >= entry.expiresAt) failures.delete(key);
  }
  function record(key, now) {
    prune(now);
    let entry = failures.get(key);
    if (!entry) {
      if (failures.size >= maxEntries) failures.delete(failures.keys().next().value);
      entry = { count: 1, expiresAt: now + windowMs };
      failures.set(key, entry);
    }
    else entry.count += 1;
    return entry;
  }
  return {
    check(key, now = Date.now()) {
      prune(now);
      const entry = failures.get(key);
      if (!entry) return 0;
      return entry.count >= maxFailures ? Math.ceil((entry.expiresAt - now) / 1000) : 0;
    },
    failure(key, now = Date.now()) {
      record(key, now);
    },
    attempt(key, now = Date.now()) {
      const entry = record(key, now);
      return entry.count > maxFailures ? Math.ceil((entry.expiresAt - now) / 1000) : 0;
    },
    success(key) { failures.delete(key); },
  };
}

function clientIdentity(request, env) {
  const firstIP = (header) => {
    const candidate = request.headers.get(header)?.split(',')[0].trim();
    return candidate && isIP(candidate) ? candidate : null;
  };
  if (env.VERCEL) {
    // Vercel supplies x-vercel-forwarded-for and overwrites the fallback forwarding headers.
    for (const header of ['x-vercel-forwarded-for', 'x-forwarded-for', 'x-real-ip']) {
      const client = firstIP(header);
      if (client) return client;
    }
    return 'unknown';
  }
  if (env.NODE_ENV !== 'production' && env.DEPLOYMENT_ENV !== 'production' && !env.RENDER && !env.FLY_APP_NAME && !env.RAILWAY_ENVIRONMENT) return 'local';
  const header = env.TRUSTED_CLIENT_IP_HEADER;
  if (typeof header !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/i.test(header)) {
    throw Object.assign(new Error('Trusted client IP header is not configured for this deployment.'), { status: 503 });
  }
  const client = firstIP(header);
  if (!client) throw Object.assign(new Error('Trusted client IP is unavailable for this request.'), { status: 503 });
  return client;
}

export function loginKeys(request, role, email = '', env = process.env) {
  const client = clientIdentity(request, env);
  return role === 'member'
    ? [`member:${client}:${email.trim().toLowerCase()}`, `member:global:${client}`]
    : [`admin-login:${client}`];
}
