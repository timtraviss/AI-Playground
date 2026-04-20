# DDP Tutor Chat UI Redesign — Design Spec
**Date:** 2026-04-21
**Project:** Traviss.org AI Playground
**Author:** Tim Traviss

---

## Overview

Redesign the DDP Tutor chat interface (`public/tutor/index.html`) for better readability. The current layout spans the full screen width with heavy bubble styling on assistant messages. The redesign centres the conversation in a constrained 700px column, removes avatars, and strips the assistant bubble so responses read as clean flowing text — closer to a document than a chat widget.

Changes are confined to `public/tutor/index.html` — CSS updates and minor JS DOM changes. No backend changes, no new dependencies.

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

The bouncing dots typing indicator stays, rendered as plain dots within the column — no bubble wrapper.

### 6. Voice mode footer

When voice mode is active the textarea is hidden. The footer shows:

- **Idle:** A placeholder input area with text "Tap the mic to speak" (same height/border-radius as the textarea) + mic button in the same right-side corner position as the send button.
- **Listening:** The placeholder area replaced by five animated vertical bars (CSS `@keyframes` height pulse) in red (`#f87171`) with a red border — gives clear visual feedback that the mic is active. The mic button itself also turns red.

This keeps the footer layout identical between text and voice modes — the input area is always present, only its content changes.

### 7. Replay button

With no assistant bubble, the 🔊 Replay link sits inline directly below each assistant response as a small muted text link (`color: #64748b; font-size: 12px`). It becomes visible after the response completes streaming, same as before.

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
| Voice idle state | textarea hidden, mic button shown | placeholder input area ("Tap the mic to speak") + mic button right-aligned |
| Voice listening state | mic button turns red | placeholder replaced by animated red waveform bars + red mic button |
| `.replay-btn` | below assistant bubble | inline below assistant text, `font-size: 12px`, `color: #64748b` |

---

## File

Single file change: `public/tutor/index.html`

- Add `.chat-inner { max-width: 700px; margin: 0 auto; width: 100%; }` utility class
- Wrap header content, message list content, and footer content in `.chat-inner` divs
- Remove avatar elements from `appendMessage()` and `appendTyping()` JS functions
- Update `.message.assistant .bubble` CSS to remove background/border
- Update `.message` max-width values
- Add `.voice-placeholder` element to footer HTML (hidden in text mode, shown in voice mode)
- Add `.waveform` bars inside `.voice-placeholder` for listening state (CSS animation)
- Voice mode JS: toggle between textarea and `.voice-placeholder`; toggle `.listening` class on placeholder for waveform animation
