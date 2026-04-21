const TOOL_MAP = {
  '/api/tutor/chat':              'tutor',
  '/api/critique':                'interview',
  '/api/transcript':              'interview',
  '/api/podcast-review':         'podcast-reviewer',
  '/api/podcast-converter':      'podcast-converter',
  '/api/proofreader':             'proofreader',
  '/api/l3-reviewer':             'l3-reviewer',
};

const STATIC_RE = /\.(js|css|map|ico|png|jpg|jpeg|svg|woff2?|ttf|json)$/i;

function resolveTool(path) {
  for (const [prefix, name] of Object.entries(TOOL_MAP)) {
    if (path.startsWith(prefix)) return name;
  }
  return undefined;
}

export function requestLogger(req, res, next) {
  if (STATIC_RE.test(req.path)) return next();

  const start = Date.now();

  res.on('finish', () => {
    const entry = {
      ts:     new Date().toISOString(),
      type:   'request',
      method: req.method,
      path:   req.originalUrl,
      status: res.statusCode,
      ms:     Date.now() - start,
      ip:     req.ip,
      ua:     req.headers['user-agent'] || '',
    };

    const tool = resolveTool(req.path);
    if (tool) entry.tool = tool;

    console.log(JSON.stringify(entry));
  });

  next();
}

export function errorLogger(err, req, res, next) {
  console.error(JSON.stringify({
    ts:     new Date().toISOString(),
    type:   'error',
    method: req.method,
    path:   req.originalUrl,
    ip:     req.ip,
    status: err.status || 500,
    error:  err.message,
    stack:  err.stack,
  }));
  next(err);
}
