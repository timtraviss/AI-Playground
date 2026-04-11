/**
 * P.E.A.C.E. Model Investigative Interviewing Tutor
 *
 * Flow:
 *   1. Load witness metadata from /api/witness/:id — populates briefing screen
 *   2. "Begin Interview" → navigate to interview screen
 *   3. Student clicks the ElevenLabs widget microphone button to start the call
 *   4. elevenlabs-convai:call event → start timer, set status Live
 *   5. Student clicks "Get Transcript" → wait 3s → fetch via /api/latest-conversation
 *      fallback → /api/transcript/:id → render transcript screen
 */

import { showScreen, startTimer, stopTimer, setStatus, setInterviewWitness } from './ui.js';

const WITNESS_ID = 'witness-catherine';

// ── State ──────────────────────────────────────────────
let conversationId   = null;
let sessionStartedAt = null;

// ── DOM refs ───────────────────────────────────────────
const btnStart       = document.getElementById('btn-start');
const btnEnd         = document.getElementById('btn-end');
const btnRetry       = document.getElementById('btn-retry');
const btnRetryBottom = document.getElementById('btn-retry-bottom');
const widget         = document.getElementById('convai-widget');

let witnessName     = 'Catherine Johnson';
let witnessInitials = 'CJ';

// ── Load witness metadata for briefing screen ──────────
async function loadWitnessMetadata() {
  try {
    const res  = await fetch(`/api/witness/${WITNESS_ID}`);
    const data = await res.json();
    witnessName     = data.name;
    witnessInitials = data.avatarInitials;

    document.getElementById('witness-avatar').textContent = data.avatarInitials;
    document.getElementById('witness-name').textContent   = data.name;
    document.getElementById('witness-role').textContent   = data.role;
    document.getElementById('witness-org').textContent    = data.organization;
    document.getElementById('briefing-text').textContent  = data.scenarioBlurb;
    document.getElementById('briefing-note').textContent  = data.briefingNote;

    btnStart.disabled = false;
  } catch (err) {
    console.error('[interview] Failed to load witness:', err);
    document.getElementById('briefing-text').textContent =
      'Failed to load scenario. Is the server running?';
  }
}

// ── Begin Interview — navigate to interview screen ─────
btnStart.addEventListener('click', () => {
  sessionStartedAt = new Date().toISOString();
  conversationId   = null;
  setInterviewWitness(witnessName, witnessInitials);
  showScreen('interview');
});

// ── Widget call-start event ────────────────────────────
// Fires when the student clicks the ElevenLabs microphone button to start the call.
// The widget may include a conversationId in the event detail — capture it if present.
if (widget) {
  widget.addEventListener('elevenlabs-convai:call', (e) => {
    console.log('[interview] widget call started:', e.detail);
    conversationId = e.detail?.conversationId || null;
    setStatus('live');
    startTimer();
  });
}

// ── Get Transcript ─────────────────────────────────────
btnEnd.addEventListener('click', async () => {
  btnEnd.disabled    = true;
  btnEnd.textContent = 'Retrieving...';
  stopTimer();
  showScreen('processing');

  // Wait for ElevenLabs to finalise the conversation record server-side
  await delay(3000);

  try {
    // If the widget didn't surface a conversationId, look up the latest call
    if (!conversationId) {
      console.log('[interview] no conversationId from widget — fetching latest');
      const url = `/api/latest-conversation?since=${encodeURIComponent(sessionStartedAt || new Date().toISOString())}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        conversationId = data.conversationId;
      }
    }

    if (!conversationId) {
      throw new Error(
        'No conversation found. Did the call connect? Please end the call using the microphone button, then try again.'
      );
    }

    const res = await fetch(`/api/transcript/${encodeURIComponent(conversationId)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Failed to retrieve transcript from ElevenLabs');
    }

    const { turns } = await res.json();
    showTranscriptScreen(turns);

  } catch (err) {
    console.error('[interview] error fetching transcript:', err);
    alert(err.message);
    resetForRetry();
  }
});

// ── Render transcript result screen ───────────────────
function showTranscriptScreen(turns) {
  const container = document.getElementById('transcript-turns');
  container.innerHTML = '';

  if (!turns || turns.length === 0) {
    container.innerHTML =
      '<p class="tx-empty">No transcript available — the conversation may not have been recorded.</p>';
  } else {
    turns.forEach((turn) => {
      const isStudent = turn.role === 'user';
      const speaker   = isStudent ? 'You (Student)' : witnessName;
      const div = document.createElement('div');
      div.className = `tx-turn ${isStudent ? 'tx-student' : 'tx-witness'}`;
      div.innerHTML = `
        <div class="tx-speaker">${speaker}</div>
        <div class="tx-message">${escapeHtml(turn.message)}</div>
      `;
      container.appendChild(div);
    });
  }

  document.getElementById('transcript-witness-name').textContent = witnessName;
  showScreen('transcript');
}

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Reset / retry ──────────────────────────────────────
function resetForRetry() {
  conversationId   = null;
  sessionStartedAt = null;
  stopTimer();
  btnEnd.disabled    = false;
  btnEnd.textContent = 'Get Transcript';
  btnStart.disabled  = false;
  btnStart.innerHTML = '<span class="btn-icon">▶</span> Begin Interview';
  showScreen('intro');
}

[btnRetry, btnRetryBottom].forEach(btn => btn?.addEventListener('click', resetForRetry));

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Init ───────────────────────────────────────────────
loadWitnessMetadata();
showScreen('intro');
