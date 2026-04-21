# DDP AI Tutor — Design Spec
**Date:** 2026-04-20
**Project:** Traviss.org AI Playground
**Author:** Tim Traviss

---

## Overview

An AI tutor for New Zealand Police trainee detectives studying the Detective Development Programme (DDP). Trainees select a module, then have a text or voice conversation with a Claude-powered tutor that answers strictly from that module's content — mirroring what they will be assessed on.

Tim uses it first to test and refine, with the goal of deploying it for actual trainees.

---

## Goals

- Convert DDP Word modules (.docx) to clean Markdown for AI consumption
- Trainee selects a module and has a multi-turn chat with a tutor
- Tutor answers only from module content (no outside knowledge)
- Supports both text chat and voice conversation (trainee's choice)
- Fits as a subpage of the existing Traviss.org AI Playground (Node.js/Express)
- Tim manages the knowledge base via an admin UI — no CLI required

---

## Architecture

Two deliverables:

1. **Knowledge management** — admin UI to upload .docx modules, convert to Markdown, store in `server/data/knowledge/`
2. **DDP Tutor page** — trainee-facing chat at `/tutor/` with voice/text toggle

```
Word (.docx)
    ↓ [Admin uploads via /admin Knowledge Base section]
    ↓ mammoth + style map → Markdown
    ↓
server/data/knowledge/{slug}.md   ←   modules.json (id → display name)
server/data/prompts/tutor-persona.md   (teaching approach + strict rules)
    ↓
Trainee visits /tutor/, picks module
    ↓
Persona + module .md injected into Claude system prompt (prompt-cached)
    ↓
Multi-turn chat streamed back via SSE
    ↓ (voice mode)
ElevenLabs TTS speaks the response
Web Speech API transcribes trainee speech → text → same chat pipeline
```

---

## Component 1: Knowledge Management (Admin)

### Admin Page Addition (`/admin`)

A new "Knowledge Base" card on the existing admin page. Trainees never see this.

**UI elements:**
- Module display name field (e.g. "Arson & Intentional Damage")
- `.docx` file picker
- "Convert & Save" button with progress indicator and confirmation
- Table of existing knowledge files: name, last updated, Delete button

### Conversion

Uses `mammoth` (already a project dependency) with a custom style map for DDP-specific Word styles:

| Word Style | Markdown Output |
|---|---|
| Heading 1 | `# Heading` |
| Heading 2 | `## Heading` |
| Heading 3 | `### Heading` |
| Normal | Plain paragraph |
| List Paragraph | `- bullet` (nested with indentation) |
| Quote DDP | `> blockquote` |
| annotation text | `*italic paragraph*` |
| Two-column legislation table | `**LABEL**\n> content` (requires custom table-walking logic — mammoth style maps cover paragraph styles only, not tables) |
| Images | `[IMAGE: placeholder]` |

### Server Endpoints (`server/routes/tutor.js`)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/tutor/knowledge/upload` | multer accepts .docx, converts, saves .md + updates modules.json |
| `GET` | `/api/tutor/modules` | returns module list from modules.json (used by admin + trainee UI) |
| `DELETE` | `/api/tutor/knowledge/:id` | removes .md and modules.json entry; validate `:id` against slug pattern to prevent path traversal (same pattern as `witness.js`) |

### Storage

- `server/data/knowledge/{slug}.md` — one file per module
- `server/data/knowledge/modules.json` — index: `[{ id, name, updatedAt }]`
- `server/data/prompts/tutor-persona.md` — tutor teaching approach + strict rules (Block 1 content)
- `knowledge/` directory committed with `.gitkeep`; actual module content excluded from git (NZ Police training material)
- `prompts/` directory and its contents committed to git — the persona defines the app's behaviour and changes should be reviewable

---

## Component 2: DDP Tutor Page (`/tutor/`)

### Tutor Chat Endpoint

**`POST /api/tutor/chat`**

Request body:
```json
{
  "moduleId": "arson_combined_module",
  "messages": [
    { "role": "user", "content": "What are the elements of arson?" }
  ]
}
```

- Reads the module `.md` from `server/data/knowledge/`
- Builds a two-block system prompt (see below)
- Streams Claude's response via SSE:
  ```
  data: {"text": "Arson under s267"}
  data: {"text": " of the Crimes Act..."}
  data: [DONE]
  ```
- Conversation state held entirely client-side; full `messages` array sent with each request
- Model: `claude-sonnet-4-6`

### System Prompt

Two blocks, both marked `cache_control: { type: "ephemeral" }` for prompt caching — the module content is large and the persona is static, so both benefit from being cached across every message in a session.

**Block 1 — Tutor persona (static):**

Loaded from `server/data/prompts/tutor-persona.md` at server startup (production) or on every request (development, via `NODE_ENV === 'development'` check — lets the persona be iterated on without a server restart). The file combines the teaching approach (how the tutor works with the trainee) and the six strict rules (the non-negotiable constraints) in a single voice.

```js
// Pseudocode — pattern, not final code
let cachedPersona = null;
function getPersona() {
  if (process.env.NODE_ENV === 'development' || !cachedPersona) {
    cachedPersona = fs.readFileSync(
      'server/data/prompts/tutor-persona.md',
      'utf-8'
    );
  }
  return cachedPersona;
}
```

**Block 2 — Module content (per session):**
```
MODULE: {displayName}

---
{moduleMarkdown}
---
```

The tutor's opening message (introducing itself and referencing the module name) is generated by Claude on the first turn of each session, not templated on the frontend — this way the `{displayName}` from Block 2 flows naturally into the greeting.

### Frontend (`public/tutor/index.html`)

Consistent with existing app pages (same nav, CSS variables, card styling).

**Session setup:**
- Module selector dropdown (from `/api/tutor/modules`)
- "Start Session" button — locks module selection, reveals chat area
- "New Session" button — resets conversation and module selection

**Text mode:**
- Textarea + Send button
- Enter to send, Shift+Enter for newline
- Assistant responses stream in word-by-word
- Message bubbles: trainee right-aligned, tutor left-aligned

**Voice/text toggle:**
- Pill toggle visible once a session starts
- Trainee can switch modes mid-session

**Voice mode:**
- Mic button replaces textarea — tap to start/stop recording
- `SpeechRecognition` (Web Speech API) transcribes speech to text
- Transcribed text sent to `/api/tutor/chat` — same pipeline as text mode
- Claude response streams back as text AND is passed to ElevenLabs TTS for playback
- Tutor text response always shown in chat — voice is additive
- Small replay icon on each tutor message to replay audio
- If Web Speech API unsupported (e.g. Firefox), voice toggle is hidden with a tooltip

**ElevenLabs TTS:**
- Called client-side using the existing `/api/config` pattern to retrieve the API key
- Voice ID configured via `ELEVENLABS_TUTOR_VOICE_ID` env var (separate from witness voice)

---

## Wiring (`server/index.js`)

```js
const { tutorRouter } = await import('./routes/tutor.js');
app.use('/api/tutor', tutorRouter);

app.get('/tutor', (req, res) => res.redirect('/tutor/'));
app.get('/tutor/', (req, res) =>
  res.sendFile(resolve(projectRoot, 'public', 'tutor', 'index.html')));
```

Home page (`public/index.html`) gets a DDP Tutor card alongside existing tool cards.

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `ELEVENLABS_TUTOR_VOICE_ID` | ElevenLabs voice for tutor TTS responses |
| `CLAUDE_API_KEY` / `ANTHROPIC_API_KEY` | Already set — no change |
| `ELEVENLABS_API_KEY` | Already set — no change |

---

## What's Not In Scope

- Authentication/access control for the tutor page (deferred — admin page already has auth)
- Automatic re-conversion when source .docx changes (manual upload is sufficient)
- Multiple simultaneous voice conversations (single-user local deployment for v1)
- RAG / semantic search across modules (single-module-per-session is sufficient)
