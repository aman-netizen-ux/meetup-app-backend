import 'dotenv/config';
import pg from 'pg';

/** PostgreSQL connection owner, confined to infrastructure. */
export class PgPoolProvider {
  private pool: pg.Pool | undefined;

  getPool(): pg.Pool {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is not configured.');
    this.pool ??= new pg.Pool({ connectionString: databaseUrl });
    return this.pool;
  }

  async close(): Promise<void> {
    if (this.pool) await this.pool.end();
    this.pool = undefined;
  }
}
