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

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        username      TEXT NOT NULL UNIQUE,
        display_name  TEXT NOT NULL,
        role          TEXT NOT NULL DEFAULT 'Trainee',
        password_hash TEXT NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_login    TIMESTAMPTZ
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS usage_log (
        id                SERIAL PRIMARY KEY,
        user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
        tool              TEXT NOT NULL,
        model             TEXT NOT NULL,
        input_tokens      INTEGER NOT NULL DEFAULT 0,
        output_tokens     INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd          NUMERIC(10,6) NOT NULL DEFAULT 0,
        ts                TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS usage_log_user_idx ON usage_log (user_id);
      CREATE INDEX IF NOT EXISTS usage_log_ts_idx   ON usage_log (ts DESC);
      CREATE INDEX IF NOT EXISTS usage_log_tool_idx ON usage_log (tool);
    `);
  } finally {
    client.release();
  }
}
