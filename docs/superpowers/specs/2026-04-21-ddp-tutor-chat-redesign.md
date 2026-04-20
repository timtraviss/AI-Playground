# DDP Tutor Chat UI Redesign — Design Spec
**Date:** 2026-04-21
**Project:** Traviss.org AI Playground
**Author:** Tim Traviss

---

## Overview

Redesign the DDP Tutor chat interface (`public/tutor/index.html`) for better readability. The current layout spans the full screen width with heavy bubble styling on assistant messages. The redesign centres the conversation in a constrained 700px column, removes avatars, and strips the assistant bubble so responses read as clean flowing text — closer to a document than a chat widget.

This is a CSS-only change to `public/tutor/index.html`. No backend changes, no new dependencies.

---

## What Changes

### 1. Centred 700px column

All chat content — messages, header controls, input bar — constrained to `max-width: 700px; margin: 0 auto`. The header and footer bars remain full-width background strips (so the border lines extend edge-to-edge), but their inner content aligns to the 700px column.

### 2. Assistant messages — no bubble

Remove the dark background bubble and border from assistant messages. Text renders directly on the page background (`#0d1117`), left-aligned within the column. Markdown formatting (bold, lists, blockquotes) remains. The muted grey colour for follow-up reflective questions stays (`#64748b`).

### 3. User messages — gold pill, no avatar

Keep the gold pill bubble (`background: #e8c96a; color: #0d1117`), right-aligned. Remove the "You" avatar entirely.

### 4. Remove all avatars

Both the "You" (user) and "T" (tutor) avatars are removed. Message alignment (user right, assistant left) provides sufficient visual separation.

### 5. Typing indicator

The bouncing dots typing indicator stays, but rendered as plain text-line-height dots within the column (no bubble wrapper).

---

## What Stays the Same

- Dark theme: `#0d1117` background, `#e8c96a` gold, `#e2e8f0` text
- Fugaz One font for the setup screen title
- Mode toggle (Text / Voice pill) in the header
- New Session button
- SSE streaming — `bubbleEl.innerHTML` assignment during streaming
- All JavaScript logic (sendMessage, voice mode, TTS, SpeechRecognition)
- Setup screen layout (unchanged)
- Nav bar

---

## CSS Changes Summary

| Element | Before | After |
|---|---|---|
| `.chat-messages` | `padding: 24px` | `padding: 28px 24px` + inner `.chat-inner` wrapper at `max-width: 700px; margin: 0 auto` |
| `.message` | `max-width: 85%` | user: `max-width: 75%`; assistant: `max-width: 100%` |
| `.message.assistant .bubble` | dark bg + border | no background, no border, no border-radius — plain text |
| `.message.user .bubble` | gold bg, border-bottom-right-radius: 4px | unchanged |
| `.avatar` | displayed | removed from DOM |
| `.chat-header` inner | `padding: 16px 24px` direct | inner `div.chat-inner` wrapper constrained to 700px |
| `.chat-footer` inner | `padding: 16px 24px` direct | inner `div.chat-inner` wrapper constrained to 700px |

---

## File

Single file change: `public/tutor/index.html`

- Add `.chat-inner { max-width: 700px; margin: 0 auto; width: 100%; }` utility class
- Wrap header content, message list content, and footer content in `.chat-inner` divs
- Remove avatar elements from `appendMessage()` and `appendTyping()` JS functions
- Update `.message.assistant .bubble` CSS to remove background/border
- Update `.message` max-width values
