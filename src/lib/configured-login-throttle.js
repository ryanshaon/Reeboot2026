import { createLoginThrottle } from './login-throttle.js';
import { createPostgresLoginThrottle } from './postgres-login-throttle.js';

export function throttleBackend(env = process.env) {
  if (env.DATABASE_URL) return 'postgres';
  if (env.ALLOW_JSON_STORAGE === 'true') return 'memory';
  if (env.NODE_ENV === 'production' || env.VERCEL || env.DEPLOYMENT_ENV === 'production' || env.RENDER || env.FLY_APP_NAME || env.RAILWAY_ENVIRONMENT) return 'unavailable';
  return 'memory';
}

export function createConfiguredLoginThrottle(env = process.env, options = {}) {
  const backend = throttleBackend(env);
  if (backend === 'memory') return createLoginThrottle(options);
  if (backend === 'postgres') {
    return createPostgresLoginThrottle({
      ...options,
      url: env.DATABASE_URL,
      secret: () => env.SESSION_SECRET || (env.NODE_ENV === 'production' ? undefined : 'local-development-only-change-me'),
    });
  }
  const fail = async () => { throw Object.assign(new Error('DATABASE_URL is required for shared login throttling.'), { status: 503 }); };
  return { check: fail, attempt: fail, failure: fail, success: fail };
}
