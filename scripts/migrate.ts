import 'dotenv/config';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run migrations. See .env.example.');
}

const pool = new pg.Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
  await client.query('SELECT pg_advisory_lock($1)', [71302431]);
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const migrationDir = resolve(process.cwd(), 'migrations');
  const filenames = (await readdir(migrationDir))
    .filter((filename) => /^\d+_[a-z0-9_]+\.sql$/.test(filename))
    .sort();

  for (const filename of filenames) {
    const applied = await client.query(
      'SELECT 1 FROM schema_migrations WHERE filename = $1',
      [filename],
    );
    if (applied.rowCount) continue;

    const sql = await readFile(resolve(migrationDir, filename), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [filename],
      );
      await client.query('COMMIT');
      process.stdout.write(`Applied ${filename}\n`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client.query('SELECT pg_advisory_unlock($1)', [71302431]);
  client.release();
  await pool.end();
}
