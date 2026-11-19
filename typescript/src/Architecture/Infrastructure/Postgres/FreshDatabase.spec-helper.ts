import { randomBytes } from 'node:crypto';

import pg from 'pg';

/**
 * A database of a suite's own on the test server, dropped when the suite ends (ADR 47). The
 * server is `TEST_POSTGRES` (`postgresql://user:password@host:port`, no database); without it
 * the suites that need PostgreSQL are skipped, and say so. A suite creates its database in
 * `beforeAll`, hands its URL to what it tests, and calls `drop()` in `afterAll`: a suite that
 * left its databases behind made sixteen hundred of them in an hour on J6's machine and filled
 * the disk, which is why dropping is this helper's job and not a line to remember.
 */
export interface FreshDatabase {
  /** The database's URL, for a `PostgresDatabase` or a `DATABASE_URL`. */
  url: string;
  name: string;
  /** Ends every connection to it and drops it. */
  drop(): Promise<void>;
}

/** The test server's URL, or undefined: `(TEST_POSTGRES ? describe : describe.skip)(…)` in a suite that needs it. */
export const TEST_POSTGRES = process.env.TEST_POSTGRES;

export async function freshDatabase(label: string, server: string | undefined = TEST_POSTGRES): Promise<FreshDatabase> {
  if (!server) {
    throw new Error(
      'freshDatabase() needs TEST_POSTGRES, the URL of a PostgreSQL server the suites may create databases on',
    );
  }
  const name = `test_${label.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${randomBytes(4).toString('hex')}`;
  const admin = new pg.Client({ connectionString: server });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }
  const base = new URL(server);
  base.pathname = `/${name}`;
  return {
    url: base.toString(),
    name,
    async drop() {
      const client = new pg.Client({ connectionString: server });
      await client.connect();
      try {
        await client.query(
          'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
          [name],
        );
        await client.query(`DROP DATABASE IF EXISTS "${name}"`);
      } finally {
        await client.end();
      }
    },
  };
}
