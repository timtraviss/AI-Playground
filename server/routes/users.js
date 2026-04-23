import { Router } from 'express';
import bcrypt from 'bcrypt';
import { getPool } from '../lib/db.js';

export const usersRouter = Router();

const USERNAME_RE = /^[a-z0-9][a-z0-9._]{0,38}$/;

// GET /api/admin/users
usersRouter.get('/', async (_req, res) => {
  try {
    const { rows } = await getPool().query(
      `SELECT id, username, display_name, role, created_at, last_login
       FROM users ORDER BY created_at`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users
usersRouter.post('/', async (req, res) => {
  const { username, displayName, password, role } = req.body || {};
  if (!username || !displayName || !password || !role) {
    return res.status(400).json({ error: 'username, displayName, password, and role are required.' });
  }
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Username must be 1-39 lowercase alphanumeric chars, dots, or underscores.' });
  }
  try {
    const hash = await bcrypt.hash(String(password), 12);
    const { rows } = await getPool().query(
      `INSERT INTO users (username, display_name, role, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, display_name, role, created_at, last_login`,
      [username.toLowerCase(), displayName, role, hash]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already taken.' });
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/users/:id/password
usersRouter.patch('/:id/password', async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'password is required.' });
  try {
    const hash = await bcrypt.hash(String(password), 12);
    const result = await getPool().query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [hash, req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'User not found.' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/users/:id
usersRouter.delete('/:id', async (req, res) => {
  if (parseInt(req.params.id, 10) === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  }
  try {
    const result = await getPool().query('DELETE FROM users WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'User not found.' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
