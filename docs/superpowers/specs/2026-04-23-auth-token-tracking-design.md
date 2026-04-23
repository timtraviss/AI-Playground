# Auth & Token Tracking — Design Spec
**Date:** 2026-04-23
**Project:** Traviss.org AI Playground
**Author:** Tim Traviss

---

## Overview

Two related features added to the existing Node.js/Express app:

1. **User authentication** — full-site login gate, session-based auth, admin-managed user accounts
2. **Token usage tracking** — every Claude API call logged with model, token counts, and cost; visible to admin (all users) and to each user (their own sessions)

---

## Goals

- Gate the entire site behind a login page — no page or API is accessible without a valid session
- Tim manages all user accounts via the existing `/admin` page (create, reset password, delete)
- Tim sets all passwords — users cannot self-register or change their own password
- Each user has a display name, username, role, and password
- Admin-role users can access `/admin`; all other logged-in users cannot
- Every Claude API call logs user, tool, model, token counts, and computed cost to PostgreSQL
- Admin sees all users' usage; each user sees only their own
- Initials avatar in the nav bar on every page; user name, role, and Sign out inside the hamburger drawer

---

## New Dependencies

| Package | Purpose |
|---|---|
| `express-session` | Server-side session management |
| `connect-pg-simple` | Stores sessions in existing PostgreSQL DB |
| `bcrypt` | Password hashing (cost factor 12) |

No other new packages. Three additions to `package.json`.

---

## Database Schema

Three new tables added to the existing PostgreSQL database via `server/lib/db.js` (`initDb()`).

### `users`
```sql
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'Trainee',
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login    TIMESTAMPTZ
);
```

### `sessions`
Managed entirely by `connect-pg-simple` — no manual DDL needed. The library creates the table on startup.

### `usage_log`
```sql
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
);
CREATE INDEX IF NOT EXISTS usage_log_user_idx ON usage_log (user_id);
CREATE INDEX IF NOT EXISTS usage_log_ts_idx   ON usage_log (ts DESC);
CREATE INDEX IF NOT EXISTS usage_log_tool_idx ON usage_log (tool);
```

---

## Pricing Table

Stored in `server/lib/usageLogger.js`. Updated here if Anthropic changes pricing.

```js
const PRICING = {
  'claude-sonnet-4-6': { input: 3.00, output: 15.00, cacheRead: 0.30 },
  'claude-haiku-4-5':  { input: 0.80, output:  4.00, cacheRead: 0.08 },
  'claude-opus-4-7':   { input: 15.00, output: 75.00, cacheRead: 1.50 },
};
// cost_usd = (input_tokens * input_rate + output_tokens * output_rate
//           + cache_read_tokens * cacheRead_rate) / 1_000_000
```

Unknown models fall back to Sonnet pricing with a console warning.

---

## Authentication Architecture

### Session Configuration (`server/index.js`)
```js
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';

const PgSession = connectPgSimple(session);
app.use(session({
  store: new PgSession({ pool: getPool(), tableName: 'sessions' }),
  secret: process.env.SESSION_SECRET,   // new required env var
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,   // 7 days, rolling
  },
  rolling: true,
}));
```

### Auth Middleware (`server/middleware/auth.js`)
Two exported functions:

- **`requireAuth`** — checks `req.session.userId`, loads user from DB, attaches `req.user`. If missing: API routes return `401 { error: 'Not authenticated' }`; page routes redirect to `/login?next=<encoded-url>`.
- **`requireAdmin`** — calls `requireAuth` first, then checks `req.user.role === 'Admin'`. API routes return `403`; page routes redirect to `/?denied=1`.

**Middleware order in `server/index.js`** (order matters — static files must come after auth):
```js
// 1. Session middleware
app.use(session({ ... }));

// 2. Login page and auth API — no auth required
app.use('/login', express.static(resolve(projectRoot, 'public', 'login')));
app.use('/api/auth', authRouter);

// 3. Auth gate — everything below requires a valid session
app.use(requireAuth);

// 4. Protected static files — all other public/ files now require auth
app.use(express.static(resolve(projectRoot, 'public')));

// 5. All other API routes and page routes follow...
```

The current `express.static` call is moved from its current position (before any auth) to after `requireAuth`. The `/login` directory is served separately before the gate so the login page and its assets are always accessible.

### Auth Routes (`server/routes/auth.js`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/login` | Serve login page |
| `POST` | `/api/auth/login` | Verify credentials, create session |
| `POST` | `/api/auth/logout` | Destroy session, redirect to `/login` |
| `GET` | `/api/auth/me` | Return `{ id, username, displayName, role }` for current user |

**Login logic:**
1. Look up user by username
2. `bcrypt.compare(password, user.password_hash)`
3. On match: set `req.session.userId`, update `last_login`, redirect to `next` param or `/`
4. On failure: re-render login page with generic error "Incorrect username or password" (same message for both wrong username and wrong password — no enumeration)

---

## Login Page (`public/login/index.html`)

**Layout (option B — split):**
- Left: Traviss.org wordmark, username field, password field, Sign in button, error message area
- Right: subtle grid of tool emoji icons (🎤 📄 🎙️ ✍️ 🔍 📊) on a slightly lighter dark panel
- Uses existing CSS variables (`--bg`, `--gold`, `--text`, etc.) — no new stylesheet needed
- Responsive: right panel hidden on mobile, form takes full width
- `?next=<url>` param preserved through the form submission so users land where they were going

---

## User Management (Admin)

New "Users" card added to `/admin`, consistent with existing card layout.

### Table View
Columns: Username · Display Name · Role · Last Login · Actions (⋯ menu)
- Role displayed as a pill badge
- Last Login shown as relative time ("2d ago", "Today")
- ⋯ menu per row: **Reset Password** and **Delete**
- Your own account cannot be deleted (prevents lockout)

### "+ Add User" Modal
Fields: Username, Display Name, Password, Role
- Username: lowercase alphanumeric + dots/underscores, must be unique
- Password: hashed with `bcrypt` (cost 12) before storage, never logged or stored in plaintext
- On success: modal closes, table refreshes

### Reset Password Modal
Opens from the ⋯ menu. Single password field. Admin sets the new password; bcrypt hash replaces the old one. No knowledge of the current password required.

### New Admin API Endpoints
All protected by `requireAdmin` middleware.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/users` | List all users (no hashes) |
| `POST` | `/api/admin/users` | Create user |
| `PATCH` | `/api/admin/users/:id/password` | Reset password |
| `DELETE` | `/api/admin/users/:id` | Delete user (blocked for own account) |

---

## Nav Changes (all pages)

Affects `public/shared/nav.js` and `public/css/nav.css`.

### Nav Bar
- Gold initials avatar (first letter of display name) in top-right corner on every page
- Avatar generated as a styled `<div>` — no image upload, no external service
- Avatar is a visual confirmation of being logged in; clicking it opens the hamburger drawer

### Hamburger Drawer
User info section added at the top of the drawer (above existing nav links):
```
[T]  Tim Traviss
     Admin · timtraviss
                          [Sign out]
```
- Display name and role on the left
- Sign out button on the right (calls `POST /api/auth/logout`)
- Separated from nav links by a subtle divider
- Admin nav link only rendered if `req.user.role === 'Admin'`

Nav JS calls `GET /api/auth/me` on page load (once per page, not cached across pages). Response used to populate avatar initial, display name, and role. If call fails (session expired), user is redirected to `/login`.

### Light Mode
Avatar background and border use existing `--gold` / `--surface` variables. Drawer user section uses `--border` for the divider. No hardcoded colours.

---

## Token Usage Tracking

### `server/lib/usageLogger.js`
Single exported function:
```js
export async function logUsage({ userId, tool, usage, model }) {
  // usage = { input_tokens, output_tokens, cache_read_input_tokens }
  // Computes cost_usd from PRICING table, writes row to usage_log
}
```

Called in every route that invokes Claude, after the API response is complete:
- `server/routes/tutor.js` — after SSE stream ends
- `server/routes/critique.js`
- `server/routes/proofreader.js`
- `server/routes/l3Reviewer.js`
- `server/routes/podcastReview.js`

`userId` comes from `req.user.id` (available on all authenticated requests). Tool name is a short slug: `ddp-tutor`, `peace-critique`, `proofreader`, `l3-reviewer`, `podcast-reviewer`.

### Admin Usage Dashboard (inside `/admin`)

New "Usage" card. Two tabs: **Summary** (default) and **Log**.

**Summary tab:**
- Stat pills: Total Cost (this month), Total Tokens, Active Users, Sessions
- Per-user summary cards: avatar initial, display name, session count, top tool, total cost and tokens
- Click a user card → Log tab pre-filtered to that user

**Log tab:**
- Table: User · Tool · Model · Date · Tokens In / Out / Cached · Cost
- Filters: User dropdown, Tool dropdown, Date range (This week / This month / All time)
- Totals row at bottom updates with filters
- Paginated at 50 rows

### User's Own Usage (`/my-usage`)

New page served at `/my-usage/`. Linked from the hamburger drawer ("My Usage →").
Identical layout to the admin Usage card but scoped to `req.user.id` — no other user's data is accessible. No admin-only data (no per-user breakdown card, since they are the only user shown).

### New API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/usage/admin` | Admin | Aggregate + session log, filterable |
| `GET` | `/api/usage/me` | Any user | Current user's usage only |

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `SESSION_SECRET` | Signs session cookies — long random string, never committed |
| `DATABASE_URL` | Already set — sessions and usage_log use the same DB |

---

## New Files

```
server/
  middleware/
    auth.js               ← requireAuth, requireAdmin
  routes/
    auth.js               ← login, logout, /me
    users.js              ← admin user CRUD
    usage.js              ← /admin usage, /me usage
  lib/
    usageLogger.js        ← logUsage helper + pricing table

public/
  login/
    index.html            ← split login page
  my-usage/
    index.html            ← user's own usage page
```

## Modified Files

```
server/
  index.js               ← session middleware, new routes, requireAuth global
  lib/db.js              ← users + usage_log table creation in initDb()
  routes/
    tutor.js             ← logUsage call after stream
    critique.js          ← logUsage call
    proofreader.js       ← logUsage call
    l3Reviewer.js        ← logUsage call
    podcastReview.js     ← logUsage call
    admin.js             ← user management card, requireAdmin on existing routes

public/
  css/nav.css            ← avatar styles, drawer user section styles
  shared/nav.js          ← /api/auth/me fetch, avatar render, drawer user info
  admin/index.html       ← Users card, Usage card
```

---

## Out of Scope

- User self-registration
- User password change (admin only)
- Profile photo upload (initials avatar only)
- Per-tool access control (all logged-in users access all tools)
- OAuth / SSO
- OpenAI / ElevenLabs cost tracking (Claude only for now)
- Email notifications
