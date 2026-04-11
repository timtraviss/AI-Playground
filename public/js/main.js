/**
 * P.E.A.C.E. Model Investigative Interviewing Tutor
 *
 * Flow:
 *   1. Load witness metadata + scenario text in parallel → briefing screen
 *   2. "Begin Interview" → show interview screen, start 30s enable-timer
 *   3. ElevenLabs widget handles the voice call (student clicks mic button)
 *   4. elevenlabs-convai:call event → enable Get Critique early + start timer
 *   5. Student ends call via widget, clicks "Get Critique"
 *   6. /api/latest-conversation → conversationId → transcript retry → /api/critique → results
 */

import {
  showScreen, startTimer, stopTimer,
  setStatus, setInterviewWitness, setProcessingStep,
} from './ui.js';

const WITNESS_ID = 'witness-catherine';

// ── State ──────────────────────────────────────────────
let sessionStartedAt = null;
let conversationId   = null;
let enableTimer      = null;   // 30s fallback to enable Get Critique
let lastTranscript   = null;

let witnessName     = 'Catherine Johnson';
let witnessInitials = 'CJ';

// ── DOM refs ───────────────────────────────────────────
const btnStart          = document.getElementById('btn-start');
const btnEnd            = document.getElementById('btn-end');
const btnRetry          = document.getElementById('btn-retry');
const btnRetryBottom    = document.getElementById('btn-retry-bottom');
const btnRetryCritique  = document.getElementById('btn-retry-critique');
const btnTranscriptToggle = document.getElementById('btn-transcript-toggle');
const transcriptContainer = document.getElementById('transcript-turns');
const widget            = document.getElementById('convai-widget');

// ── Load briefing screen data ──────────────────────────
async function loadBriefingData() {
  try {
    const [witnessRes, scenarioRes] = await Promise.all([
      fetch(`/api/witness/${WITNESS_ID}`),
      fetch('/api/scenario'),
    ]);

    const witness  = await witnessRes.json();
    const scenario = await scenarioRes.json();

    witnessName     = witness.name;
    witnessInitials = witness.avatarInitials;

    document.getElementById('witness-avatar').textContent = witness.avatarInitials;
    document.getElementById('witness-name').textContent   = witness.name;
    document.getElementById('witness-role').textContent   = witness.role;
    document.getElementById('witness-org').textContent    = witness.organization;
    document.getElementById('briefing-text').textContent  = scenario.briefing;
    document.getElementById('briefing-note').textContent  = scenario.task;

    btnStart.disabled = false;
  } catch (err) {
    console.error('[interview] Failed to load briefing data:', err);
    document.getElementById('briefing-text').textContent =
      'Failed to load scenario. Is the server running?';
  }
}

// ── Begin Interview ────────────────────────────────────
btnStart.addEventListener('click', () => {
  sessionStartedAt = new Date().toISOString();
  conversationId   = null;
  lastTranscript   = null;

  setInterviewWitness(witnessName, witnessInitials);
  showScreen('interview');
  setStatus('connecting');

  // Enable Get Critique after 30s regardless of widget events
  clearTimeout(enableTimer);
  enableTimer = setTimeout(() => {
    btnEnd.disabled = false;
    setStatus('live');
  }, 30_000);
});

// ── Widget call-start event (best-effort) ──────────────
// The widget only dispatches 'elevenlabs-convai:call' (call start) — there is no call_end event.
// If it fires, enable Get Critique immediately and start the visual timer.
// The 30s fallback above covers cases where the event doesn't fire.
if (widget) {
  widget.addEventListener('elevenlabs-convai:call', (e) => {
    console.log('[interview] widget call started:', e.detail);
    clearTimeout(enableTimer);
    btnEnd.disabled = false;
    setStatus('live');
    startTimer();
  });
}

// ── Get Critique ───────────────────────────────────────
btnEnd.addEventListener('click', async () => {
  btnEnd.disabled    = true;
  btnEnd.textContent = 'Retrieving…';
  stopTimer();
  clearTimeout(enableTimer);
  showScreen('processing');
  setProcessingStep('step-transcript');

  // Give ElevenLabs time to register the completed call in their API
  await delay(5000);

  // Look up the most recent conversation for this session
  try {
    const url = `/api/latest-conversation?since=${encodeURIComponent(sessionStartedAt)}`;
    console.log('[interview] fetching latest-conversation, since:', sessionStartedAt);
    const res  = await fetch(url);
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.warn('[interview] latest-conversation failed:', res.status, JSON.stringify(errBody));
      throw new Error(`latest-conversation returned ${res.status}`);
    }
    const data = await res.json();
    conversationId = data.conversationId;
    console.log('[interview] got conversationId:', conversationId);
  } catch (err) {
    console.warn('[interview] latest-conversation error:', err.message);
  }

  if (!conversationId) {
    showResultsWithError(
      'No interview found — did you start a call using the widget? ' +
      'End the call first, then click Get Critique.'
    );
    return;
  }

  await runPostCall();
});

// ── Post-call: transcript fetch + critique ─────────────
async function runPostCall() {
  // ElevenLabs processes the conversation server-side after the call ends.
  // Poll until status === 'done' (up to ~45s), then fetch the transcript.
  const DONE_STATUSES = new Set(['done', 'completed', 'success']);
  const MAX_ATTEMPTS  = 9;
  const POLL_INTERVAL = 5000; // 5s between attempts

  let turns = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // No extra delay on attempt 1 — btnEnd already waited 5s before calling runPostCall
    if (attempt > 1) await delay(POLL_INTERVAL);
    try {
      const res = await fetch(`/api/transcript/${encodeURIComponent(conversationId)}`);
      if (!res.ok) throw new Error(`Transcript API ${res.status}`);
      const data = await res.json();
      const status = (data.status || '').toLowerCase();
      turns = data.turns || [];

      // Accept if status is done, or if we have turns (some accounts skip status)
      if (DONE_STATUSES.has(status) || turns.length > 0) break;

      // Still processing — keep waiting unless this is the last attempt
      console.log(`[interview] transcript status: ${status || 'unknown'}, attempt ${attempt}/${MAX_ATTEMPTS}`);
      if (attempt === MAX_ATTEMPTS) break; // use whatever we have
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) {
        showResultsWithError(`Could not retrieve transcript: ${err.message}`);
        return;
      }
    }
  }

  lastTranscript = turns;
  renderTranscript(turns);

  setProcessingStep('step-analyse');
  await runCritique();
}

async function runCritique() {
  try {
    const res = await fetch('/api/critique', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, witnessId: WITNESS_ID }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Critique request failed');
    }
    const critique = await res.json();
    renderResults(critique);
  } catch (err) {
    console.error('[interview] critique failed:', err);
    showResultsWithError(err.message);
  }
}

// ── Render results screen ──────────────────────────────
function renderResults(c) {
  const pct = Math.min(100, Math.max(0, c.overallScore || 0));
  const circumference = 2 * Math.PI * 52;
  const fill = document.getElementById('score-ring-fill');
  fill.style.strokeDasharray  = `${circumference}`;
  fill.style.strokeDashoffset = `${circumference - (pct / 100) * circumference}`;
  document.getElementById('score-value').textContent   = pct;
  document.getElementById('score-band').textContent    = c.overallBand || '';
  document.getElementById('score-summary').textContent = c.summary || '';

  // Phase bars
  const phaseContainer = document.getElementById('phase-bars');
  phaseContainer.innerHTML = '';
  const phases = [
    { key: 'engageExplain', label: 'Engage & Explain' },
    { key: 'account',       label: 'Account' },
    { key: 'closure',       label: 'Closure' },
  ];
  for (const { key, label } of phases) {
    const phase = c.phaseScores?.[key] || {};
    const s = phase.score || 0;
    phaseContainer.insertAdjacentHTML('beforeend', `
      <div class="phase-bar-item">
        <div class="phase-bar-header">
          <span class="phase-bar-label">${label}</span>
          <span class="phase-bar-score">${s}/100</span>
        </div>
        <div class="phase-bar-track"><div class="phase-bar-fill" style="width:${s}%"></div></div>
        ${phase.notes ? `<p class="phase-bar-notes">${escapeHtml(phase.notes)}</p>` : ''}
      </div>
    `);
  }

  // Questioning pills
  const qt = c.questioningTechnique || {};
  document.getElementById('questioning-row').innerHTML = `
    <div class="q-pill teds">
      <span class="q-pill-count">${qt.tedsCount ?? '--'}</span>
      <span class="q-pill-label">TEDS / Open</span>
    </div>
    <div class="q-pill leading">
      <span class="q-pill-count">${qt.leadingCount ?? '--'}</span>
      <span class="q-pill-label">Leading</span>
    </div>
    <div class="q-pill closed">
      <span class="q-pill-count">${qt.closedCount ?? '--'}</span>
      <span class="q-pill-label">Closed</span>
    </div>
  `;
  document.getElementById('questioning-notes').textContent = qt.notes || '';

  // Key facts
  const kf = c.keyFactsElicited || {};
  document.getElementById('facts-count').textContent =
    `${kf.totalElicited ?? 0} of ${kf.totalPossible ?? 0} key facts elicited`;
  const factsList = document.getElementById('facts-list');
  factsList.innerHTML = '';
  for (const f of (kf.facts || [])) {
    factsList.insertAdjacentHTML('beforeend', `
      <div class="fact-item ${f.elicited ? 'elicited' : 'missed'}">
        <span class="fact-icon">${f.elicited ? '✓' : '✗'}</span>
        <span class="fact-text">${escapeHtml(f.fact)}</span>
      </div>
    `);
  }

  // Strengths
  const strengthsList = document.getElementById('strengths-list');
  strengthsList.innerHTML = '';
  for (const s of (c.strengths || [])) {
    const li = document.createElement('li');
    li.className = 'strength-item';
    li.textContent = s;
    strengthsList.appendChild(li);
  }

  // Improvements
  const improvementsList = document.getElementById('improvements-list');
  improvementsList.innerHTML = '';
  for (const imp of (c.improvements || [])) {
    improvementsList.insertAdjacentHTML('beforeend', `
      <div class="improvement-card">
        <p class="improvement-issue">${escapeHtml(imp.issue)}</p>
        <p class="improvement-suggestion">${escapeHtml(imp.suggestion)}</p>
        ${imp.example ? `<p class="improvement-example">"${escapeHtml(imp.example)}"</p>` : ''}
      </div>
    `);
  }

  document.getElementById('critique-error').hidden = true;
  showScreen('results');
}

function showResultsWithError(msg) {
  document.getElementById('critique-error-msg').textContent = msg;
  document.getElementById('critique-error').hidden = false;
  showScreen('results');
}

// ── Transcript render + toggle ─────────────────────────
function renderTranscript(turns) {
  transcriptContainer.innerHTML = '';
  if (!turns || turns.length === 0) {
    transcriptContainer.innerHTML =
      '<p class="tx-empty">No transcript available for this session.</p>';
    return;
  }
  for (const turn of turns) {
    const isStudent = turn.role === 'user';
    const div = document.createElement('div');
    div.className = `tx-turn ${isStudent ? 'tx-student' : 'tx-witness'}`;
    div.innerHTML = `
      <div class="tx-speaker">${isStudent ? 'You (Student)' : escapeHtml(witnessName)}</div>
      <div class="tx-message">${escapeHtml(turn.message)}</div>
    `;
    transcriptContainer.appendChild(div);
  }
}

btnTranscriptToggle?.addEventListener('click', () => {
  const hidden = transcriptContainer.hidden;
  transcriptContainer.hidden = !hidden;
  btnTranscriptToggle.textContent = hidden ? 'Hide Transcript' : 'Show Transcript';
});

// ── Retry critique ─────────────────────────────────────
btnRetryCritique?.addEventListener('click', async () => {
  document.getElementById('critique-error').hidden = true;
  setProcessingStep('step-analyse');
  showScreen('processing');
  await runCritique();
});

// ── Reset / retry ──────────────────────────────────────
function resetForRetry() {
  clearTimeout(enableTimer);
  stopTimer();
  sessionStartedAt = null;
  conversationId   = null;
  lastTranscript   = null;
  btnEnd.disabled    = true;
  btnEnd.textContent = 'Get Critique';
  btnStart.disabled  = false;
  btnStart.innerHTML = '<span class="btn-icon">▶</span> Begin Interview';
  showScreen('intro');
}

[btnRetry, btnRetryBottom].forEach(btn => btn?.addEventListener('click', resetForRetry));

// ── Helpers ────────────────────────────────────────────
function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Init ───────────────────────────────────────────────
loadBriefingData();
showScreen('intro');
