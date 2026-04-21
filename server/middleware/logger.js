import { getPool } from '../lib/db.js';

const TOOL_MAP = {
  '/api/tutor/chat':          'tutor',
  '/api/critique':            'interview',
  '/api/transcript':          'interview',
  '/api/podcast-review':      'podcast-reviewer',
  '/api/podcast-converter':   'podcast-converter',
  '/api/proofreader':         'proofreader',
  '/api/l3-reviewer':         'l3-reviewer',
};

const STATIC_RE = /\.(js|css|map|ico|png|jpg|jpeg|svg|woff2?|ttf|json)$/i;

const geoCache = new Map();

async function geoLookup(ip) {
  if (!ip || ip === '::1' || ip.startsWith('127.') || ip.startsWith('192.168.')) return {};
  if (geoCache.has(ip)) return geoCache.get(ip);
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=country,city,status`, { signal: AbortSignal.timeout(2000) });
    const data = await res.json();
    const result = data.status === 'success' ? { country: data.country, city: data.city } : {};
    geoCache.set(ip, result);
    return result;
  } catch {
    return {};
  }
}

function resolveTool(path) {
  for (const [prefix, name] of Object.entries(TOOL_MAP)) {
    if (path.startsWith(prefix)) return name;
  }
  return null;
}

async function writeToDb(entry) {
  if (!process.env.DATABASE_URL) return;
  try {
    await getPool().query(
      `INSERT INTO access_log (ts, type, method, path, tool, status, ms, ip, country, city, ua, error_msg, stack)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [entry.ts, entry.type, entry.method, entry.path, entry.tool ?? null,
       entry.status ?? null, entry.ms ?? null, entry.ip ?? null,
       entry.country ?? null, entry.city ?? null, entry.ua ?? null,
       entry.error_msg ?? null, entry.stack ?? null]
    );
  } catch (err) {
    console.error('logger db write failed:', err.message);
  }
}

export function requestLogger(req, res, next) {
  if (STATIC_RE.test(req.path)) return next();

  const start = Date.now();

  res.on('finish', async () => {
    const entry = {
      ts:     new Date().toISOString(),
      type:   'request',
      method: req.method,
      path:   req.originalUrl,
      tool:   resolveTool(req.path),
      status: res.statusCode,
      ms:     Date.now() - start,
      ip:     req.ip,
      ua:     req.headers['user-agent'] || '',
    };

    const geo = await geoLookup(req.ip);
    Object.assign(entry, geo);

    console.log(JSON.stringify(entry));
    writeToDb(entry);
  });

  next();
}

export function errorLogger(err, req, res, next) {
  const entry = {
    ts:        new Date().toISOString(),
    type:      'error',
    method:    req.method,
    path:      req.originalUrl,
    ip:        req.ip,
    status:    err.status || 500,
    error_msg: err.message,
    stack:     err.stack,
  };
  console.error(JSON.stringify(entry));
  writeToDb(entry);
  next(err);
}
