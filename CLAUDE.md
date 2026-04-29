# CLAUDE.md — AI Playground

Guidance for Claude Code when working in this repository.

## Running the app

```bash
npm start          # production
npm run dev        # hot-reload via --watch
```

Server runs on `PORT` (default 3000). Requires a `.env` file — copy `.env.example` to get started.

Required env vars: `CLAUDE_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `OPENAI_API_KEY`, `LEGISLATION_API_KEY`, `DATABASE_URL`, `SESSION_SECRET`.

Optional: `TRANSCRIPTION_MODEL` (defaults to `gpt-4o-transcribe-diarize`), `REINDEX_TOKEN`.

## Git workflow

Use feature branches — never commit directly to `main`.

```bash
git checkout -b feature/short-description
# make changes
git add <files>
git commit -m "description"
git push -u origin feature/short-description
# open PR to merge into main
```

Branch naming: `feature/` for new functionality, `fix/` for bug fixes. Delete branch after merging.

## Project structure

```
server/
  index.js              — Express entry point, route registration, session/auth setup
  routes/               — One file per feature (auth, tutor, critique, proofreader, l3Reviewer, etc.)
  lib/                  — Shared logic (claude.js, db.js, whisper.js, docxAnnotator.js, etc.)
  middleware/           — auth.js (requireAuth/requireAdmin), logger.js
  data/
    knowledge/          — DDP knowledge base DOCX files (tutor)
    scenarios/          — Witness scenario markdown files (interview)
    witnesses/          — Per-witness config (interview)
    peace-reference.md  — PEACE model reference (auto-generated from PDF)

public/
  index.html            — Landing page
  css/
    nav.css             — Shared nav, CSS variables (:root), hamburger, drawer
    styles.css          — Interview page styles
    podcast-reviewer.css
    landing.css
  js/
    nav.js              — Injects wordmark, theme toggle, avatar, user drawer into all pages
  shared/
    theme.css           — body.light overrides for all pages
    logo.svg            — Site logo (used in nav bar and drawer)
  tutor/                — DDP AI Tutor
  interview/            — P.E.A.C.E. Interview Tutor
  proofreader/          — Module Proofreader
  l3-reviewer/          — L3 Interview Reviewer
  podcast-reviewer/     — Podcast Legislation Reviewer
  podcast-converter/    — M4A → MP3 Converter
  my-usage/             — Per-user token/cost dashboard
  admin/                — Admin panel (users, usage, scenario editor)
  login/                — Auth gate

scripts/
  create-admin.js       — Create first admin user: node scripts/create-admin.js <user> "<Name>" <pass>
  convert-pdf.js        — Convert PEACE PDF to markdown (run once)

tests/                  — Node built-in test runner (npm test)
tools/
  review.py             — Parallel three-agent code review orchestrator
```

## Design system

### CSS architecture
- `public/css/nav.css` — defines `:root` CSS variables (single source of truth for dark-mode palette) and all shared nav styles. Loaded on every page.
- `public/shared/theme.css` — defines `body.light` overrides. Loaded on every page, after page CSS.
- Each page has either an inline `<style>` block or a dedicated `.css` file that sets `--tool-accent` and any page-specific rules. Page CSS comes after `nav.css` so it can override variables.

### Colour palette (dark mode)

| Token | Value | Role |
|---|---|---|
| `--bg` | `#0D1420` | Page background |
| `--surface` | `#1E2A44` | Cards, inputs |
| `--surface-2` | `#243352` | Nested surfaces |
| `--border` | `#2E3D5E` | Borders |
| `--text` | `#F5E8D0` | Primary text (warm cream) |
| `--text-muted` | `#9A8E7A` | Secondary text |
| `--text-sub` | `#D4C4A0` | Tertiary text |
| `--brand` | `#E8743C` | Orange accent |

### Colour palette (light mode, via body.light in theme.css)

| Token | Value |
|---|---|
| `--bg` | `#F5E8D0` (cream) |
| `--surface` | `#ffffff` |
| `--text` | `#1E2A44` (navy) |
| `--brand` | `#B8520A` (burnt orange) |

### Per-tool accent colours
Each tool page sets `--tool-accent` to one of these semantic tokens, keeping its own identity while sharing the base palette:

| Token | Value | Used by |
|---|---|---|
| `--learn` | `#38bdf8` | Interview |
| `--verify` | `#22c55e` | Podcast Reviewer |
| `--review` | `#a78bfa` | Proofreader |
| `--audio` | `#22d3ee` | Podcast Converter |
| `--assess` | `#fb923c` | L3 Reviewer |
| `--brand` | `#E8743C` | DDP Tutor (orange = brand) |

The DDP Tutor is the only page that keeps its nav navy in light mode (scoped `body.light .site-nav` override in `tutor/index.html`). All other pages let the nav go cream in light mode.

### Nav bar
`nav.js` runs on every page and dynamically injects:
- `.nav-brand-group` (logo + Fugaz One wordmark) after the hamburger
- `.nav-theme-btn` (sun/moon SVG) at the end of the nav bar
- `.nav-avatar` (initials) + user section in the drawer (after `/api/auth/me` resolves)

Fugaz One, Crimson Pro, and Inter are all loaded via the `@import` in `nav.css` — do not rely on individual page `<link>` tags for Fugaz One.

## Adding a new page

1. Create `public/<page-name>/index.html`
2. Link `nav.css` and `shared/theme.css` (in that order, theme.css last)
3. Load `js/nav.js` and `js/theme.js` (if the page needs theme persistence)
4. Add a `<button id="hamburger">` with three `<span>` children and a `<div id="nav-drawer">` with `<div class="nav-logo">` and `<ul class="nav-links">`
5. Set `--tool-accent` in the page's `:root` block to one of the semantic colour tokens
6. Add the page to `nav-links` in all other pages' drawers
7. Add a route in `server/routes/` and register it in `server/index.js`
8. Add a card to the landing page

## Running tests

```bash
npm test
```

Tests cover `computeTargetKbps` (podcast converter) and `ratingLabel` / `buildMarkdownReport` (L3 reviewer). Uses Node's built-in test runner — no external dependencies.
