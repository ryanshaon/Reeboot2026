import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import nextEnv from '@next/env';
import postgres from 'postgres';

nextEnv.loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required to run migrations.');
  process.exitCode = 1;
} else {
  let sql;
  try {
    sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, idle_timeout: 20, connect_timeout: 10 });
    const directory = join(process.cwd(), 'db', 'migrations');
    const files = (await readdir(directory)).filter((file) => /^\d+_[\w-]+\.sql$/.test(file)).sort();
    for (const file of files) {
      const source = await readFile(join(directory, file), 'utf8');
      const applied = await sql.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(7748160342562)`;
        await tx`CREATE SCHEMA IF NOT EXISTS reboot`;
        await tx`CREATE TABLE IF NOT EXISTS reboot.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
        const [existing] = await tx`SELECT name FROM reboot.schema_migrations WHERE name = ${file}`;
        if (existing) return false;
        await tx.unsafe(source);
        await tx`INSERT INTO reboot.schema_migrations (name) VALUES (${file})`;
        return true;
      });
      console.log(`${applied ? 'Applied' : 'Already applied'} ${file}`);
    }
  } catch (error) {
    // Database driver errors can contain connection details; never print them or the URL.
    console.error(`Migration failed (${error.code || 'unknown error'}).`);
    process.exitCode = 1;
  } finally {
    if (sql) {
      try { await sql.end(); }
      catch { console.error('Database connection cleanup failed.'); process.exitCode = 1; }
    }
  }
}
