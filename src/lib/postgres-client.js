export function createClientCache(factory) {
  let connectionPromise;
  let connectionUrl;
  return function client(url) {
    if (connectionPromise) {
      if (connectionUrl !== url) return Promise.reject(new Error('PostgreSQL client is already configured for a different database.'));
      return connectionPromise;
    }
    connectionUrl = url;
    connectionPromise = Promise.resolve().then(() => factory(url)).catch((error) => {
      connectionPromise = undefined;
      connectionUrl = undefined;
      throw error;
    });
    return connectionPromise;
  };
}

export const getPostgresClient = createClientCache(async (url) => {
  const { default: postgres } = await import('postgres');
  return postgres(url, { max: 1, prepare: false, idle_timeout: 20, connect_timeout: 10 });
});

export function databaseError(error, force = false) {
  if (error?.code === '42P01' || error?.code === '3F000') return Object.assign(new Error('Database schema is missing. Run npm run db:migrate.'), { status: 503 });
  if (force || error?.code || error?.name === 'PostgresError') return Object.assign(new Error('Database request failed.'), { status: 503 });
  return error;
}
