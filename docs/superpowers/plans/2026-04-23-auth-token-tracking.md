# Auth & Token Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add session-based user authentication (full site gate, admin-managed accounts, initials avatar in nav) and per-session Claude token/cost logging visible to admin and each user.

**Architecture:** express-session stores sessions in the existing PostgreSQL DB via connect-pg-simple; bcrypt hashes passwords; requireAuth middleware gates all routes after the login page is explicitly exempted. Token usage is logged to a new usage_log table by a shared helper called after every Claude API response.

**Tech Stack:** express-session, connect-pg-simple, bcrypt (3 new packages); existing PostgreSQL (pg), Anthropic SDK, Express.

**Spec:** `docs/superpowers/specs/2026-04-23-auth-token-tracking-design.md`

---

## File Map

**New files:**
- `server/middleware/auth.js` — requireAuth, requireAdmin
- `server/routes/auth.js` — POST /login, POST /logout, GET /me
- `server/routes/users.js` — admin user CRUD
- `server/routes/usage.js` — usage data endpoints
- `server/lib/usageLogger.js` — computeCost + logUsage
- `tests/usageLogger.test.js` — unit tests for computeCost
- `scripts/create-admin.js` — bootstrap first admin user
- `public/login/index.html` — split login page
- `public/my-usage/index.html` — per-user usage page

**Modified files:**
- `server/lib/db.js` — add users + usage_log table DDL
- `server/lib/claude.js` — return usage from generateCritique
- `server/index.js` — session middleware, reorder static/auth, mount new routes
- `server/routes/admin.js` — remove ADMIN_PASSWORD checks
- `server/routes/tutor.js` — logUsage after stream, remove knowledge upload password check
- `server/routes/critique.js` — logUsage after response
- `server/routes/proofreader.js` — logUsage after stream
- `server/routes/l3Reviewer.js` — logUsage after stream
- `public/css/nav.css` — avatar + user section styles
- `public/js/nav.js` — fetch /me, inject avatar + drawer user info
- `public/admin/index.html` — Users card + Usage card

---

## Task 1: Install Packages + Environment Variable

**Files:**
- Modify: `package.json` (via npm)
- Modify: `.env`

- [ ] **Step 1: Install the three new packages**

```bash
cd "/Users/timothytraviss/Library/CloudStorage/Dropbox/Claude Code/AI Playground"
npm install express-session connect-pg-simple bcrypt
```

Expected: packages added to `node_modules/` and `package.json` dependencies.

- [ ] **Step 2: Generate a SESSION_SECRET and add to .env**

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Copy the output. Open `.env` and add:
```
SESSION_SECRET=<paste the 96-char hex string here>
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "install express-session, connect-pg-simple, bcrypt"
```

---

## Task 2: DB Schema — users + usage_log Tables

**Files:**
- Modify: `server/lib/db.js`

- [ ] **Step 1: Add table creation to initDb()**

Open `server/lib/db.js`. After the `access_log` table and indexes block (after the `client.query` with the indexes), add:

```js
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
```

- [ ] **Step 2: Verify the server starts and tables are created**

```bash
npm start
```

Check logs — no DB errors. If `DATABASE_URL` is set, tables are created on startup. Stop with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add server/lib/db.js
git commit -m "add users and usage_log tables to initDb"
```

---

## Task 3: usageLogger.js + Tests

**Files:**
- Create: `server/lib/usageLogger.js`
- Create: `tests/usageLogger.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/usageLogger.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCost } from '../server/lib/usageLogger.js';

test('computeCost: sonnet — no cache', () => {
  // input: 1000 * 3.00 / 1e6 = 0.003
  // output: 500 * 15.00 / 1e6 = 0.0075
  const cost = computeCost(
    { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0 },
    'claude-sonnet-4-6'
  );
  assert.ok(Math.abs(cost - 0.0105) < 1e-9, `expected 0.0105, got ${cost}`);
});

test('computeCost: sonnet — with cache read', () => {
  // input: 500 * 3.00 / 1e6 = 0.0015
  // output: 200 * 15.00 / 1e6 = 0.003
  // cache: 40000 * 0.30 / 1e6 = 0.012
  const cost = computeCost(
    { input_tokens: 500, output_tokens: 200, cache_read_input_tokens: 40000 },
    'claude-sonnet-4-6'
  );
  assert.ok(Math.abs(cost - 0.0165) < 1e-9, `expected 0.0165, got ${cost}`);
});

test('computeCost: haiku is cheaper than sonnet for same tokens', () => {
  const usage = { input_tokens: 10000, output_tokens: 2000, cache_read_input_tokens: 0 };
  assert.ok(
    computeCost(usage, 'claude-haiku-4-5-20251001') < computeCost(usage, 'claude-sonnet-4-6')
  );
});

test('computeCost: unknown model falls back to sonnet', () => {
  const cost = computeCost(
    { input_tokens: 1000, output_tokens: 0, cache_read_input_tokens: 0 },
    'claude-unknown-xyz'
  );
  assert.ok(Math.abs(cost - 0.003) < 1e-9);
});

test('computeCost: missing fields default to zero', () => {
  assert.equal(computeCost({}, 'claude-sonnet-4-6'), 0);
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test
```

Expected: fail with `Cannot find module '../server/lib/usageLogger.js'`.

- [ ] **Step 3: Create usageLogger.js**

Create `server/lib/usageLogger.js`:

```js
import { getPool } from './db.js';

const PRICING = {
  'claude-sonnet-4-6':       { input: 3.00,  output: 15.00, cacheRead: 0.30 },
  'claude-haiku-4-5-20251001': { input: 0.80,  output:  4.00, cacheRead: 0.08 },
  'claude-opus-4-7':         { input: 15.00, output: 75.00, cacheRead: 1.50 },
};

export function computeCost(usage, model) {
  const rates = PRICING[model];
  if (!rates) {
    console.warn(`[usageLogger] Unknown model "${model}", using Sonnet pricing`);
  }
  const r = rates ?? PRICING['claude-sonnet-4-6'];
  const input     = usage.input_tokens             ?? 0;
  const output    = usage.output_tokens            ?? 0;
  const cacheRead = usage.cache_read_input_tokens  ?? 0;
  return (input * r.input + output * r.output + cacheRead * r.cacheRead) / 1_000_000;
}

export async function logUsage({ userId, tool, usage, model }) {
  if (!process.env.DATABASE_URL) return;
  const cost = computeCost(usage, model);
  try {
    await getPool().query(
      `INSERT INTO usage_log
         (user_id, tool, model, input_tokens, output_tokens, cache_read_tokens, cost_usd)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        userId ?? null,
        tool,
        model,
        usage.input_tokens            ?? 0,
        usage.output_tokens           ?? 0,
        usage.cache_read_input_tokens ?? 0,
        cost,
      ]
    );
  } catch (err) {
    console.error('[usageLogger] Failed to log usage:', err.message);
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test
```

Expected: 5 passing tests in `usageLogger.test.js`.

- [ ] **Step 5: Commit**

```bash
git add server/lib/usageLogger.js tests/usageLogger.test.js
git commit -m "add usageLogger with computeCost and logUsage"
```

---

## Task 4: Auth Middleware

**Files:**
- Create: `server/middleware/auth.js`

- [ ] **Step 1: Create auth.js**

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add server/middleware/auth.js
git commit -m "add requireAuth and requireAdmin middleware"
```

---

## Task 5: Auth Routes

**Files:**
- Create: `server/routes/auth.js`

- [ ] **Step 1: Create auth.js**

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/auth.js
git commit -m "add auth routes: login, logout, /me"
```

---

## Task 6: Wire Session + Auth into index.js

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Add imports at the top of index.js**

After the existing imports (after the `logsRouter` import line), add:

```js
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { authRouter } from './routes/auth.js';
import { requireAuth } from './middleware/auth.js';
```

- [ ] **Step 2: Add session middleware and reorder static + auth**

Find this block in index.js:
```js
app.set('trust proxy', 1);
app.use(express.json());
app.use(requestLogger);
app.use(express.static(resolve(projectRoot, 'public')));
```

Replace it with:
```js
app.set('trust proxy', 1);
app.use(express.json());
app.use(requestLogger);

// Session store
const PgStore = connectPgSimple(session);
app.use(session({
  store: new PgStore({ pool: getPool(), tableName: 'sessions', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

// Login page and auth API — served BEFORE the auth gate
app.get('/login', (_req, res) => res.redirect('/login/'));
app.use('/login', express.static(resolve(projectRoot, 'public', 'login')));
app.use('/api/auth', authRouter);

// Auth gate — everything below requires a valid session
app.use(requireAuth);

// Protected static files
app.use(express.static(resolve(projectRoot, 'public')));
```

- [ ] **Step 3: Add getPool import if not already present**

At the top of index.js, the db import should be:
```js
import { initDb, getPool } from './lib/db.js';
```

If it currently only imports `initDb`, add `getPool` to the import.

- [ ] **Step 4: Start server and verify login redirect works**

```bash
npm start
```

Open http://localhost:3000 in a browser. You should be redirected to `/login/` (which will 404 until Task 7). Stop server with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add server/index.js
git commit -m "wire session middleware and auth gate into index.js"
```

---

## Task 7: Login Page

**Files:**
- Create: `public/login/index.html`

- [ ] **Step 1: Create the login page**

Create `public/login/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sign in — Traviss.org</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fugaz+One&family=Inter:wght@400;500;600&display=swap" />
  <link rel="stylesheet" href="/shared/theme.css" />
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { min-height: 100%; margin: 0; background: var(--bg, #0d1117); color: var(--text, #e2e8f0); font-family: 'Inter', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
    body { display: flex; min-height: 100vh; }

    .login-wrap { display: flex; width: 100%; min-height: 100vh; }

    .login-form-side {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 60px 48px;
      max-width: 480px;
    }

    .login-logo { font-family: 'Fugaz One', cursive; font-size: 32px; color: var(--gold, #e8c96a); letter-spacing: 0.02em; margin-bottom: 6px; }
    .login-tagline { font-size: 14px; color: var(--text-muted, #64748b); margin-bottom: 40px; }

    .login-error {
      background: rgba(239,68,68,0.1);
      border: 1px solid rgba(239,68,68,0.25);
      color: #fca5a5;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 13px;
      margin-bottom: 16px;
      display: none;
    }
    .login-error.show { display: block; }

    .login-field { margin-bottom: 16px; }
    .login-label { display: block; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted, #64748b); margin-bottom: 6px; }
    .login-input {
      width: 100%;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      padding: 12px 14px;
      font-size: 15px;
      color: var(--text, #e2e8f0);
      outline: none;
      font-family: inherit;
      transition: border-color 0.15s;
    }
    .login-input:focus { border-color: var(--gold, #e8c96a); }

    .login-btn {
      width: 100%;
      background: var(--gold, #e8c96a);
      color: #0d1117;
      border: none;
      border-radius: 8px;
      padding: 13px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      margin-top: 8px;
      font-family: inherit;
      transition: opacity 0.15s;
    }
    .login-btn:hover { opacity: 0.9; }
    .login-btn:disabled { opacity: 0.55; cursor: not-allowed; }

    .login-icons-side {
      width: 280px;
      background: rgba(255,255,255,0.015);
      border-left: 1px solid rgba(255,255,255,0.06);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 24px;
      padding: 40px;
    }

    .icon-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; }
    .icon-cell {
      width: 56px; height: 56px;
      border-radius: 12px;
      background: rgba(232,201,106,0.07);
      border: 1px solid rgba(232,201,106,0.14);
      display: flex; align-items: center; justify-content: center;
      font-size: 24px;
    }
    .icon-label { font-size: 11px; color: var(--text-muted, #64748b); text-align: center; letter-spacing: 0.04em; }

    @media (max-width: 640px) {
      .login-icons-side { display: none; }
      .login-form-side { max-width: 100%; padding: 40px 24px; }
    }
  </style>
</head>
<body>
  <div class="login-wrap">
    <div class="login-form-side">
      <div class="login-logo">Traviss.org</div>
      <div class="login-tagline">Sign in to continue</div>

      <div class="login-error" id="err"></div>

      <div class="login-field">
        <label class="login-label" for="username">Username</label>
        <input class="login-input" type="text" id="username" autocomplete="username"
               autocapitalize="none" autocorrect="off" spellcheck="false" />
      </div>
      <div class="login-field">
        <label class="login-label" for="password">Password</label>
        <input class="login-input" type="password" id="password" autocomplete="current-password" />
      </div>
      <button class="login-btn" id="login-btn">Sign in</button>
    </div>

    <div class="login-icons-side">
      <div class="icon-grid">
        <div class="icon-cell">🎤</div>
        <div class="icon-cell">📄</div>
        <div class="icon-cell">🎙️</div>
        <div class="icon-cell">✍️</div>
        <div class="icon-cell">🔍</div>
        <div class="icon-cell">📊</div>
      </div>
      <div class="icon-label">AI Playground for NZ Police</div>
    </div>
  </div>

  <script src="/shared/theme.js"></script>
  <script>
    const btn = document.getElementById('login-btn');
    const errEl = document.getElementById('err');
    const next = new URLSearchParams(location.search).get('next') || '/';

    function showErr(msg) { errEl.textContent = msg; errEl.classList.add('show'); }

    async function login() {
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      if (!username || !password) { showErr('Enter your username and password.'); return; }
      btn.disabled = true; btn.textContent = 'Signing in…'; errEl.classList.remove('show');
      try {
        const r = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const d = await r.json();
        if (r.ok) {
          window.location.href = next.startsWith('/') ? next : '/';
        } else {
          showErr(d.error || 'Login failed.');
          btn.disabled = false; btn.textContent = 'Sign in';
        }
      } catch {
        showErr('Network error — please try again.');
        btn.disabled = false; btn.textContent = 'Sign in';
      }
    }

    btn.addEventListener('click', login);
    document.addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
  </script>
</body>
</html>
```

- [ ] **Step 2: Start server, open http://localhost:3000, verify redirect to /login/ and the login page renders**

```bash
npm start
```

Navigate to http://localhost:3000. Should redirect to `/login/` and display the login form.

- [ ] **Step 3: Commit**

```bash
git add public/login/index.html
git commit -m "add login page (split layout, fetch-based)"
```

---

## Task 8: Bootstrap Admin User

**Files:**
- Create: `scripts/create-admin.js`

- [ ] **Step 1: Create the bootstrap script**

```js
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
```

- [ ] **Step 2: Run it to create your admin account**

```bash
node scripts/create-admin.js timtraviss "Tim Traviss" <your-chosen-password>
```

Expected output: `✓ Admin user ready: { id: 1, username: 'timtraviss', display_name: 'Tim Traviss', role: 'Admin' }`

- [ ] **Step 3: Start server and sign in**

```bash
npm start
```

Open http://localhost:3000. You'll be redirected to `/login/`. Sign in with the credentials just created. You should land on the home page.

- [ ] **Step 4: Commit**

```bash
git add scripts/create-admin.js
git commit -m "add create-admin bootstrap script"
```

---

## Task 9: User CRUD Routes

**Files:**
- Create: `server/routes/users.js`
- Modify: `server/index.js`

- [ ] **Step 1: Create users.js**

```js
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
```

- [ ] **Step 2: Mount usersRouter in index.js**

In `server/index.js`, add at the top with other route imports:
```js
import { usersRouter } from './routes/users.js';
import { requireAdmin } from './middleware/auth.js';
```

Then add after the other `app.use('/api/...')` lines (but after `app.use(requireAuth)`):
```js
app.use('/api/admin/users', requireAdmin, usersRouter);
```

- [ ] **Step 3: Commit**

```bash
git add server/routes/users.js server/index.js
git commit -m "add user CRUD routes at /api/admin/users"
```

---

## Task 10: Update Existing Admin Routes

Remove ADMIN_PASSWORD checks from `admin.js` and `tutor.js` — session auth now covers these.

**Files:**
- Modify: `server/routes/admin.js`
- Modify: `server/routes/tutor.js`
- Modify: `server/index.js`

- [ ] **Step 1: Update admin.js — remove password check, remove ADMIN_PASSWORD guard**

Replace the contents of `server/routes/admin.js` with:

```js
import { Router } from 'express';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENARIO_PATH = resolve(__dirname, '../data/scenarios/catherine.md');

function parseScenario(md) {
  const sections = {};
  const parts = md.split(/^## /m);
  for (const part of parts) {
    const nl = part.indexOf('\n');
    if (nl === -1) continue;
    sections[part.slice(0, nl).trim()] = part.slice(nl + 1).trim();
  }
  return {
    briefing: sections['Scenario Briefing'] || '',
    task: sections['Your Task'] || '',
  };
}

export const adminRouter = Router();

// GET /api/admin/scenario — available to all authenticated users (read-only)
adminRouter.get('/scenario', (_req, res) => {
  try {
    res.json(parseScenario(readFileSync(SCENARIO_PATH, 'utf8')));
  } catch (err) {
    res.status(500).json({ error: 'Could not read scenario file: ' + err.message });
  }
});

// POST /api/admin/scenario — Admin only (enforced by requireAdmin in index.js)
adminRouter.post('/scenario', (req, res) => {
  const { briefing, task } = req.body || {};
  if (typeof briefing !== 'string' || typeof task !== 'string') {
    return res.status(400).json({ error: 'briefing and task are required strings.' });
  }
  const md = `## Scenario Briefing\n${briefing.trim()}\n\n## Your Task\n${task.trim()}\n`;
  try {
    writeFileSync(SCENARIO_PATH, md, 'utf8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not write scenario file: ' + err.message });
  }
});
```

- [ ] **Step 2: Update index.js — apply requireAdmin to /api/admin**

Find the line:
```js
app.use('/api/admin', adminRouter);
```

Replace with:
```js
app.use('/api/admin', requireAdmin, adminRouter);
```

- [ ] **Step 3: Remove ADMIN_PASSWORD checks from tutor.js knowledge endpoints**

In `server/routes/tutor.js`, find the upload handler. Remove the ADMIN_PASSWORD check block:
```js
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'ADMIN_PASSWORD not configured.' });
  }
  const password = req.body.password;
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }
```

Do the same in the DELETE handler. The knowledge endpoints are now protected by requireAdmin since they're under `/api/tutor/knowledge/*` — add requireAdmin to those routes in index.js:

Find:
```js
app.use('/api/tutor', tutorRouter);
```

The knowledge sub-routes need admin. The simplest approach: in `tutor.js` import and use requireAdmin directly on the knowledge routes:

At the top of `server/routes/tutor.js`, add:
```js
import { requireAdmin } from '../middleware/auth.js';
```

Then on the upload route:
```js
tutorRouter.post('/knowledge/upload', requireAdmin, (req, res, next) => {
```

And the delete route:
```js
tutorRouter.delete('/knowledge/:id', requireAdmin, (req, res) => {
```

- [ ] **Step 4: Update admin page frontend — remove password field from scenario and knowledge forms**

The admin page HTML at `public/admin/index.html` currently has password inputs. These are no longer needed. Find and remove:
- Any `<input type="password">` with id like `admin-password` or similar
- Any JS that reads a password variable and sends it in request bodies
- Remove `password` from fetch body in scenario save and knowledge upload/delete calls

- [ ] **Step 5: Start server, sign in, navigate to /admin, verify scenario save works without password prompt**

```bash
npm start
```

Sign in as admin. Navigate to http://localhost:3000/admin. Edit the scenario briefing and save — should work without any password prompt.

- [ ] **Step 6: Commit**

```bash
git add server/routes/admin.js server/routes/tutor.js server/index.js public/admin/index.html
git commit -m "replace ADMIN_PASSWORD checks with session-based requireAdmin"
```

---

## Task 11: Admin Users Card (Frontend)

**Files:**
- Modify: `public/admin/index.html`

- [ ] **Step 1: Add Users card HTML to the admin page**

In `public/admin/index.html`, add a new card section after the existing cards. Find the closing `</main>` or the card grid container and insert:

```html
<!-- ── Users card ─────────────────────────────────────── -->
<section class="card" id="users-card">
  <div class="card-header">
    <h2 class="card-title">Users</h2>
    <button class="btn-primary" id="add-user-btn">+ Add User</button>
  </div>

  <table class="users-table" id="users-table">
    <thead>
      <tr>
        <th>Username</th>
        <th>Display Name</th>
        <th>Role</th>
        <th>Last Login</th>
        <th></th>
      </tr>
    </thead>
    <tbody id="users-tbody">
      <tr><td colspan="5" class="table-loading">Loading…</td></tr>
    </tbody>
  </table>
</section>

<!-- Add User modal -->
<div class="modal-overlay" id="add-user-modal" style="display:none">
  <div class="modal">
    <h3>Add User</h3>
    <label class="form-label">Username<input class="form-input" type="text" id="new-username" autocapitalize="none" /></label>
    <label class="form-label">Display Name<input class="form-input" type="text" id="new-display-name" /></label>
    <label class="form-label">Password<input class="form-input" type="password" id="new-password" /></label>
    <label class="form-label">Role<input class="form-input" type="text" id="new-role" placeholder="Trainee" /></label>
    <div class="modal-error" id="add-user-error" style="display:none"></div>
    <div class="modal-actions">
      <button class="btn-ghost" id="add-user-cancel">Cancel</button>
      <button class="btn-primary" id="add-user-submit">Add User</button>
    </div>
  </div>
</div>

<!-- Reset Password modal -->
<div class="modal-overlay" id="reset-pw-modal" style="display:none">
  <div class="modal">
    <h3>Reset Password</h3>
    <p class="modal-subtitle" id="reset-pw-name"></p>
    <label class="form-label">New Password<input class="form-input" type="password" id="reset-pw-input" /></label>
    <div class="modal-error" id="reset-pw-error" style="display:none"></div>
    <div class="modal-actions">
      <button class="btn-ghost" id="reset-pw-cancel">Cancel</button>
      <button class="btn-primary" id="reset-pw-submit">Reset</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add CSS for the Users card (in the admin page's style block or admin CSS)**

```css
.users-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.users-table th { text-align: left; padding: 8px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted, #64748b); border-bottom: 1px solid var(--border, #21262d); }
.users-table td { padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.04); vertical-align: middle; }
.users-table tr:last-child td { border-bottom: none; }
.role-pill { display: inline-block; font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 100px; text-transform: uppercase; letter-spacing: 0.06em; }
.role-pill.admin { background: rgba(232,201,106,0.12); border: 1px solid rgba(232,201,106,0.25); color: var(--gold, #e8c96a); }
.role-pill.other { background: rgba(100,116,139,0.1); border: 1px solid rgba(100,116,139,0.2); color: var(--text-muted, #94a3b8); }
.btn-row { display: flex; gap: 8px; }
.table-loading { text-align: center; color: var(--text-muted, #64748b); padding: 24px; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 2000; }
.modal { background: var(--surface, #161b22); border: 1px solid var(--border, #21262d); border-radius: 12px; padding: 28px; width: 100%; max-width: 400px; }
.modal h3 { margin: 0 0 16px; font-size: 16px; }
.modal-subtitle { margin: -8px 0 16px; color: var(--text-muted, #64748b); font-size: 13px; }
.form-label { display: flex; flex-direction: column; gap: 5px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-muted, #64748b); margin-bottom: 12px; }
.modal-error { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25); color: #fca5a5; border-radius: 6px; padding: 8px 12px; font-size: 13px; margin-bottom: 12px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
```

- [ ] **Step 3: Add JavaScript for the Users card**

In the admin page's `<script>` block, add:

```js
// ── Users card ────────────────────────────────────────────────────
let resetTargetId = null;

function relativeTime(iso) {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-NZ');
}

async function loadUsers() {
  try {
    const r = await fetch('/api/admin/users');
    const users = await r.json();
    const tbody = document.getElementById('users-tbody');
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="table-loading">No users yet.</td></tr>';
      return;
    }
    tbody.innerHTML = users.map(u => `
      <tr data-id="${u.id}">
        <td>${u.username}</td>
        <td>${u.display_name}</td>
        <td><span class="role-pill ${u.role === 'Admin' ? 'admin' : 'other'}">${u.role}</span></td>
        <td>${relativeTime(u.last_login)}</td>
        <td>
          <div class="btn-row">
            <button class="btn-ghost btn-sm" onclick="openResetPw(${u.id}, '${u.display_name.replace(/'/g, "\\'")}')">Reset pw</button>
            <button class="btn-ghost btn-sm btn-danger" onclick="deleteUser(${u.id}, '${u.username}')">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    document.getElementById('users-tbody').innerHTML =
      `<tr><td colspan="5" class="table-loading">Error loading users: ${err.message}</td></tr>`;
  }
}

document.getElementById('add-user-btn').addEventListener('click', () => {
  document.getElementById('add-user-modal').style.display = 'flex';
  document.getElementById('add-user-error').style.display = 'none';
  ['new-username','new-display-name','new-password','new-role'].forEach(id => {
    document.getElementById(id).value = '';
  });
});

document.getElementById('add-user-cancel').addEventListener('click', () => {
  document.getElementById('add-user-modal').style.display = 'none';
});

document.getElementById('add-user-submit').addEventListener('click', async () => {
  const username = document.getElementById('new-username').value.trim();
  const displayName = document.getElementById('new-display-name').value.trim();
  const password = document.getElementById('new-password').value;
  const role = document.getElementById('new-role').value.trim() || 'Trainee';
  const errEl = document.getElementById('add-user-error');
  errEl.style.display = 'none';

  const r = await fetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, displayName, password, role }),
  });
  const d = await r.json();
  if (r.ok) {
    document.getElementById('add-user-modal').style.display = 'none';
    loadUsers();
  } else {
    errEl.textContent = d.error;
    errEl.style.display = 'block';
  }
});

function openResetPw(userId, displayName) {
  resetTargetId = userId;
  document.getElementById('reset-pw-name').textContent = `Resetting password for ${displayName}`;
  document.getElementById('reset-pw-input').value = '';
  document.getElementById('reset-pw-error').style.display = 'none';
  document.getElementById('reset-pw-modal').style.display = 'flex';
}

document.getElementById('reset-pw-cancel').addEventListener('click', () => {
  document.getElementById('reset-pw-modal').style.display = 'none';
});

document.getElementById('reset-pw-submit').addEventListener('click', async () => {
  const password = document.getElementById('reset-pw-input').value;
  const errEl = document.getElementById('reset-pw-error');
  const r = await fetch(`/api/admin/users/${resetTargetId}/password`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const d = await r.json();
  if (r.ok) {
    document.getElementById('reset-pw-modal').style.display = 'none';
  } else {
    errEl.textContent = d.error;
    errEl.style.display = 'block';
  }
});

async function deleteUser(userId, username) {
  if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
  const r = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
  const d = await r.json();
  if (r.ok) loadUsers();
  else alert(d.error);
}

loadUsers();
```

- [ ] **Step 4: Test — navigate to /admin, verify the Users card loads and add/reset/delete work**

- [ ] **Step 5: Commit**

```bash
git add public/admin/index.html
git commit -m "add Users card to admin page"
```

---

## Task 12: Nav Avatar + User Section

> **This is the auth milestone.** After this task, authentication is complete and shippable.

**Files:**
- Modify: `public/css/nav.css`
- Modify: `public/js/nav.js`

- [ ] **Step 1: Add avatar and user section styles to nav.css**

Append to `public/css/nav.css`:

```css
/* ── Auth: avatar in nav bar ── */
.nav-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(232,201,106,0.15);
  border: 1px solid rgba(232,201,106,0.35);
  color: var(--nav-accent, #e8c96a);
  font-size: 13px;
  font-weight: 700;
  font-family: 'Inter', system-ui, sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin-left: auto;
  flex-shrink: 0;
  transition: border-color 0.15s;
  user-select: none;
}
.nav-avatar:hover { border-color: var(--nav-accent, #e8c96a); }

/* ── Auth: user section in drawer ── */
.nav-user-section {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--nav-border, rgba(255,255,255,0.08));
}
.nav-user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(232,201,106,0.15);
  border: 1px solid rgba(232,201,106,0.3);
  color: var(--nav-accent, #e8c96a);
  font-size: 14px;
  font-weight: 700;
  font-family: 'Inter', system-ui, sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.nav-user-meta { flex: 1; min-width: 0; }
.nav-user-name { font-size: 13px; font-weight: 600; color: var(--nav-text, #e2e8f0); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nav-user-role { font-size: 11px; color: var(--nav-muted, #64748b); }
.nav-signout-btn {
  background: none;
  border: 1px solid var(--nav-border, rgba(255,255,255,0.08));
  border-radius: 5px;
  color: var(--nav-muted, #64748b);
  font-size: 11px;
  padding: 4px 8px;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  transition: border-color 0.15s, color 0.15s;
}
.nav-signout-btn:hover { border-color: #ef4444; color: #fca5a5; }

/* light mode nav-avatar and user section */
body.light .nav-avatar { background: rgba(160,120,0,0.1); border-color: rgba(160,120,0,0.3); color: var(--gold, #a07800); }
body.light .nav-user-avatar { background: rgba(160,120,0,0.1); border-color: rgba(160,120,0,0.25); color: var(--gold, #a07800); }
body.light .nav-signout-btn { border-color: rgba(0,0,0,0.1); }
body.light .nav-signout-btn:hover { border-color: #ef4444; color: #dc2626; }
```

- [ ] **Step 2: Update nav.js — add initUser() function**

Append to `public/js/nav.js` (after the closing `})();` of the existing IIFE):

```js
// ── Auth: load current user, inject avatar and drawer user section ──
(async function initUser() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.status === 401) { window.location.href = '/login/?next=' + encodeURIComponent(location.pathname + location.search); return; }
    if (!res.ok) return;
    const user = await res.json();

    const initial = (user.displayName || user.username)[0].toUpperCase();

    // 1. Avatar in nav bar
    const nav = document.getElementById('site-nav');
    if (nav) {
      const avatar = document.createElement('div');
      avatar.className = 'nav-avatar';
      avatar.title = user.displayName;
      avatar.textContent = initial;
      avatar.addEventListener('click', () => document.getElementById('hamburger')?.click());
      nav.appendChild(avatar);
    }

    // 2. User section in drawer (after .nav-logo)
    const drawer = document.getElementById('nav-drawer');
    if (drawer) {
      const section = document.createElement('div');
      section.className = 'nav-user-section';
      section.innerHTML = `
        <div class="nav-user-avatar">${initial}</div>
        <div class="nav-user-meta">
          <div class="nav-user-name">${user.displayName}</div>
          <div class="nav-user-role">${user.role} · ${user.username}</div>
        </div>
        <button class="nav-signout-btn" id="nav-signout">Sign out</button>
      `;
      const logo = drawer.querySelector('.nav-logo');
      if (logo) logo.after(section); else drawer.prepend(section);

      document.getElementById('nav-signout').addEventListener('click', async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/login/';
      });

      // 3. Hide admin link for non-admins, add My Usage link
      const links = drawer.querySelector('.nav-links');
      if (links) {
        if (user.role !== 'Admin') {
          links.querySelector('a[href="/admin"]')?.closest('li')?.remove();
        }
        const li = document.createElement('li');
        li.innerHTML = '<a href="/my-usage/">My Usage</a>';
        links.appendChild(li);
        li.querySelector('a').addEventListener('click', () => {
          drawer.classList.remove('open');
        });
      }
    }
  } catch {
    // network error — don't break the page
  }
})();
```

- [ ] **Step 3: Test — sign in, verify avatar appears in nav bar, open hamburger, verify name + role + Sign out appear**

- [ ] **Step 4: Commit**

```bash
git add public/css/nav.css public/js/nav.js
git commit -m "add nav avatar and drawer user section with sign out"
```

> **AUTH MILESTONE:** Users can now sign in, all pages are protected, admin role is enforced, and the nav shows who's logged in. This is shippable independently.

---

## Task 13: Wire logUsage into Claude Routes

**Files:**
- Modify: `server/lib/claude.js`
- Modify: `server/routes/critique.js`
- Modify: `server/routes/tutor.js`
- Modify: `server/routes/proofreader.js`
- Modify: `server/routes/l3Reviewer.js`

- [ ] **Step 1: Update generateCritique in claude.js to return usage**

In `server/lib/claude.js`, find the return statement at the end of `generateCritique`:
```js
  try {
    return JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(`Claude returned invalid JSON: ${err.message}\n\nRaw response:\n${content.substring(0, 500)}`);
  }
```

Replace with:
```js
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(`Claude returned invalid JSON: ${err.message}\n\nRaw response:\n${content.substring(0, 500)}`);
  }
  return { critique: parsed, usage: response.usage };
```

- [ ] **Step 2: Update critique.js to destructure and call logUsage**

In `server/routes/critique.js`, add import at the top:
```js
import { logUsage } from '../lib/usageLogger.js';
```

Find:
```js
    const critique = await generateCritique(formattedTranscript, witness);

    res.json({
      ...critique,
```

Replace with:
```js
    const { critique, usage } = await generateCritique(formattedTranscript, witness);
    logUsage({ userId: req.user?.id, tool: 'peace-critique', usage, model: 'claude-sonnet-4-6' }).catch(() => {});

    res.json({
      ...critique,
```

- [ ] **Step 3: Update tutor.js to capture usage after stream**

In `server/routes/tutor.js`, add import at the top:
```js
import { logUsage } from '../lib/usageLogger.js';
```

Find the streaming block:
```js
  try {
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemBlocks,
      messages: safeMessages,
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta?.type === 'text_delta'
      ) {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
```

Replace with:
```js
  try {
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemBlocks,
      messages: safeMessages,
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta?.type === 'text_delta'
      ) {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    const finalMsg = await stream.finalMessage();
    logUsage({ userId: req.user?.id, tool: 'ddp-tutor', usage: finalMsg.usage, model: 'claude-sonnet-4-6' }).catch(() => {});

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
```

- [ ] **Step 4: Update proofreader.js to capture usage after stream**

In `server/routes/proofreader.js`, add import at the top:
```js
import { logUsage } from '../lib/usageLogger.js';
```

Find the section where the SSE stream ends (look for `res.write('data: [DONE]')` or similar completion). Just before that completion write, add:

```js
    const finalMsg = await stream.finalMessage();
    logUsage({ userId: req.user?.id, tool: 'proofreader', usage: finalMsg.usage, model: 'claude-sonnet-4-6' }).catch(() => {});
```

(Read `server/routes/proofreader.js` to find the exact location of the stream completion before adding this line.)

- [ ] **Step 5: Update l3Reviewer.js to capture usage after stream**

In `server/routes/l3Reviewer.js`, add import at the top:
```js
import { logUsage } from '../lib/usageLogger.js';
```

Find the streaming completion point (just before the `data: done` SSE write) and add:

```js
    const finalMsg = await stream.finalMessage();
    logUsage({ userId: req.user?.id, tool: 'l3-reviewer', usage: finalMsg.usage, model: 'claude-sonnet-4-6' }).catch(() => {});
```

(Read `server/routes/l3Reviewer.js` to find the exact location before adding.)

- [ ] **Step 6: Test — use the DDP Tutor and PEACE critique, check the usage_log table**

```bash
npm start
```

Sign in, run a DDP Tutor session. Then check the DB:

```bash
node -e "
import dotenv from 'dotenv'; dotenv.config();
import { getPool } from './server/lib/db.js';
const { rows } = await getPool().query('SELECT * FROM usage_log ORDER BY ts DESC LIMIT 5');
console.table(rows);
await getPool().end();
"
```

Expected: rows with tool `ddp-tutor`, non-zero token counts, non-zero cost_usd.

- [ ] **Step 7: Commit**

```bash
git add server/lib/claude.js server/routes/critique.js server/routes/tutor.js \
        server/routes/proofreader.js server/routes/l3Reviewer.js
git commit -m "log Claude token usage after each API call"
```

---

## Task 14: Usage API Routes

**Files:**
- Create: `server/routes/usage.js`
- Modify: `server/index.js`

- [ ] **Step 1: Create usage.js**

```js
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
```

- [ ] **Step 2: Mount usageRouter in index.js**

Add import at the top of `server/index.js`:
```js
import { usageRouter } from './routes/usage.js';
```

Add after the other route registrations (after `app.use(requireAuth)`):
```js
app.use('/api/usage', usageRouter);
```

- [ ] **Step 3: Test the endpoints**

```bash
npm start
```

After signing in, in browser console or curl:
```bash
curl -s http://localhost:3000/api/usage/me \
  --cookie "connect.sid=<your-session-cookie>" | node -e "process.stdin|>(d=>console.log(JSON.stringify(JSON.parse(d),null,2)))"
```

Or simply visit http://localhost:3000/api/usage/me in the browser while logged in. Should return JSON with `summary`, `byTool`, `log` arrays.

- [ ] **Step 4: Commit**

```bash
git add server/routes/usage.js server/index.js
git commit -m "add usage API routes: /api/usage/admin and /api/usage/me"
```

---

## Task 15: Admin Usage Card

**Files:**
- Modify: `public/admin/index.html`

- [ ] **Step 1: Add Usage card HTML**

In `public/admin/index.html`, add after the Users card:

```html
<!-- ── Usage card ──────────────────────────────────────── -->
<section class="card" id="usage-card">
  <div class="card-header">
    <h2 class="card-title">Usage & Cost</h2>
    <div style="display:flex;gap:8px;align-items:center">
      <select class="form-select-sm" id="usage-period">
        <option value="month">This month</option>
        <option value="week">This week</option>
        <option value="all">All time</option>
      </select>
    </div>
  </div>

  <!-- Summary pills -->
  <div class="usage-pills" id="usage-pills">
    <div class="usage-pill"><div class="usage-pill-val" id="up-cost">—</div><div class="usage-pill-label">Total cost</div></div>
    <div class="usage-pill"><div class="usage-pill-val" id="up-tokens">—</div><div class="usage-pill-label">Tokens</div></div>
    <div class="usage-pill"><div class="usage-pill-val" id="up-users">—</div><div class="usage-pill-label">Active users</div></div>
    <div class="usage-pill"><div class="usage-pill-val" id="up-sessions">—</div><div class="usage-pill-label">Sessions</div></div>
  </div>

  <!-- Tabs -->
  <div class="tab-row">
    <button class="tab-btn active" data-tab="summary">Summary</button>
    <button class="tab-btn" data-tab="log">Session Log</button>
  </div>

  <!-- Summary tab -->
  <div id="usage-tab-summary">
    <div class="user-cards" id="usage-by-user"></div>
  </div>

  <!-- Log tab -->
  <div id="usage-tab-log" style="display:none">
    <table class="users-table" id="usage-log-table">
      <thead><tr>
        <th>User</th><th>Tool</th><th>Model</th><th>Time</th>
        <th>Tokens (in/out/cache)</th><th>Cost</th>
      </tr></thead>
      <tbody id="usage-log-tbody"><tr><td colspan="6" class="table-loading">Loading…</td></tr></tbody>
    </table>
    <div class="pagination" id="usage-pagination"></div>
  </div>
</section>
```

- [ ] **Step 2: Add CSS for the usage card**

```css
.usage-pills { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin-bottom: 20px; }
.usage-pill { background: var(--surface, #161b22); border: 1px solid var(--border, #21262d); border-radius: 8px; padding: 14px; text-align: center; }
.usage-pill-val { font-size: 20px; font-weight: 700; color: var(--gold, #e8c96a); }
.usage-pill-label { font-size: 11px; color: var(--text-muted, #64748b); margin-top: 2px; }
.tab-row { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 1px solid var(--border, #21262d); padding-bottom: 8px; }
.tab-btn { background: none; border: none; color: var(--text-muted, #64748b); font-size: 13px; font-weight: 500; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-family: inherit; }
.tab-btn.active { background: rgba(232,201,106,0.1); color: var(--gold, #e8c96a); }
.user-cards { display: flex; flex-direction: column; gap: 8px; }
.user-usage-card { background: var(--surface, #161b22); border: 1px solid var(--border, #21262d); border-radius: 8px; padding: 12px 16px; display: flex; align-items: center; gap: 12px; cursor: pointer; transition: border-color 0.15s; }
.user-usage-card:hover { border-color: rgba(232,201,106,0.3); }
.user-usage-avatar { width: 32px; height: 32px; border-radius: 50%; background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3); color: #818cf8; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.user-usage-meta { flex: 1; }
.user-usage-name { font-size: 13px; font-weight: 600; }
.user-usage-sub { font-size: 11px; color: var(--text-muted, #64748b); }
.user-usage-cost { text-align: right; }
.user-usage-cost-val { font-size: 15px; font-weight: 700; color: var(--gold, #e8c96a); }
.user-usage-cost-tokens { font-size: 11px; color: var(--text-muted, #64748b); }
.form-select-sm { background: var(--surface, #161b22); border: 1px solid var(--border, #21262d); color: var(--text, #e2e8f0); border-radius: 6px; padding: 4px 8px; font-size: 12px; font-family: inherit; }
.pagination { display: flex; gap: 6px; justify-content: center; margin-top: 12px; }
.page-btn { background: var(--surface, #161b22); border: 1px solid var(--border, #21262d); color: var(--text-muted, #64748b); border-radius: 5px; padding: 4px 10px; cursor: pointer; font-size: 12px; font-family: inherit; }
.page-btn.active { border-color: var(--gold, #e8c96a); color: var(--gold, #e8c96a); }
```

- [ ] **Step 3: Add JavaScript for the usage card**

```js
// ── Usage card ────────────────────────────────────────────────────
let usagePage = 1;
let activeUserId = null;

function fmtCost(v) { return '$' + Number(v).toFixed(4); }
function fmtTokens(v) {
  const n = Number(v);
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
}
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-NZ') + ' ' + d.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' });
}

async function loadUsage() {
  const period = document.getElementById('usage-period').value;
  const params = new URLSearchParams({ period, page: usagePage });
  if (activeUserId) params.set('userId', activeUserId);
  try {
    const r = await fetch('/api/usage/admin?' + params);
    const d = await r.json();

    // Pills
    document.getElementById('up-cost').textContent = fmtCost(d.summary.total_cost);
    document.getElementById('up-tokens').textContent = fmtTokens(d.summary.total_tokens);
    document.getElementById('up-users').textContent = d.summary.active_users;
    document.getElementById('up-sessions').textContent = d.summary.sessions;

    // By-user cards
    const byUserEl = document.getElementById('usage-by-user');
    byUserEl.innerHTML = d.byUser.map(u => `
      <div class="user-usage-card" onclick="filterByUser(${u.id})">
        <div class="user-usage-avatar">${(u.display_name||u.username)[0].toUpperCase()}</div>
        <div class="user-usage-meta">
          <div class="user-usage-name">${u.display_name}</div>
          <div class="user-usage-sub">${u.sessions} sessions · ${u.top_tool || 'various'}</div>
        </div>
        <div class="user-usage-cost">
          <div class="user-usage-cost-val">${fmtCost(u.cost)}</div>
          <div class="user-usage-cost-tokens">${fmtTokens(u.tokens)} tokens</div>
        </div>
      </div>
    `).join('') || '<p style="color:var(--text-muted,#64748b);text-align:center;padding:24px">No usage data yet.</p>';

    // Log table
    const tbody = document.getElementById('usage-log-tbody');
    tbody.innerHTML = d.log.map(row => `
      <tr>
        <td>${row.username || '—'}</td>
        <td>${row.tool}</td>
        <td><span style="font-size:11px;background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:4px">${row.model}</span></td>
        <td style="font-size:12px;color:var(--text-muted,#64748b)">${fmtTime(row.ts)}</td>
        <td style="font-size:12px;color:var(--text-muted,#64748b)">${row.input_tokens} / ${row.output_tokens} / ${row.cache_read_tokens}</td>
        <td style="color:var(--gold,#e8c96a)">${fmtCost(row.cost_usd)}</td>
      </tr>
    `).join('') || '<tr><td colspan="6" class="table-loading">No sessions.</td></tr>';

    // Pagination
    const pages = Math.ceil(d.total / d.limit);
    const pagEl = document.getElementById('usage-pagination');
    pagEl.innerHTML = Array.from({ length: Math.min(pages, 10) }, (_, i) =>
      `<button class="page-btn${i+1 === usagePage ? ' active' : ''}" onclick="goPage(${i+1})">${i+1}</button>`
    ).join('');
  } catch (err) {
    console.error('Usage load error', err);
  }
}

function filterByUser(userId) {
  activeUserId = activeUserId === userId ? null : userId;
  usagePage = 1;
  switchTab('log');
  loadUsage();
}

function goPage(p) { usagePage = p; loadUsage(); }

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.getElementById('usage-tab-summary').style.display = name === 'summary' ? '' : 'none';
  document.getElementById('usage-tab-log').style.display = name === 'log' ? '' : 'none';
}

document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
document.getElementById('usage-period').addEventListener('change', () => { usagePage = 1; loadUsage(); });

loadUsage();
```

- [ ] **Step 4: Test — navigate to /admin, verify Usage card shows pills and user cards, tab switching works**

- [ ] **Step 5: Commit**

```bash
git add public/admin/index.html
git commit -m "add Usage card to admin page with summary and session log"
```

---

## Task 16: My Usage Page

**Files:**
- Create: `public/my-usage/index.html`
- Modify: `server/index.js`

- [ ] **Step 1: Add /my-usage route to index.js**

In `server/index.js`, with the other page routes (after `app.use(requireAuth)`), add:

```js
app.get('/my-usage', (_req, res) => res.redirect('/my-usage/'));
app.get('/my-usage/', (_req, res) =>
  res.sendFile(resolve(projectRoot, 'public', 'my-usage', 'index.html')));
```

- [ ] **Step 2: Create public/my-usage/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My Usage — Traviss.org</title>
  <link rel="stylesheet" href="/css/nav.css" />
  <link rel="stylesheet" href="/shared/theme.css" />
  <style>
    html, body { min-height: 100%; margin: 0; background: var(--bg, #0d1117); color: var(--text, #e2e8f0); font-family: 'Inter', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
    .page { max-width: 860px; margin: 0 auto; padding: 40px 24px 60px; }
    h1 { font-family: 'Fugaz One', cursive; font-size: 28px; color: var(--gold, #e8c96a); margin: 0 0 4px; font-weight: 400; }
    .subtitle { font-size: 14px; color: var(--text-muted, #64748b); margin: 0 0 32px; }
    .card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 24px; margin-bottom: 20px; }
    .card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
    .card-title { font-size: 15px; font-weight: 600; margin: 0; }
    .pills { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; margin-bottom: 20px; }
    .pill { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 14px; text-align: center; }
    .pill-val { font-size: 20px; font-weight: 700; color: var(--gold, #e8c96a); }
    .pill-label { font-size: 11px; color: var(--text-muted, #64748b); margin-top: 2px; }
    .bar-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .bar-label { width: 110px; font-size: 12px; color: var(--text-muted, #64748b); }
    .bar-track { flex: 1; background: rgba(255,255,255,0.06); border-radius: 4px; height: 7px; overflow: hidden; }
    .bar-fill { height: 100%; background: var(--gold, #e8c96a); border-radius: 4px; }
    .bar-cost { width: 50px; text-align: right; font-size: 12px; color: var(--text-muted, #94a3b8); }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 8px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted, #64748b); border-bottom: 1px solid rgba(255,255,255,0.08); }
    td { padding: 9px 10px; border-bottom: 1px solid rgba(255,255,255,0.04); }
    tr:last-child td { border-bottom: none; }
    .period-sel { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); color: var(--text, #e2e8f0); border-radius: 6px; padding: 4px 8px; font-size: 12px; font-family: inherit; }
    .pagination { display: flex; gap: 6px; justify-content: center; margin-top: 12px; }
    .page-btn { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); color: var(--text-muted, #64748b); border-radius: 5px; padding: 4px 10px; cursor: pointer; font-size: 12px; font-family: inherit; }
    .page-btn.active { border-color: var(--gold, #e8c96a); color: var(--gold, #e8c96a); }
    .empty { text-align: center; color: var(--text-muted, #64748b); padding: 32px; font-size: 14px; }
  </style>
</head>
<body>
  <nav class="site-nav" id="site-nav">
    <button class="hamburger" id="hamburger" aria-label="Menu">
      <span></span><span></span><span></span>
    </button>
    <div class="nav-drawer" id="nav-drawer">
      <div class="nav-logo"><a href="/">Traviss.org</a></div>
      <ul class="nav-links">
        <li><a href="/">Home</a></li>
        <li><a href="/tutor/">DDP Tutor</a></li>
        <li><a href="/interview/">P.E.A.C.E. Interview Tutor</a></li>
        <li><a href="/podcast-reviewer/">Podcast Reviewer</a></li>
        <li><a href="/podcast-converter/">Podcast Converter</a></li>
        <li><a href="/proofreader/">Module Proofreader</a></li>
        <li><a href="/l3-reviewer/">L3 Interview Reviewer</a></li>
        <li><a href="/my-usage/" class="active">My Usage</a></li>
        <li style="margin-top:12px;border-top:1px solid rgba(255,255,255,0.08);padding-top:12px"><a href="/admin">Admin</a></li>
      </ul>
    </div>
    <div class="nav-overlay" id="nav-overlay"></div>
  </nav>

  <div class="page">
    <h1>My Usage</h1>
    <p class="subtitle" id="user-subtitle">Your AI token usage and estimated cost</p>

    <div class="card">
      <div class="card-header">
        <span class="card-title">Overview</span>
        <select class="period-sel" id="period">
          <option value="month">This month</option>
          <option value="week">This week</option>
          <option value="all">All time</option>
        </select>
      </div>
      <div class="pills">
        <div class="pill"><div class="pill-val" id="p-cost">—</div><div class="pill-label">Total cost</div></div>
        <div class="pill"><div class="pill-val" id="p-tokens">—</div><div class="pill-label">Tokens used</div></div>
        <div class="pill"><div class="pill-val" id="p-sessions">—</div><div class="pill-label">Sessions</div></div>
      </div>
      <div id="by-tool"></div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Session History</span></div>
      <table>
        <thead><tr><th>Tool</th><th>Model</th><th>Date</th><th>Tokens</th><th>Cost</th></tr></thead>
        <tbody id="log-body"><tr><td colspan="5" class="empty">Loading…</td></tr></tbody>
      </table>
      <div class="pagination" id="pagination"></div>
    </div>
  </div>

  <button class="theme-toggle" id="theme-toggle" title="Toggle light/dark">☀️</button>
  <script src="/js/nav.js" defer></script>
  <script src="/shared/theme.js"></script>
  <script>
    let page = 1;
    const fmtCost = v => '$' + Number(v).toFixed(4);
    const fmtTok = v => { const n = Number(v); return n >= 1000 ? (n/1000).toFixed(1)+'k' : String(n); };
    const fmtTime = iso => { if (!iso) return ''; const d = new Date(iso); return d.toLocaleDateString('en-NZ') + ' ' + d.toLocaleTimeString('en-NZ', {hour:'2-digit',minute:'2-digit'}); };

    async function load() {
      const period = document.getElementById('period').value;
      const r = await fetch(`/api/usage/me?period=${period}&page=${page}`);
      const d = await r.json();

      document.getElementById('p-cost').textContent = fmtCost(d.summary.total_cost);
      document.getElementById('p-tokens').textContent = fmtTok(d.summary.total_tokens);
      document.getElementById('p-sessions').textContent = d.summary.sessions;

      const maxCost = Math.max(...d.byTool.map(t => t.cost), 0.0001);
      document.getElementById('by-tool').innerHTML = d.byTool.map(t => `
        <div class="bar-row">
          <div class="bar-label">${t.tool}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.round(t.cost/maxCost*100)}%"></div></div>
          <div class="bar-cost">${fmtCost(t.cost)}</div>
        </div>
      `).join('') || '<p class="empty" style="margin:0">No usage data yet.</p>';

      document.getElementById('log-body').innerHTML = d.log.map(row => `
        <tr>
          <td>${row.tool}</td>
          <td><span style="font-size:11px;background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:4px">${row.model}</span></td>
          <td style="font-size:12px;color:var(--text-muted,#64748b)">${fmtTime(row.ts)}</td>
          <td style="font-size:12px;color:var(--text-muted,#64748b)">${row.input_tokens}/${row.output_tokens}/${row.cache_read_tokens}</td>
          <td style="color:var(--gold,#e8c96a)">${fmtCost(row.cost_usd)}</td>
        </tr>
      `).join('') || '<tr><td colspan="5" class="empty">No sessions yet.</td></tr>';

      const pages = Math.ceil(d.total / d.limit);
      document.getElementById('pagination').innerHTML = Array.from({length: Math.min(pages, 10)}, (_,i) =>
        `<button class="page-btn${i+1===page?' active':''}" onclick="goPage(${i+1})">${i+1}</button>`
      ).join('');
    }

    function goPage(p) { page = p; load(); }
    document.getElementById('period').addEventListener('change', () => { page = 1; load(); });
    load();
  </script>
</body>
</html>
```

- [ ] **Step 3: Test — sign in, navigate to /my-usage/ via hamburger drawer "My Usage" link**

Verify: pills show cost/tokens/sessions, bar chart shows per-tool breakdown, log table shows sessions. Confirm the page only shows your own data (not other users').

- [ ] **Step 4: Commit and push**

```bash
git add public/my-usage/index.html server/index.js
git commit -m "add My Usage page at /my-usage/"
git push
```

---

## Done

All features are now live:

- Every page requires a login — unauthenticated users see `/login/`
- Tim manages users via the `/admin` Users card (add, reset password, delete)
- Role field controls admin access — only `Admin` users can reach `/admin`
- Initials avatar in the nav bar; name, role, and Sign out in the hamburger drawer
- Every Claude API call logs user, tool, model, tokens, and cost to `usage_log`
- Admin sees all users' usage at `/admin` (Usage card)
- Each user sees their own usage at `/my-usage/`

**To add a new user:** Admin → Users card → + Add User

**To change pricing rates:** Edit `PRICING` in `server/lib/usageLogger.js`
