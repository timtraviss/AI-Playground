# Traviss.org — AI Demo Projects

A Node.js/Express web app hosted at [Traviss.org](https://traviss.org) that showcases tools built for New Zealand policing and law contexts.

## Projects

### P.E.A.C.E. Interview Tutor (`/interview/`)

Practice investigative interviewing against an AI witness powered by ElevenLabs voice synthesis. After the session, Claude (Sonnet 4.6) evaluates the full transcript against the NZ Police PEACE model and returns a structured critique covering:

- Overall score (0–100) with band: Distinction / Merit / Pass / Not Yet
- Phase scores for Engage & Explain, Account, and Closure
- Questioning technique breakdown (TEDS/open, closed, leading counts)
- Key facts elicited from a tiered witness disclosure model
- Specific strengths and actionable improvement cards with better-phrasing examples
- Full annotated transcript

The witness scenario (currently: Catherine) holds facts across four disclosure tiers — students who use open TEDS questioning unlock more facts and score higher.

### Podcast Converter (`/podcast-converter/`)

Upload an M4A podcast file (up to 250 MB). The app converts it to MP3 and **guarantees the output is under 25 MB**:

1. Probes duration via ffprobe
2. Computes the highest bitrate that fits (32–192 kbps, with a 4% safety margin)
3. Applies preset (Auto / Low / Medium / High) and optional Force Mono
4. Verifies output size and re-encodes with a lower bitrate (up to 2 retries) if needed
5. Returns a streaming download of the converted MP3

Conversion runs server-side using ffmpeg binaries bundled via `ffmpeg-static` — no client-side WASM or system ffmpeg required.

### Podcast Legislation Reviewer (`/podcast-reviewer/`)

Upload a NZ Police DDP podcast audio file (MP3, M4A, WAV — up to 200 MB). The app:

1. Transcribes the audio via OpenAI Whisper
2. Uses Claude to extract every legislative claim made in the podcast
3. Checks each claim against live in-force legislation via [legislation.govt.nz](https://legislation.govt.nz)
4. Returns a verdict per claim: accurate, inaccurate, or unverifiable

A companion Claude Code skill (`podcast-reviewer.skill`) lets you trigger the same review workflow directly from within Claude Code.

### Module Proofreader (`/proofreader/`)

Upload a NZ Police Detective Development Programme (DDP) learning module (DOCX), plus an optional previously-approved reference module. The app:

1. Extracts plain text from both DOCX files via mammoth
2. Sends the text to Claude Sonnet 4.6 with the full DDP style ruleset (NZ English, structure, legislation, learning objectives, formatting)
3. Returns structured JSON: issues with category, severity, and `searchText` anchors
4. Injects every issue as a Word comment directly into the DOCX ZIP (pizzip + XML manipulation)
5. Returns a downloadable `_reviewed.docx` ready to open in Word — comments appear in the sidebar with category tags and fix suggestions

A companion Claude Code skill (`proofreader.skill`) is available for terminal-based review workflows.

### L3 Interview Reviewer (`/l3-reviewer/`)

Upload a Word (.docx) transcript of a NZ Police Level 3 investigative interview. The app:

1. Guides the assessor through a 3-step wizard capturing admin fields (Sections 1–3), planning notes (Section 4), and self-reflection (Section 9) from the paper moderation form
2. Extracts the transcript via mammoth
3. Sends it to Claude Sonnet 4.6 with an explicit law enforcement framing prompt — instructing Claude to treat victim/witness accounts as professional law enforcement material and assess only the interviewer's technique
4. Returns a structured JSON assessment across all four assessed sections (Engage & Explain, Account, Questioning, Closure) plus verdict and narrative
5. Displays a score-first results screen: verdict banner, section rating bars, strengths/learning points cards, collapsible per-item breakdowns
6. Generates downloadable Word (.docx) and Markdown reports built server-side before the SSE `done` event fires

All transcript content is processed in memory — nothing is written to disk or logged.

## Stack

- **Backend:** Node.js, Express
- **AI:** Anthropic Claude (Sonnet 4.6), OpenAI Whisper, ElevenLabs
- **Audio:** fluent-ffmpeg + ffmpeg-static (bundled Linux/macOS binaries — no system install needed)
- **Legislation API:** legislation.govt.nz REST API
- **Frontend:** Vanilla HTML/CSS/JS

## Setup

```bash
npm install
cp .env.example .env   # add your API keys
npm run convert-pdf    # converts the PEACE reference guide to markdown (run once)
npm start
```

Required environment variables: `CLAUDE_API_KEY`, `ELEVENLABS_API_KEY`, `OPENAI_API_KEY`, `LEGISLATION_API_KEY`.

Backward-compatible aliases still accepted in code: `ANTHROPIC_API_KEY` and `Legislation_API_KEY`.

### Running tests

```bash
npm test
```

Tests cover `computeTargetKbps` edge cases and the L3 report generator (`ratingLabel`, `buildMarkdownReport`). No external dependencies required (ffmpeg not needed).

## Recent Updates (2026-04-14)

- **New: L3 Interview Reviewer** — full end-to-end feature at `/l3-reviewer/`. Upload a Word transcript, fill in the moderation form context via a 3-step wizard, and receive an AI-powered assessment of the interviewer's PEACE technique across all four moderation sections (Engage & Explain, Account, Questioning, Closure). Results displayed on-screen with verdict banner, section rating bars, and collapsible breakdowns. Downloadable as Word or Markdown.

## Recent Updates (2026-04-11)

- Interview page now starts sessions via `/api/session` signed URLs, ensuring witness-specific prompt overrides are always applied.
- Interview startup now prefers ElevenLabs `agentId` sessions (per widget guidance), with signed URL fallback for compatibility.
- Runtime witness overrides are now applied at session start (`overrides.agent.prompt`, optional `overrides.tts.voiceId`) to better preserve Catherine persona/voice behavior.
- Catherine witness config now explicitly references `Catherine.md`, and session prompt building appends those supplemental witness notes.
- Latest-conversation fallback now requires a `since` timestamp window to reduce cross-session mixups.
- Fixed critique transcript toggle listener duplication after multiple retries.
- Added cleanup timers for Podcast Reviewer jobs to prevent in-memory job accumulation.
- Podcast Reviewer UX improved:
  - Upload now shows real-time progress (%) and elapsed timer.
  - Transcription step now shows live elapsed time while waiting on Whisper API.
  - Progress error panel now stays hidden unless an actual error occurs.
- Standardized env-var handling and docs:
  - Primary: `CLAUDE_API_KEY`, `LEGISLATION_API_KEY`
  - Backward-compatible aliases still supported: `ANTHROPIC_API_KEY`, `Legislation_API_KEY`
- Unified default witness behavior to `witness-catherine` for critique route consistency.

## Heroku Deployment

### ffmpeg — No Extra Buildpack Needed

`ffmpeg-static` and `ffprobe-static` bundle pre-compiled Linux x64 binaries that work out-of-the-box on Heroku's Cedar/Heroku-22/Heroku-24 stacks. No additional buildpack required.

Simply deploy as normal:

```bash
git push heroku main
```

### Podcast Converter Limitations

- **Upload limit:** 250 MB per file (configurable in `server/routes/podcastConverter.js`)
- **Output guaranteed < 25 MB** via bitrate planning and up to 2 retry re-encodes
- **Very long files (> 4 hours):** Output bitrate will be clamped to 32 kbps (mono). Quality will be poor — consider splitting the file first
- **Heroku free tier:** Conversion of large files may time out if the dyno sleeps. Use a paid dyno for production workloads
- **Temp storage:** Input and output files are written to Heroku's ephemeral `/tmp`. They are cleaned up automatically after download or after a 10-minute job expiry timeout

## Roadmap

### P.E.A.C.E. Interview Tutor
- [x] AI witness with ElevenLabs voice synthesis
- [x] ElevenLabs official widget embed (`<elevenlabs-convai>`) — inline/centred on interview screen, customisable from ElevenLabs dashboard
- [x] Tiered witness disclosure model (4 tiers)
- [x] `/api/transcript/:id` endpoint fetches ElevenLabs transcript after session ends (with 3-attempt retry)
- [x] Post-interview PEACE critique — student clicks "Get Critique" after ending call via widget
- [x] Full results screen — score ring, phase bars, TEDS/leading/closed pills, key facts, strengths, improvements
- [x] Scenario text loaded from `server/data/scenarios/catherine.md` — editable without code changes
- [x] Admin UI at `/admin` — edit scenario briefing and task via browser, password-protected
- [x] `GET /api/scenario` and `POST /api/admin/scenario` endpoints
- [x] Get Critique button enabled after 30s or on widget call-start event (whichever comes first)
- [x] `/api/latest-conversation` used to resolve conversationId after widget call ends
- [x] Interview footer redesigned — hint text on own row, timer + Get Critique button side by side (no squashing)
- [x] Get Critique button styled as `btn-primary` (matches Begin Interview)
- [x] `latestConversation` route: fixed timestamp field (`start_time_unix_secs`), sort newest-first, 2h clock-skew fallback, full debug logging on 404
- [x] Removed dead `elevenlabs-convai:call_end` listener (widget only emits call-start)
- [x] Transcript polling: removed redundant 5s delay on first attempt; detailed client-side error logging
- [x] `formatTranscriptForCritique` filters null/empty message turns before sending to Claude
- [ ] Additional witness scenarios beyond Catherine
- [ ] Student session history and progress tracking
- [ ] Instructor dashboard to review student submissions

### Podcast Converter
- [x] M4A → MP3 conversion via server-side ffmpeg (ffmpeg-static — no buildpack)
- [x] Deterministic 25 MB output guarantee with bitrate planning + bounded retry
- [x] Auto / Low / Medium / High quality presets (all cap at 25 MB)
- [x] Force Mono toggle for extra size savings
- [x] Real-time SSE progress (upload → analyse → convert % → verify → done)
- [x] Upload progress bar with live % and elapsed time (XHR-based, matching Reviewer UX)
- [x] Descriptive upload error messages (server errors now surface correctly)
- [x] Unit tests for `computeTargetKbps` (14 cases, Node built-in test runner)
- [ ] Split-into-parts option for files that can't fit even at 32 kbps mono
- [ ] YouTube / podcast URL input (no file upload needed)

### Podcast Legislation Reviewer
- [x] Audio upload and transcription via OpenAI Whisper API
- [x] Legislative claim extraction via Claude
- [x] Live claim verification against legislation.govt.nz
- [x] Claude Code skill (`podcast-reviewer.skill`)
- [x] Step-by-step progress indicators with checkmarks, error states, and retry
- [x] 25 MB file size enforcement with clear error messaging
- [x] Dark theme background fix (page now matches site-wide dark design)
- [x] Descriptive upload error messages (file too large, wrong type, etc.)
- [x] Uploading step with file size indicator for immediate feedback on submit
- [x] Configurable transcription model via `TRANSCRIPTION_MODEL` env var (whisper-1 / gpt-4o-mini-transcribe / gpt-4o-transcribe / gpt-4o-transcribe-diarize — defaults to diarize for speaker-labelled output)
- [x] Export results as Markdown file (client-side, no server round-trip)
- [x] Real audio timestamps ([MM:SS]) in diarized transcript — Claude uses these for accurate claim timestamps
- [x] Download Transcript button — exports full timestamped transcript as Markdown for audio navigation
- [x] Indeterminate shimmer progress bar on Transcribing step (Whisper API gives no incremental progress)
- [x] "Transcript ready" step between Transcribing and Extracting — shows word count on completion
- [x] 5-minute timeout on Whisper API fetch via `Promise.race` — reliably enforces deadline even when Node.js native fetch ignores AbortSignal
- [x] Automatic whisper-1 fallback on timeout — retries once with faster model; UI re-activates step with "Primary timed out — retrying…" note
- [x] Transcript ready step notes when speaker labels are unavailable (whisper-1 fallback used)
- [x] Server heartbeat every 30s during transcription — keeps SSE connection alive through proxies
- [x] Active model name shown in Transcribing step note (e.g. "Sending to gpt-4o-transcribe-diarize…")
- [ ] Support for YouTube / podcast URL input (no file upload needed)

### Code Quality & Security
- [x] Parallel three-agent code review orchestrator (`tools/review.py`)
- [x] `/review` Claude Code slash command and VS Code task
- [x] Path traversal fix in witness route (trailing `/` in startsWith check)
- [x] Safe Claude response parsing (`.find(b => b.type === 'text')`) in all three Claude lib files
- [x] `stop_reason` check in critique generator — descriptive error on `max_tokens` truncation
- [x] ElevenLabs system prompt override implemented (POST with `conversation_config_override`)
- [x] Env var guard in latest-conversation route — 503 if ElevenLabs not configured
- [x] Input validation in `promptBuilder` — descriptive errors on missing witness fields

### Module Proofreader
- [x] DOCX upload (module + optional reference) with 50 MB limit
- [x] Plain text extraction via mammoth
- [x] Claude Sonnet 4.6 review against full DDP style ruleset (8 categories: STRUCTURE, GRAMMAR, LANGUAGE, CONSISTENCY, CONTENT, FORMATTING, LEARNING_OBJ, LEGISLATION)
- [x] LEGISLATION issues always flagged as critical severity
- [x] Word comments injected into DOCX ZIP via pizzip — opens in Word with comment sidebar
- [x] SSE progress stream (Uploading → Extracting → Reviewing → Annotating → Done)
- [x] SSE heartbeat every 30 s during Claude review — prevents connection drops on long documents
- [x] Streaming Claude API — avoids SDK timeout on long documents; detects first token to confirm connection
- [x] Extended output beta (`output-128k-2025-02-19`) — raises output limit from 8 192 to 16 000 tokens, matches thoroughness of CLI skill
- [x] Truncation-aware error message — detects cut-off JSON and surfaces a clear user-facing explanation
- [x] "Reviewing with AI" shows "Connecting…" then "Generating review… Xm Ys" once Claude responds
- [x] Elapsed timer stops immediately on error (both SSE drop and Claude error events)
- [x] Legislation verification step — LEGISLATION-category issues checked against legislation.govt.nz; authoritative statutory text appended to Word comment
- [x] "Verifying legislation" step shown in progress UI only when LEGISLATION issues are found; skipped silently if API key absent
- [x] Summary panel with issue counts by category and critical issue callouts
- [x] Download reviewed `.docx` with `_reviewed` suffix
- [x] Landing page card and nav links added across all subpages
- [ ] Tracked changes (v2) — in addition to comments, insert Word tracked-change insertions/deletions

### L3 Interview Reviewer
- [x] 3-step wizard capturing admin fields, planning notes, and self-reflection (Sections 1–4, 9)
- [x] DOCX transcript upload and extraction via mammoth
- [x] Claude assessment against full Level 3 moderation form (Sections 5–8: Engage & Explain, Account, Questioning, Closure)
- [x] Law enforcement system prompt framing — prevents content filter refusals on sensitive victim/witness transcripts
- [x] Structured JSON output: per-item results (Yes/No/N/A, frequency), ratings 1–5, verdict, strengths, learning points, narrative summary
- [x] Score-first results screen: verdict banner (COMPETENT / NOT YET COMPETENT), section rating bars, strengths/learning cards, collapsible per-section breakdowns
- [x] Markdown report generation (server-side, downloadable)
- [x] Word (.docx) report generation via PizZip + raw Open XML (server-side, downloadable)
- [x] SSE progress stream with heartbeat — Uploading → Extracting → Reviewing → Generating → Done
- [x] In-memory report storage — no disk writes for sensitive transcript content
- [x] Landing page card and nav links added across all subpages
- [x] Unit tests for `ratingLabel` and `buildMarkdownReport` (10 cases)
- [ ] Section 4 (Planning & Preparation) AI assessment derived from planning notes
- [ ] Multi-transcript batch assessment

### Deployment
- [x] Heroku-ready (Procfile, engines field, ephemeral /tmp uploads)
- [ ] Deploy to Heroku
