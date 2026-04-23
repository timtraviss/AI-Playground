import { Router } from 'express';
import bcrypt from 'bcrypt';
import { getPool } from '../lib/db.js';

export const authRouter = Router();

// POST /api/auth/login
authRouter.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  try {
    const { rows } = await getPool().query(
      'SELECT id, username, display_name, role, password_hash FROM users WHERE username = $1',
      [String(username).toLowerCase().trim()]
    );
    const user = rows[0];
    const valid = user && await bcrypt.compare(String(password), user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Incorrect username or password.' });
    }
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Session error.' });
      req.session.userId = user.id;
      getPool()
        .query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id])
        .catch(() => {});
      res.json({ ok: true });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/logout
authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/login/');
  });
});

// GET /api/auth/me
authRouter.get('/me', async (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  try {
    const { rows } = await getPool().query(
      `SELECT id, username, display_name AS "displayName", role
       FROM users WHERE id = $1`,
      [req.session.userId]
    );
    if (!rows.length) return res.status(401).json({ error: 'Not authenticated.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
