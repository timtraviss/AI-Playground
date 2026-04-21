# Site-Wide Light Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a warm-paper light mode to all 8 pages of the AI Playground site, toggled by a floating corner button that persists preference to localStorage.

**Architecture:** Two shared files (`public/shared/theme.css` and `public/shared/theme.js`) are loaded by every page. `theme.css` contains only `body.light` variable overrides and the `.theme-toggle` button style. `theme.js` handles the toggle click and reads/writes `localStorage`. Each page's own CSS gets hardcoded hex values replaced with CSS custom properties; `body.light` in `theme.css` then overrides those properties for light mode.

**Tech Stack:** Vanilla CSS custom properties, vanilla JS, localStorage. No new dependencies.

---

## File Map

| Action | File | What changes |
|---|---|---|
| Create | `public/shared/theme.css` | `body.light` overrides + `.theme-toggle` style |
| Create | `public/shared/theme.js` | toggle logic + localStorage |
| Modify | `public/css/nav.css` | replace hardcoded hex with CSS vars |
| Modify | `public/css/landing.css` | replace hardcoded hex with CSS vars |
| Modify | `public/css/styles.css` | add `body.light` overrides inline (already uses vars) |
| Modify | `public/css/podcast-converter.css` | replace hardcoded hex with CSS vars |
| Modify | `public/css/podcast-reviewer.css` | replace hardcoded hex with CSS vars |
| Modify | `public/index.html` | add `<link>`, toggle button, script |
| Modify | `public/interview/index.html` | add `<link>`, toggle button, script |
| Modify | `public/podcast-converter/index.html` | add `<link>`, toggle button, script |
| Modify | `public/podcast-reviewer/index.html` | add `<link>`, toggle button, script |
| Modify | `public/admin/index.html` | add `:root` vars, replace hex in `<style>`, add link + button + script |
| Modify | `public/proofreader/index.html` | add `:root` vars, replace hex in `<style>`, add link + button + script |
| Modify | `public/l3-reviewer/index.html` | add `:root` vars, replace hex in `<style>`, add link + button + script |
| Modify | `public/tutor/index.html` | add `:root` vars, replace hex in `<style>`, add link + button + script |

---

## Task 1: Create shared theme files

**Files:**
- Create: `public/shared/theme.css`
- Create: `public/shared/theme.js`

- [ ] **Step 1: Create `public/shared/theme.css`**

```css
/* ─── Light mode variable overrides ─────────────────────────────────────
   Loaded after page CSS on every page. body.light overrides :root vars.
   ──────────────────────────────────────────────────────────────────── */

body.light {
  /* ── Core palette (used by inline-style pages: tutor, admin, proofreader, l3-reviewer) */
  --bg:               #faf7f2;
  --surface:          #f0ebe0;
  --border:           #e8e0d0;
  --text:             #292524;
  --text-muted:       #78716c;
  --gold:             #a07800;
  --gold-on-dark:     #ffffff;
  --user-bubble-bg:   #c49a00;
  --user-bubble-text: #ffffff;

  /* ── styles.css variable names (interview page) */
  --bg-card:          rgba(0,0,0,0.04);
  --bg-card-hover:    rgba(0,0,0,0.07);
  --border-strong:    rgba(0,0,0,0.18);
  --text-sub:         #57534e;
  --accent:           #a07800;
  --accent-dim:       rgba(160,120,0,0.12);
  --accent-border:    rgba(160,120,0,0.3);

  /* ── nav variables */
  --nav-bg:           #faf7f2;
  --nav-accent:       #a07800;
  --nav-text:         #292524;
  --nav-muted:        #78716c;
  --nav-border:       rgba(0,0,0,0.1);
}

/* Nav hardcoded backgrounds that aren't variables */
body.light .site-nav {
  background: rgba(250, 247, 242, 0.92);
}
body.light .nav-drawer {
  background: #f0ebe0;
}
body.light .nav-links li a:hover {
  background: rgba(0,0,0,0.04);
}
body.light .nav-links li a.active {
  background: rgba(160,120,0,0.08);
}

/* Landing page light overrides */
body.light .landing-divider {
  background: rgba(0,0,0,0.1);
}
body.light .project-card {
  background: rgba(0,0,0,0.03);
  border-color: rgba(0,0,0,0.08);
}
body.light .project-card:hover {
  background: rgba(0,0,0,0.06);
}
body.light .project-tag {
  background: rgba(160,120,0,0.1);
  border-color: rgba(160,120,0,0.25);
}

/* Interview page — transcript panel background */
body.light .transcript-panel {
  background: rgba(250, 247, 242, 0.95);
}

/* ─── Theme toggle button ─────────────────────────────────────────────── */
.theme-toggle {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 36px;
  height: 36px;
  background: var(--surface, #161b22);
  border: 1px solid var(--border, #21262d);
  border-radius: 50%;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 998;
  transition: border-color 0.15s;
  line-height: 1;
  padding: 0;
}
.theme-toggle:hover {
  border-color: var(--gold, #e8c96a);
}
```

- [ ] **Step 2: Create `public/shared/theme.js`**

```js
(function () {
  const KEY = 'ai-playground-theme';
  const btn = document.getElementById('theme-toggle');

  function apply(theme) {
    document.body.classList.toggle('light', theme === 'light');
    if (btn) btn.textContent = theme === 'light' ? '🌙' : '☀️';
  }

  apply(localStorage.getItem(KEY) || 'dark');

  if (btn) {
    btn.addEventListener('click', function () {
      var next = document.body.classList.contains('light') ? 'dark' : 'light';
      localStorage.setItem(KEY, next);
      apply(next);
    });
  }
})();
```

- [ ] **Step 3: Verify the server serves `/shared/` directory**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/shared/theme.js
```

Expected: `200`. If `404`, check that `server/index.js` serves `public/` via `express.static` with no path restrictions. The static middleware should serve anything under `public/` including the new `shared/` subdirectory.

- [ ] **Step 4: Commit**

```bash
cd "/Users/timothytraviss/Library/CloudStorage/Dropbox/Claude Code/AI Playground"
git add public/shared/theme.css public/shared/theme.js
git commit -m "feat: add shared theme CSS and JS for site-wide light mode"
```

---

## Task 2: Apply theme to `public/tutor/index.html`

**Files:**
- Modify: `public/tutor/index.html`

The tutor page has an inline `<style>` block. Add a `:root` block at the top of it, replace hardcoded hex values with CSS variables, then add the link + button + script.

- [ ] **Step 1: Add `:root` variable block at the top of the `<style>` block**

Find the opening `<style>` tag and insert this as the first rule inside it:

```css
    :root {
      --bg:               #0d1117;
      --surface:          #161b22;
      --border:           #21262d;
      --text:             #e2e8f0;
      --text-muted:       #64748b;
      --gold:             #e8c96a;
      --gold-on-dark:     #0d1117;
      --user-bubble-bg:   #e8c96a;
      --user-bubble-text: #0d1117;
    }
```

- [ ] **Step 2: Replace hardcoded colours in the tutor `<style>` block**

Make these replacements throughout the `<style>` block (do NOT change colours inside `rgba()` expressions that mix transparency — those should stay):

| Find | Replace with |
|---|---|
| `background: #0d1117` | `background: var(--bg)` |
| `background:#0d1117` | `background:var(--bg)` |
| `color: #e2e8f0` | `color: var(--text)` |
| `color:#e2e8f0` | `color:var(--text)` |
| `background: #161b22` | `background: var(--surface)` |
| `background:#161b22` | `background:var(--surface)` |
| `border: 1px solid #21262d` | `border: 1px solid var(--border)` |
| `border-color: #21262d` | `border-color: var(--border)` |
| `border-bottom: 1px solid #21262d` | `border-bottom: 1px solid var(--border)` |
| `border-top: 1px solid #21262d` | `border-top: 1px solid var(--border)` |
| `1px solid #21262d` | `1px solid var(--border)` |
| `color: #64748b` | `color: var(--text-muted)` |
| `color:#64748b` | `color:var(--text-muted)` |
| `background: #e8c96a` | `background: var(--user-bubble-bg)` |
| `color: #0d1117` (inside `.message.user .bubble`) | `color: var(--user-bubble-text)` |
| `color: #e8c96a` | `color: var(--gold)` |
| `color:#e8c96a` | `color:var(--gold)` |
| `border-color: #e8c96a` | `border-color: var(--gold)` |
| `border-color: #f87171` | keep as-is (semantic red) |

After substitution, also update the `body` rule:
```css
    body {
      font-family: Inter, system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      ...
    }
```

- [ ] **Step 3: Add `<link>` to `theme.css` inside `<head>`**

Find the closing `</style>` tag and add immediately after it:
```html
  <link rel="stylesheet" href="/shared/theme.css" />
```

- [ ] **Step 4: Add toggle button and script before `</body>`**

Find `</body>` and insert before it:
```html
  <button class="theme-toggle" id="theme-toggle" title="Toggle light/dark">☀️</button>
  <script src="/shared/theme.js"></script>
```

- [ ] **Step 5: Visual test**

Open http://localhost:3000/tutor/ — verify:
1. Page loads in dark mode by default
2. Floating ☀️ button visible in bottom-right corner
3. Click it — page switches to warm paper (cream background, dark text)
4. Button changes to 🌙
5. Reload page — light mode persists
6. Click 🌙 — returns to dark mode

- [ ] **Step 6: Run tests**

```bash
cd "/Users/timothytraviss/Library/CloudStorage/Dropbox/Claude Code/AI Playground"
npm test
```

Expected: 36 tests passing.

- [ ] **Step 7: Commit**

```bash
git add public/tutor/index.html
git commit -m "feat: light mode for tutor page"
```

---

## Task 3: Apply theme to `public/admin/index.html`

**Files:**
- Modify: `public/admin/index.html`

- [ ] **Step 1: Add `:root` variables at the top of the `<style>` block**

```css
    :root {
      --bg:      #0d1117;
      --surface: #161b22;
      --border:  #21262d;
      --text:    #e2e8f0;
      --text-muted: #64748b;
      --gold:    #e8c96a;
      --gold-on-dark: #0d1117;
    }
```

- [ ] **Step 2: Replace hardcoded colours in admin `<style>` block**

| Find | Replace with |
|---|---|
| `background: #0d1117` | `background: var(--bg)` |
| `color: #e2e8f0` | `color: var(--text)` |
| `background: #161b22` | `background: var(--surface)` |
| `border: 1px solid #21262d` | `border: 1px solid var(--border)` |
| `1px solid #21262d` | `1px solid var(--border)` |
| `color: #64748b` | `color: var(--text-muted)` |
| `color: #94a3b8` | `color: var(--text-muted)` |
| `color: #e8c96a` | `color: var(--gold)` |
| `background: #e8c96a` | `background: var(--gold)` |
| `color: #0d1117` (text on gold button) | `color: var(--gold-on-dark)` |

Leave `#4ade80` (success green) and `#f87171` (error/danger red) as-is — semantic colours.

- [ ] **Step 3: Add link, button, script**

After `</style>` in `<head>`, add:
```html
  <link rel="stylesheet" href="/shared/theme.css" />
```

Before `</body>`, add:
```html
  <button class="theme-toggle" id="theme-toggle" title="Toggle light/dark">☀️</button>
  <script src="/shared/theme.js"></script>
```

- [ ] **Step 4: Visual test**

Open http://localhost:3000/admin/ — toggle works, form inputs and table render correctly in both modes.

- [ ] **Step 5: Commit**

```bash
git add public/admin/index.html
git commit -m "feat: light mode for admin page"
```

---

## Task 4: Apply theme to `public/proofreader/index.html`

**Files:**
- Modify: `public/proofreader/index.html`

- [ ] **Step 1: Add `:root` variables at the top of `<style>` block**

```css
    :root {
      --bg:           #0d1117;
      --surface:      #161b22;
      --border:       #21262d;
      --text:         #e2e8f0;
      --text-muted:   #64748b;
      --text-sub:     #94a3b8;
      --gold:         #e8c96a;
      --gold-on-dark: #0d1117;
    }
```

- [ ] **Step 2: Replace hardcoded colours in proofreader `<style>` block**

| Find | Replace with |
|---|---|
| `background: #0d1117` | `background: var(--bg)` |
| `color: #e2e8f0` | `color: var(--text)` |
| `background: #161b22` | `background: var(--surface)` |
| `color: #94a3b8` | `color: var(--text-sub)` |
| `color: #64748b` | `color: var(--text-muted)` |
| `color: #475569` | `color: var(--text-muted)` |
| `color: #e8c96a` | `color: var(--gold)` |
| `background: #e8c96a` | `background: var(--gold)` |
| `color: #0d1117` (on gold backgrounds) | `color: var(--gold-on-dark)` |

Leave `rgba()` transparency values, `#ef4444` (red), `#22c55e` (green) as-is.

- [ ] **Step 3: Add link, button, script**

After `</style>` in `<head>`:
```html
  <link rel="stylesheet" href="/shared/theme.css" />
```

Before `</body>`:
```html
  <button class="theme-toggle" id="theme-toggle" title="Toggle light/dark">☀️</button>
  <script src="/shared/theme.js"></script>
```

- [ ] **Step 4: Visual test**

Open http://localhost:3000/proofreader/ — toggle works, file upload fields and result panels render correctly in both modes.

- [ ] **Step 5: Commit**

```bash
git add public/proofreader/index.html
git commit -m "feat: light mode for proofreader page"
```

---

## Task 5: Apply theme to `public/l3-reviewer/index.html`

**Files:**
- Modify: `public/l3-reviewer/index.html`

The l3-reviewer uses some non-standard slate variants (`#475569`, `#334155`, `#1e293b`) in addition to the standard palette.

- [ ] **Step 1: Add `:root` variables at the top of `<style>` block**

```css
    :root {
      --bg:           #0d1117;
      --surface:      #161b22;
      --surface-mid:  #1e293b;
      --border:       #21262d;
      --border-mid:   #334155;
      --text:         #e2e8f0;
      --text-muted:   #64748b;
      --text-sub:     #94a3b8;
      --text-dim:     #475569;
      --gold:         #e8c96a;
      --gold-on-dark: #0d1117;
    }
```

- [ ] **Step 2: Add light mode overrides for l3-reviewer-specific vars to `theme.css`**

Open `public/shared/theme.css` and inside the `body.light { }` block, add after the existing variables:

```css
  /* ── l3-reviewer extra vars */
  --surface-mid:  #ede8e0;
  --border-mid:   #ddd5c8;
  --text-dim:     #78716c;
```

- [ ] **Step 3: Replace hardcoded colours in l3-reviewer `<style>` block**

| Find | Replace with |
|---|---|
| `background: #0d1117` | `background: var(--bg)` |
| `color: #0d1117` (page bg references) | `color: var(--bg)` |
| `color: #e2e8f0` | `color: var(--text)` |
| `background: #161b22` | `background: var(--surface)` |
| `background: #1e293b` | `background: var(--surface-mid)` |
| `background: #334155` | `background: var(--border-mid)` |
| `border.*#21262d` | replace `#21262d` with `var(--border)` |
| `border.*#334155` | replace `#334155` with `var(--border-mid)` |
| `color: #94a3b8` | `color: var(--text-sub)` |
| `color: #64748b` | `color: var(--text-muted)` |
| `color: #475569` | `color: var(--text-dim)` |
| `color: #e8c96a` | `color: var(--gold)` |
| `background: #e8c96a` | `background: var(--gold)` |
| `color: #0d1117` (text on gold) | `color: var(--gold-on-dark)` |

Leave `#ef4444`, `#22c55e`, `#f97316`, `#f59e0b`, `#fca5a5` as-is — semantic status colours.

- [ ] **Step 4: Add link, button, script**

After `</style>` in `<head>`:
```html
  <link rel="stylesheet" href="/shared/theme.css" />
```

Before `</body>`:
```html
  <button class="theme-toggle" id="theme-toggle" title="Toggle light/dark">☀️</button>
  <script src="/shared/theme.js"></script>
```

- [ ] **Step 5: Visual test**

Open http://localhost:3000/l3-reviewer/ — toggle works, tables and score cards render correctly in both modes.

- [ ] **Step 6: Commit**

```bash
git add public/l3-reviewer/index.html public/shared/theme.css
git commit -m "feat: light mode for l3-reviewer page"
```

---

## Task 6: Apply theme to nav, landing page, and interview page

**Files:**
- Modify: `public/css/nav.css`
- Modify: `public/css/landing.css`
- Modify: `public/index.html`
- Modify: `public/interview/index.html`

### nav.css

- [ ] **Step 1: Replace hardcoded values in `nav.css` with variables**

The nav already has `:root` CSS vars (`--nav-bg`, `--nav-accent`, etc.). Replace the two hardcoded colour values that aren't using those vars yet:

Find:
```css
  background: rgba(13, 17, 23, 0.92);
```
Replace with:
```css
  background: rgba(from var(--nav-bg) r g b / 0.92);
```

Wait — `rgba(from ...)` syntax isn't widely supported. Instead, update the `.site-nav` background directly:

Find in `nav.css`:
```css
  background: rgba(13, 17, 23, 0.92);
```
Replace with:
```css
  background: var(--nav-bg);
  opacity: 0.96;
```

Hmm — that affects the whole nav bar transparency. Actually the simplest approach: just change the `--nav-bg` var default in `nav.css` and use it directly without opacity, since `theme.css` body.light already handles `.site-nav` background override.

Find in `nav.css`:
```css
  background: rgba(13, 17, 23, 0.92);
```
Replace with:
```css
  background: rgba(13,17,23,0.92);  /* overridden by body.light in theme.css */
```

And find the drawer background:
```css
  background: #111827;
```
Replace with:
```css
  background: var(--nav-bg);
```

### landing.css

- [ ] **Step 2: Replace hardcoded colours in `landing.css` with variables**

Find in `landing.css` and replace:

```css
/* Before */
html, body {
  background: #0d1117;
  color: #e2e8f0;
  ...
}
```
```css
/* After */
html, body {
  background: var(--bg, #0d1117);
  color: var(--text, #e2e8f0);
  ...
}
```

Replace all remaining hardcoded values:

| Find | Replace with |
|---|---|
| `color: #e8c96a` | `color: var(--gold, #e8c96a)` |
| `color: #64748b` | `color: var(--text-muted, #64748b)` |
| `color: #e2e8f0` | `color: var(--text, #e2e8f0)` |
| `color: #94a3b8` | `color: var(--text-muted, #94a3b8)` |

Leave `rgba()` transparency values as-is (handled by `body.light .project-card` etc. in `theme.css`).

### index.html

- [ ] **Step 3: Add `theme.css` link to `public/index.html`**

In `public/index.html`, find:
```html
  <link rel="stylesheet" href="/css/landing.css" />
```
Add after it:
```html
  <link rel="stylesheet" href="/shared/theme.css" />
```

Add before `</body>`:
```html
  <button class="theme-toggle" id="theme-toggle" title="Toggle light/dark">☀️</button>
  <script src="/shared/theme.js"></script>
```

### interview/index.html

- [ ] **Step 4: Add `theme.css` link to `public/interview/index.html`**

In `public/interview/index.html`, find:
```html
  <link rel="stylesheet" href="/css/styles.css" />
```
Add after it:
```html
  <link rel="stylesheet" href="/shared/theme.css" />
```

Add before `</body>`:
```html
  <button class="theme-toggle" id="theme-toggle" title="Toggle light/dark">☀️</button>
  <script src="/shared/theme.js"></script>
```

Note: `styles.css` already uses CSS variables extensively. `theme.css` `body.light` overrides those variables automatically — no changes needed to `styles.css` itself.

- [ ] **Step 5: Visual test**

- Open http://localhost:3000/ — landing cards switch to warm paper, nav drawer switches colour
- Open http://localhost:3000/interview/ — entire interview UI switches correctly
- Confirm preference persists across both pages (shared localStorage key)

- [ ] **Step 6: Commit**

```bash
git add public/css/nav.css public/css/landing.css public/index.html public/interview/index.html
git commit -m "feat: light mode for home and interview pages, update nav and landing CSS"
```

---

## Task 7: Apply theme to podcast-converter page

**Files:**
- Modify: `public/css/podcast-converter.css`
- Modify: `public/podcast-converter/index.html`

The podcast-converter CSS uses non-standard slate variants `#2d3748` (dark surface) and `#4a5568` (medium grey). Map them to `--surface` and `--text-muted`.

- [ ] **Step 1: Add `:root` variables at the top of `podcast-converter.css`**

Insert at the very top of the file, before any existing rules:

```css
:root {
  --bg:         #0d1117;
  --surface:    #161b22;
  --border:     #21262d;
  --text:       #e2e8f0;
  --text-muted: #64748b;
  --text-sub:   #94a3b8;
  --gold:       #e8c96a;
  --gold-on-dark: #0d1117;
}
```

- [ ] **Step 2: Replace hardcoded colours in `podcast-converter.css`**

| Find | Replace with |
|---|---|
| `background: #0d1117` | `background: var(--bg)` |
| `#0d1117` used as background | `var(--bg)` |
| `background: #161b22` | `background: var(--surface)` |
| `background: #2d3748` | `background: var(--surface)` |
| `color: #4a5568` | `color: var(--text-muted)` |
| `background: #4a5568` | `background: var(--text-muted)` |
| `color: #e2e8f0` | `color: var(--text)` |
| `color: #94a3b8` | `color: var(--text-sub)` |
| `color: #64748b` | `color: var(--text-muted)` |
| `color: #e8c96a` | `color: var(--gold)` |
| `background: #e8c96a` | `background: var(--gold)` |
| `color: #0d1117` (text on gold) | `color: var(--gold-on-dark)` |
| `border.*#21262d` | replace `#21262d` → `var(--border)` |

Leave `#4ade80` (green) and `#f87171` (red) as-is.

- [ ] **Step 3: Add `theme.css` link to `podcast-converter/index.html`**

Find:
```html
  <link rel="stylesheet" href="/css/podcast-converter.css" />
```
Add after it:
```html
  <link rel="stylesheet" href="/shared/theme.css" />
```

Add before `</body>`:
```html
  <button class="theme-toggle" id="theme-toggle" title="Toggle light/dark">☀️</button>
  <script src="/shared/theme.js"></script>
```

- [ ] **Step 4: Visual test**

Open http://localhost:3000/podcast-converter/ — upload area, progress states, and output render correctly in both modes.

- [ ] **Step 5: Commit**

```bash
git add public/css/podcast-converter.css public/podcast-converter/index.html
git commit -m "feat: light mode for podcast-converter page"
```

---

## Task 8: Apply theme to podcast-reviewer page

**Files:**
- Modify: `public/css/podcast-reviewer.css`
- Modify: `public/podcast-reviewer/index.html`

- [ ] **Step 1: Add `:root` variables at the top of `podcast-reviewer.css`**

```css
:root {
  --bg:         #0d1117;
  --surface:    #161b22;
  --border:     #21262d;
  --text:       #e2e8f0;
  --text-muted: #64748b;
  --text-sub:   #94a3b8;
  --gold:       #e8c96a;
  --gold-on-dark: #0d1117;
}
```

- [ ] **Step 2: Replace hardcoded colours in `podcast-reviewer.css`**

| Find | Replace with |
|---|---|
| `background: #0d1117` | `background: var(--bg)` |
| `color: #e2e8f0` | `color: var(--text)` |
| `color: #94a3b8` | `color: var(--text-sub)` |
| `color: #64748b` | `color: var(--text-muted)` |
| `color: #e8c96a` | `color: var(--gold)` |
| `background: #e8c96a` | `background: var(--gold)` |
| `color: #0d1117` (text on gold) | `color: var(--gold-on-dark)` |
| `border.*#21262d` | replace `#21262d` → `var(--border)` |
| `#cbd5e1` (light border used in this file) | `var(--border)` |

Leave `#fca5a5`, `#fde68a`, `#86efac`, `#facc15`, `#f87171` as-is — all semantic status colours.

- [ ] **Step 3: Add `theme.css` link to `podcast-reviewer/index.html`**

Find:
```html
  <link rel="stylesheet" href="/css/podcast-reviewer.css" />
```
Add after it:
```html
  <link rel="stylesheet" href="/shared/theme.css" />
```

Add before `</body>`:
```html
  <button class="theme-toggle" id="theme-toggle" title="Toggle light/dark">☀️</button>
  <script src="/shared/theme.js"></script>
```

- [ ] **Step 4: Visual test**

Open http://localhost:3000/podcast-reviewer/ — review output and status cards render correctly in both modes.

- [ ] **Step 5: Run full test suite**

```bash
cd "/Users/timothytraviss/Library/CloudStorage/Dropbox/Claude Code/AI Playground"
npm test
```

Expected: 36 tests passing.

- [ ] **Step 6: Commit**

```bash
git add public/css/podcast-reviewer.css public/podcast-reviewer/index.html
git commit -m "feat: light mode for podcast-reviewer page"
```

---

## Self-Review

| Spec requirement | Covered by |
|---|---|
| Floating corner toggle button | All tasks — `.theme-toggle` in `theme.css`, button added to each page |
| Warm paper light palette | Task 1 — `body.light` in `theme.css` |
| Preference persists via localStorage | Task 1 — `theme.js` |
| Preference shared across all pages | Task 1 — single key `ai-playground-theme` |
| All 8 pages covered | Tasks 2–8 |
| Semantic colours unchanged | All tasks — `#4ade80`, `#f87171` etc. left as-is |
| No backend changes | Confirmed — all changes are frontend only |
| No new dependencies | Confirmed — vanilla CSS + JS only |
