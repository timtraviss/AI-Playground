import { getPool } from '../lib/db.js';

export async function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Not authenticated.' });
    }
    const dest = encodeURIComponent(req.originalUrl);
    return res.redirect(`/login/?next=${dest}`);
  }
  try {
    const { rows } = await getPool().query(
      'SELECT id, username, display_name, role FROM users WHERE id = $1',
      [req.session.userId]
    );
    if (!rows.length) {
      req.session.destroy(() => {});
      return res.redirect('/login/');
    }
    const u = rows[0];
    req.user = { id: u.id, username: u.username, displayName: u.display_name, role: u.role };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'Admin') {
      if (req.path.startsWith('/api/')) {
        return res.status(403).json({ error: 'Admin access required.' });
      }
      return res.redirect('/?denied=1');
    }
    next();
  });
}
