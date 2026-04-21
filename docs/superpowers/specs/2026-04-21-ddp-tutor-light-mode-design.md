# Site-Wide Light Mode — Design Spec
**Date:** 2026-04-21
**Project:** Traviss.org AI Playground
**Author:** Tim Traviss

---

## Overview

Add a light/dark mode toggle to all 8 pages of the AI Playground site. The toggle is a small floating button in the bottom-right corner. Light mode uses a warm paper palette. The preference persists via `localStorage` and is shared across all pages. All colour values are extracted into shared CSS and JS files so the palette is defined in one place.

---

## Pages in Scope

| Page | File |
|---|---|
| Home / nav | `public/index.html` |
| Admin | `public/admin/index.html` |
| Interview (P.E.A.C.E.) | `public/interview/index.html` |
| L3 Reviewer | `public/l3-reviewer/index.html` |
| Podcast Converter | `public/podcast-converter/index.html` |
| Podcast Reviewer | `public/podcast-reviewer/index.html` |
| Proofreader | `public/proofreader/index.html` |
| DDP Tutor | `public/tutor/index.html` |

---

## Shared Files

Two new files handle all theming logic:

### `public/shared/theme.css`
Defines the CSS custom properties for both modes:

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

body.light {
  --bg:               #faf7f2;
  --surface:          #f0ebe0;
  --border:           #e8e0d0;
  --text:             #292524;
  --text-muted:       #78716c;
  --gold:             #a07800;
  --gold-on-dark:     #ffffff;
  --user-bubble-bg:   #c49a00;
  --user-bubble-text: #ffffff;
}

.theme-toggle {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 36px;
  height: 36px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 50%;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  transition: border-color 0.15s;
}

.theme-toggle:hover { border-color: var(--gold); }
```

### `public/shared/theme.js`
Handles persistence and the toggle click:

```js
(function () {
  const STORAGE_KEY = 'ai-playground-theme';
  const btn = document.getElementById('theme-toggle');

  function apply(theme) {
    document.body.classList.toggle('light', theme === 'light');
    if (btn) btn.textContent = theme === 'light' ? '🌙' : '☀️';
  }

  apply(localStorage.getItem(STORAGE_KEY) || 'dark');

  if (btn) {
    btn.addEventListener('click', () => {
      const next = document.body.classList.contains('light') ? 'dark' : 'light';
      localStorage.setItem(STORAGE_KEY, next);
      apply(next);
    });
  }
})();
```

---

## Per-Page Changes

Each of the 8 pages gets three small changes:

1. **Link the shared CSS** — add inside `<head>`, before the page's own `<style>` block:
   ```html
   <link rel="stylesheet" href="/shared/theme.css" />
   ```
   (For pages in subdirectories, path is always `/shared/theme.css` — served from root.)

2. **Replace hardcoded colours** — in the page's own `<style>` block, replace all hardcoded hex values with `var(--*)` references (see colour map below).

3. **Add toggle button + script** — directly before `</body>`:
   ```html
   <button class="theme-toggle" id="theme-toggle">☀️</button>
   <script src="/shared/theme.js"></script>
   ```

---

## Colour Usage Map

Every hardcoded hex across all pages is replaced consistently:

| Hardcoded value | Replace with |
|---|---|
| `#0d1117` (page background) | `var(--bg)` |
| `#161b22` (surface / inputs / cards) | `var(--surface)` |
| `#21262d` (borders) | `var(--border)` |
| `#e2e8f0` (body text) | `var(--text)` |
| `#64748b` (muted / placeholder text) | `var(--text-muted)` |
| `#e8c96a` (gold accent) | `var(--gold)` |
| `#0d1117` (text on gold backgrounds) | `var(--gold-on-dark)` |
| User/send bubble background | `var(--user-bubble-bg)` |
| User/send bubble text | `var(--user-bubble-text)` |
| `#94a3b8` (icon colour) | kept as-is — works in both modes |
| `#4ade80`, `#f87171` (status colours) | kept as-is — semantic, not themed |

---

## Toggle Behaviour

- Default: dark mode (no class on `body`)
- On click: toggles `body.light`, writes `'light'` or `'dark'` to `localStorage` key `ai-playground-theme`
- On page load: reads `localStorage` and applies immediately — no flash
- Preference is shared across all pages (same `localStorage` key)

---

## What Stays the Same

- All layout, spacing, and structure on every page
- All JavaScript logic (voice, TTS, streaming, session management, admin functions)
- Semantic colours (`#4ade80` success green, `#f87171` error red) — these stay hardcoded
- `#94a3b8` icon/placeholder colour — works acceptably in both modes

---

## New Files

| File | Purpose |
|---|---|
| `public/shared/theme.css` | CSS variables for both modes + `.theme-toggle` style |
| `public/shared/theme.js` | Toggle logic + `localStorage` persistence |

No backend changes. No new npm dependencies.
