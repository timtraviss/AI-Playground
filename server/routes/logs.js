import { Router } from 'express';
import { getPool } from '../lib/db.js';

export const logsRouter = Router();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function checkAuth(req, res, next) {
  const pw = req.headers['x-admin-password'];
  if (!ADMIN_PASSWORD || pw !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  next();
}

logsRouter.use(checkAuth);

// Summary cards — today's stats
logsRouter.get('/summary', async (req, res) => {
  try {
    const pool = getPool();
    const [visits, uniqueIps, topTool, errors] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM access_log WHERE type='request' AND ts > NOW() - INTERVAL '24 hours'`),
      pool.query(`SELECT COUNT(DISTINCT ip) FROM access_log WHERE type='request' AND ts > NOW() - INTERVAL '24 hours'`),
      pool.query(`SELECT tool, COUNT(*) as n FROM access_log WHERE type='request' AND tool IS NOT NULL AND ts > NOW() - INTERVAL '7 days' GROUP BY tool ORDER BY n DESC LIMIT 1`),
      pool.query(`SELECT COUNT(*) FROM access_log WHERE type='error' AND ts > NOW() - INTERVAL '7 days'`),
    ]);
    res.json({
      visitsToday:   parseInt(visits.rows[0].count),
      uniqueIpsToday: parseInt(uniqueIps.rows[0].count),
      topTool:       topTool.rows[0]?.tool ?? '—',
      errorsWeek:    parseInt(errors.rows[0].count),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tool usage for chart
logsRouter.get('/tools', async (req, res) => {
  const days = Math.min(parseInt(req.query.days) || 7, 90);
  try {
    const { rows } = await getPool().query(
      `SELECT tool, COUNT(*) as n FROM access_log
       WHERE type='request' AND tool IS NOT NULL AND ts > NOW() - ($1 || ' days')::INTERVAL
       GROUP BY tool ORDER BY n DESC`,
      [days]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Recent requests
logsRouter.get('/recent', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const tool  = req.query.tool || null;
  try {
    const { rows } = await getPool().query(
      `SELECT id, ts, method, path, tool, status, ms, ip, country, city, ua
       FROM access_log
       WHERE type='request' ${tool ? "AND tool = $2" : ""}
       ORDER BY ts DESC LIMIT $1`,
      tool ? [limit, tool] : [limit]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Recent errors
logsRouter.get('/errors', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  try {
    const { rows } = await getPool().query(
      `SELECT id, ts, method, path, status, ip, error_msg, stack
       FROM access_log WHERE type='error' ORDER BY ts DESC LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Top IPs
logsRouter.get('/top-ips', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  try {
    const { rows } = await getPool().query(
      `SELECT ip, country, city,
              COUNT(*) as visits,
              COUNT(DISTINCT tool) as tools_used,
              MAX(ts) as last_seen
       FROM access_log WHERE type='request' AND ip IS NOT NULL
       GROUP BY ip, country, city ORDER BY visits DESC LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
