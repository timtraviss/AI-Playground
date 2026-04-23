import { Router } from 'express';
import { getPool } from '../lib/db.js';

export const usageRouter = Router();

function periodWhere(period) {
  if (period === 'week') return "AND ul.ts >= NOW() - INTERVAL '7 days'";
  if (period === 'all')  return '';
  return "AND ul.ts >= NOW() - INTERVAL '30 days'"; // default: month
}

// GET /api/usage/admin — admin view (all users), filterable
// Query params: userId, tool, period (week|month|all), page
usageRouter.get('/admin', async (req, res) => {
  const { userId, tool, period, page: pageStr } = req.query;
  const page  = Math.max(1, parseInt(pageStr ?? '1', 10));
  const limit = 50;
  const offset = (page - 1) * limit;

  const params = [];
  const filters = [periodWhere(period)];

  if (userId) { params.push(userId); filters.push(`AND ul.user_id = $${params.length}`); }
  if (tool)   { params.push(tool);   filters.push(`AND ul.tool = $${params.length}`); }

  const where = `WHERE ul.user_id IS NOT NULL ${filters.join(' ')}`;

  try {
    const [summary, byUser, log, count] = await Promise.all([
      getPool().query(
        `SELECT
           COALESCE(SUM(ul.cost_usd), 0)::float                              AS total_cost,
           COALESCE(SUM(ul.input_tokens+ul.output_tokens+ul.cache_read_tokens),0)::bigint AS total_tokens,
           COUNT(DISTINCT ul.user_id)                                         AS active_users,
           COUNT(*)                                                            AS sessions
         FROM usage_log ul ${where}`,
        params
      ),
      getPool().query(
        `SELECT u.id, u.username, u.display_name,
                COUNT(ul.id)                                                       AS sessions,
                COALESCE(SUM(ul.cost_usd),0)::float                               AS cost,
                COALESCE(SUM(ul.input_tokens+ul.output_tokens+ul.cache_read_tokens),0)::bigint AS tokens,
                MODE() WITHIN GROUP (ORDER BY ul.tool)                            AS top_tool
         FROM usage_log ul JOIN users u ON ul.user_id = u.id
         ${where}
         GROUP BY u.id, u.username, u.display_name
         ORDER BY cost DESC`,
        params
      ),
      getPool().query(
        `SELECT ul.id, u.username, ul.tool, ul.model, ul.ts,
                ul.input_tokens, ul.output_tokens, ul.cache_read_tokens, ul.cost_usd::float
         FROM usage_log ul LEFT JOIN users u ON ul.user_id = u.id
         ${where}
         ORDER BY ul.ts DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      getPool().query(
        `SELECT COUNT(*) FROM usage_log ul ${where}`,
        params
      ),
    ]);

    res.json({
      summary: summary.rows[0],
      byUser:  byUser.rows,
      log:     log.rows,
      total:   parseInt(count.rows[0].count, 10),
      page,
      limit,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/usage/me — current user's own usage
// Query params: period (week|month|all), page
usageRouter.get('/me', async (req, res) => {
  const { period, page: pageStr } = req.query;
  const page  = Math.max(1, parseInt(pageStr ?? '1', 10));
  const limit = 50;
  const offset = (page - 1) * limit;
  const pw = periodWhere(period).replace('ul.ts', 'ts').replace('AND ', '');
  const where = `WHERE user_id = $1${pw ? ' AND ' + pw : ''}`;

  try {
    const [summary, byTool, log, count] = await Promise.all([
      getPool().query(
        `SELECT COALESCE(SUM(cost_usd),0)::float AS total_cost,
                COALESCE(SUM(input_tokens+output_tokens+cache_read_tokens),0)::bigint AS total_tokens,
                COUNT(*) AS sessions
         FROM usage_log ${where}`,
        [req.user.id]
      ),
      getPool().query(
        `SELECT tool,
                COUNT(*) AS sessions,
                COALESCE(SUM(cost_usd),0)::float AS cost,
                COALESCE(SUM(input_tokens+output_tokens+cache_read_tokens),0)::bigint AS tokens
         FROM usage_log ${where}
         GROUP BY tool ORDER BY cost DESC`,
        [req.user.id]
      ),
      getPool().query(
        `SELECT id, tool, model, ts, input_tokens, output_tokens, cache_read_tokens, cost_usd::float
         FROM usage_log ${where}
         ORDER BY ts DESC LIMIT $2 OFFSET $3`,
        [req.user.id, limit, offset]
      ),
      getPool().query(`SELECT COUNT(*) FROM usage_log ${where}`, [req.user.id]),
    ]);

    res.json({
      summary: summary.rows[0],
      byTool:  byTool.rows,
      log:     log.rows,
      total:   parseInt(count.rows[0].count, 10),
      page,
      limit,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
