# DDP Tutor Light Mode — Design Spec
**Date:** 2026-04-21
**Project:** Traviss.org AI Playground
**Author:** Tim Traviss

---

## Overview

Add a light/dark mode toggle to the DDP Tutor chat interface (`public/tutor/index.html`). The toggle is a floating corner button. Light mode uses a warm paper palette. The preference persists via `localStorage`. All changes are confined to `public/tutor/index.html` — no backend changes, no new dependencies.

---

## Toggle

- A small floating button fixed to the bottom-right corner of the viewport (`position: fixed; bottom: 20px; right: 20px`)
- Dark mode: button shows ☀️ (click to switch to light)
- Light mode: button shows 🌙 (click to switch back to dark)
- On click: toggles `body.light` class, writes `'light'` or `'dark'` to `localStorage` key `ddp-theme`
- On page load: reads `localStorage` and applies `body.light` if value is `'light'`
- Styled to match the UI: `background: var(--surface); border: 1px solid var(--border); border-radius: 50%; width: 36px; height: 36px`

---

## Colour System

All hardcoded colour values in the `<style>` block are replaced with CSS custom properties. Dark mode values live on `:root`. Light mode values override them via `body.light`.

### CSS Custom Properties

| Property | Dark (`:root`) | Light (`body.light`) |
|---|---|---|
| `--bg` | `#0d1117` | `#faf7f2` |
| `--surface` | `#161b22` | `#f0ebe0` |
| `--border` | `#21262d` | `#e8e0d0` |
| `--text` | `#e2e8f0` | `#292524` |
| `--text-muted` | `#64748b` | `#78716c` |
| `--gold` | `#e8c96a` | `#a07800` |
| `--gold-on-dark` | `#0d1117` | `#ffffff` |
| `--user-bubble-bg` | `#e8c96a` | `#c49a00` |
| `--user-bubble-text` | `#0d1117` | `#ffffff` |

### Colour Usage Map

Every hardcoded hex in the CSS is replaced:

| Hardcoded value | Replace with |
|---|---|
| `#0d1117` (page bg) | `var(--bg)` |
| `#161b22` (surface) | `var(--surface)` |
| `#21262d` (border) | `var(--border)` |
| `#e2e8f0` (text) | `var(--text)` |
| `#64748b` (muted) | `var(--text-muted)` |
| `#e8c96a` (gold) | `var(--gold)` |
| `#0d1117` (text on gold) | `var(--gold-on-dark)` |
| User bubble background | `var(--user-bubble-bg)` |
| User bubble text | `var(--user-bubble-text)` |
| `#94a3b8` (icon/placeholder colour) | kept as-is — close enough in both modes |

---

## Scope

- Applies to both the setup screen and the chat screen (single `body.light` class covers all)
- Single file change: `public/tutor/index.html`
- No changes to `server/`, no new CSS files, no new dependencies

---

## What Stays the Same

- Fugaz One font for the setup screen title
- All layout, spacing, and structure
- All JavaScript logic (voice, TTS, streaming, session management)
- Nav bar styling (outside this file's scope)

---

## File

Single file: `public/tutor/index.html`

1. Add CSS custom properties to `:root` and `body.light` override block
2. Replace all hardcoded colour values in CSS with `var(--*)` references
3. Add `.theme-toggle` CSS rule (fixed position, circular button)
4. Add `<button class="theme-toggle" id="theme-toggle">☀️</button>` to the HTML (outside all screen divs, directly before `</body>`)
5. Add JS: read `localStorage` on load, apply `body.light` if needed, update button icon; click handler toggles class + writes to `localStorage`
