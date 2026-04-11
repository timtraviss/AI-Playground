# Traviss.org — AI Demo Projects

A Node.js/Express web app hosted at [Traviss.org](https://traviss.org) that showcases three tools built for New Zealand policing and law contexts.

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

Required environment variables: `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `OPENAI_API_KEY`, `LEGISLATION_API_KEY`.

### Running tests

```bash
npm test
```

Tests cover `computeTargetKbps` edge cases and require no external dependencies (ffmpeg not needed).

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
- [x] Post-interview critique scored against NZ Police PEACE model
- [x] Tiered witness disclosure model (4 tiers)
- [x] Questioning technique breakdown (TEDS / closed / leading counts)
- [x] Annotated full transcript in feedback screen
- [ ] Additional witness scenarios beyond Catherine
- [ ] Student session history and progress tracking
- [ ] Instructor dashboard to review student submissions

### Podcast Converter
- [x] M4A → MP3 conversion via server-side ffmpeg (ffmpeg-static — no buildpack)
- [x] Deterministic 25 MB output guarantee with bitrate planning + bounded retry
- [x] Auto / Low / Medium / High quality presets (all cap at 25 MB)
- [x] Force Mono toggle for extra size savings
- [x] Real-time SSE progress (upload → analyse → convert % → verify → done)
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
- [ ] Support for YouTube / podcast URL input (no file upload needed)
- [ ] Exportable PDF report of findings

### Code Quality & Security
- [x] Parallel three-agent code review orchestrator (`tools/review.py`)
- [x] `/review` Claude Code slash command and VS Code task
- [x] Path traversal fix in witness route (trailing `/` in startsWith check)
- [x] Safe Claude response parsing (`.find(b => b.type === 'text')`) in all three Claude lib files
- [x] `stop_reason` check in critique generator — descriptive error on `max_tokens` truncation
- [x] ElevenLabs system prompt override implemented (POST with `conversation_config_override`)
- [x] Env var guard in latest-conversation route — 503 if ElevenLabs not configured
- [x] Input validation in `promptBuilder` — descriptive errors on missing witness fields

### Deployment
- [x] Heroku-ready (Procfile, engines field, ephemeral /tmp uploads)
- [ ] Deploy to Heroku
