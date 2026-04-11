/**
 * P.E.A.C.E. Model Investigative Interviewing Tutor
 *
 * Flow:
 *   1. Load witness metadata + scenario text in parallel
 *   2. "Begin Interview" → Conversation.startSession() via ElevenLabs SDK
 *   3. onConnect → conversationId, enable End button, start timer
 *   4. "End Interview" or unexpected onDisconnect → runPostCall()
 *   5. runPostCall: fetch transcript (with retry) → POST /api/critique → render results
 */

import {
  showScreen, startTimer, stopTimer,
  setStatus, setMode, setInterviewWitness, setProcessingStep,
} from './ui.js';

const WITNESS_ID = 'witness-catherine';

// ── State ──────────────────────────────────────────────
let conversationId   = null;
let conversation     = null;
let callEnded        = false;  // guard against double-trigger
let lastTranscript   = null;   // saved so critique can be retried without re-fetching

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
const introError        = document.getElementById('intro-error');

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
btnStart.addEventListener('click', async () => {
  btnStart.disabled    = true;
  btnStart.textContent = 'Connecting...';
  introError.hidden    = true;

  const { Conversation } = window.ElevenLabsClient || {};
  if (!Conversation) {
    showInlineError(introError, 'ElevenLabs SDK failed to load. Please refresh and try again.');
    btnStart.disabled  = false;
    btnStart.innerHTML = '<span class="btn-icon">▶</span> Begin Interview';
    return;
  }

  // Fetch agentId from server — keeps it out of client HTML
  let agentId;
  try {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error('Could not load agent configuration');
    ({ agentId } = await res.json());
  } catch (err) {
    showInlineError(introError, err.message);
    btnStart.disabled  = false;
    btnStart.innerHTML = '<span class="btn-icon">▶</span> Begin Interview';
    return;
  }

  // Switch to interview screen before connecting so user sees feedback
  callEnded  = false;
  conversationId = null;
  conversation   = null;
  setInterviewWitness(witnessName, witnessInitials);
  showScreen('interview');
  setStatus('connecting');

  try {
    conversation = await Conversation.startSession({
      agentId,

      onConnect: ({ conversationId: id }) => {
        console.log('[interview] connected, conversationId:', id);
        conversationId = id;
        setStatus('live');
        startTimer();
        btnEnd.disabled = false;
        document.getElementById('speaking-label').textContent = 'Listening...';
      },

      onDisconnect: () => {
        console.log('[interview] disconnected');
        setStatus('disconnected');
        stopTimer();
        btnEnd.disabled = true;
        // Auto-trigger post-call flow if student didn't click End Interview
        if (!callEnded) {
          callEnded = true;
          runPostCall();
        }
      },

      onMessage: ({ source, message }) => {
        // Accumulate turns for transcript display
        // (actual transcript fetched from ElevenLabs API after call)
        console.log(`[interview] ${source}: ${message?.slice(0, 60)}`);
      },

      onModeChange: ({ mode }) => {
        setMode(
          mode,
          document.getElementById('interview-avatar'),
          document.getElementById('waveform'),
          document.getElementById('speaking-label'),
        );
      },

      onError: (message, context) => {
        console.error('[interview] ElevenLabs error:', message, context);
      },
    });
  } catch (err) {
    console.error('[interview] startSession failed:', err);
    const isPermission = err.name === 'NotAllowedError' ||
      (err.message || '').toLowerCase().includes('permission');
    const msg = isPermission
      ? 'Microphone access was denied. Please allow microphone access in your browser settings and try again.'
      : 'Could not connect to the interview agent: ' + err.message;
    setStatus('disconnected');
    document.getElementById('speaking-label').textContent = msg;
    btnEnd.disabled    = false;
    btnEnd.textContent = '↩ Back';
    btnEnd.addEventListener('click', resetForRetry, { once: true });
  }
});

// ── End Interview ──────────────────────────────────────
btnEnd.addEventListener('click', async () => {
  if (callEnded) return;
  callEnded = true;

  btnEnd.disabled    = true;
  btnEnd.textContent = 'Ending...';
  stopTimer();

  if (conversation) {
    try { await conversation.endSession(); } catch {}
    conversation = null;
  }

  runPostCall();
});

// ── Post-call: transcript + critique ──────────────────
async function runPostCall() {
  showScreen('processing');
  setProcessingStep('step-transcript');

  // Step 1: fetch transcript with retry
  let turns = null;
  const MAX_TRANSCRIPT_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_TRANSCRIPT_RETRIES; attempt++) {
    await delay(2000);
    try {
      if (!conversationId) {
        throw new Error('No conversation ID available — the call may not have connected.');
      }
      const res = await fetch(`/api/transcript/${encodeURIComponent(conversationId)}`);
      if (!res.ok) throw new Error(`Transcript API returned ${res.status}`);
      const data = await res.json();
      turns = data.turns || [];
      if (turns.length > 0) break; // got something
      // empty transcript — retry if we have attempts left
      if (attempt === MAX_TRANSCRIPT_RETRIES) break;
      console.log(`[interview] transcript empty, retry ${attempt}/${MAX_TRANSCRIPT_RETRIES}`);
    } catch (err) {
      if (attempt === MAX_TRANSCRIPT_RETRIES) {
        showResultsWithError(`Could not retrieve transcript: ${err.message}`);
        return;
      }
    }
  }

  lastTranscript = turns;
  renderTranscript(turns);

  // Step 2: PEACE critique
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
  // Score ring
  const pct     = Math.min(100, Math.max(0, c.overallScore || 0));
  const circumference = 2 * Math.PI * 52;
  const fill    = document.getElementById('score-ring-fill');
  fill.style.strokeDasharray  = `${circumference}`;
  fill.style.strokeDashoffset = `${circumference - (pct / 100) * circumference}`;
  document.getElementById('score-value').textContent = pct;
  document.getElementById('score-band').textContent  = c.overallBand || '';
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

  // Hide critique error block
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
    const speaker   = isStudent ? 'You (Student)' : witnessName;
    const div = document.createElement('div');
    div.className = `tx-turn ${isStudent ? 'tx-student' : 'tx-witness'}`;
    div.innerHTML = `
      <div class="tx-speaker">${speaker}</div>
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

// ── Retry critique without re-fetching transcript ──────
btnRetryCritique?.addEventListener('click', async () => {
  document.getElementById('critique-error').hidden = true;
  setProcessingStep('step-analyse');
  showScreen('processing');
  await runCritique();
});

// ── Reset / retry ──────────────────────────────────────
function resetForRetry() {
  callEnded      = false;
  conversationId = null;
  conversation   = null;
  lastTranscript = null;
  stopTimer();
  btnEnd.disabled    = true;
  btnEnd.textContent = 'End Interview';
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

function showInlineError(el, msg) {
  el.textContent = msg;
  el.hidden = false;
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Init ───────────────────────────────────────────────
loadBriefingData();
showScreen('intro');
