import pg from 'pg';

const { Pool } = pg;

let pool;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
    });
  }
  return pool;
}

export async function initDb() {
  if (!process.env.DATABASE_URL) return;
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS access_log (
        id         SERIAL PRIMARY KEY,
        ts         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        type       TEXT NOT NULL,
        method     TEXT,
        path       TEXT,
        tool       TEXT,
        status     INTEGER,
        ms         INTEGER,
        ip         TEXT,
        country    TEXT,
        city       TEXT,
        ua         TEXT,
        error_msg  TEXT,
        stack      TEXT
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS access_log_ts_idx   ON access_log (ts DESC);
      CREATE INDEX IF NOT EXISTS access_log_tool_idx ON access_log (tool);
      CREATE INDEX IF NOT EXISTS access_log_type_idx ON access_log (type);
    `);
  } finally {
    client.release();
  }
}
