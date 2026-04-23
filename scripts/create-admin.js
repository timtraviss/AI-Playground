#!/usr/bin/env node
/**
 * Create (or update) the admin user.
 * Usage: node scripts/create-admin.js <username> "<Display Name>" <password>
 */
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { getPool, initDb } from '../server/lib/db.js';

dotenv.config();

const [,, username, displayName, password] = process.argv;

if (!username || !displayName || !password) {
  console.error('Usage: node scripts/create-admin.js <username> "<Display Name>" <password>');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set in .env');
  process.exit(1);
}

await initDb();
const hash = await bcrypt.hash(password, 12);

try {
  const { rows } = await getPool().query(
    `INSERT INTO users (username, display_name, role, password_hash)
     VALUES ($1, $2, 'Admin', $3)
     ON CONFLICT (username)
     DO UPDATE SET display_name = $2, role = 'Admin', password_hash = $3
     RETURNING id, username, display_name, role`,
    [username.toLowerCase(), displayName, hash]
  );
  console.log('✓ Admin user ready:', rows[0]);
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
} finally {
  await getPool().end();
}
