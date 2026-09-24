import { join } from 'node:path';
import { createStore } from './store.js';
import { createPostgresStore } from './postgres-store.js';

export function storageBackend(env = process.env) {
  if (env.DATABASE_URL) return 'postgres';
  if (env.ALLOW_JSON_STORAGE === 'true') return 'json';
  if (env.NODE_ENV === 'production' || env.VERCEL || env.DEPLOYMENT_ENV === 'production' || env.RENDER || env.FLY_APP_NAME || env.RAILWAY_ENVIRONMENT) return 'unavailable';
  return 'json';
}

export function createConfiguredStore(env = process.env) {
  const backend = storageBackend(env);
  if (backend === 'postgres') return createPostgresStore(env.DATABASE_URL);
  if (backend === 'json') return createStore(join(process.cwd(), 'data', 'event.json'));
  // ALLOW_JSON_STORAGE=true is only appropriate on a persistent, single-host production deployment.
  const fail = async () => { throw Object.assign(new Error('DATABASE_URL is required for this deployment.'), { status: 503 }); };
  return { read: fail, update: fail };
}
