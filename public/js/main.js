/**
 * P.E.A.C.E. Model Investigative Interviewing Tutor
 *
 * Simplified flow:
 *   1. Fetch agentId from /api/config (keeps key server-side)
 *   2. Connect directly to ElevenLabs agent — no prompt injection, no signed URL
 *   3. Capture conversationId from onConnect
 *   4. End session → wait 3s → fetch transcript from /api/transcript/:id
 *   5. Render transcript screen
 */

import { TranscriptPanel } from './transcript.js';
import { showScreen, startTimer, stopTimer, setStatus, setMode, setInterviewWitness } from './ui.js';

const WITNESS_ID = 'witness-catherine';

// ── State ──────────────────────────────────────────────
let conversationId   = null;
let conversation     = null;
let witnessName      = 'Catherine Johnson';
let witnessInitials  = 'CJ';
let sessionStartedAt = null;

// ── DOM refs ───────────────────────────────────────────
const btnStart       = document.getElementById('btn-start');
const btnEnd         = document.getElementById('btn-end');
const btnRetry       = document.getElementById('btn-retry');
const btnRetryBottom = document.getElementById('btn-retry-bottom');

// ── Live transcript panel (during interview) ───────────
const transcriptPanel = new TranscriptPanel(
  document.getElementById('transcript-panel'),
  document.getElementById('transcript-inner'),
  document.getElementById('btn-transcript-toggle'),
  document.getElementById('transcript-toggle-label'),
);

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
    console.error('Failed to load witness:', err);
    document.getElementById('briefing-text').textContent =
      'Failed to load scenario. Is the server running?';
  }
}

// ── Begin Interview ────────────────────────────────────
btnStart.addEventListener('click', async () => {
  btnStart.disabled    = true;
  btnStart.textContent = 'Connecting...';

  try {
    // Fetch agentId from server — keeps the key out of client HTML
    const configRes = await fetch('/api/config');
    if (!configRes.ok) throw new Error('Could not load agent configuration from server');
    const { agentId } = await configRes.json();

    setInterviewWitness(witnessName, witnessInitials);
    transcriptPanel.clear();
    conversationId   = null;
    sessionStartedAt = new Date().toISOString();
    showScreen('interview');
    setStatus('connecting');

    const { Conversation } = window.ElevenLabsClient;
    if (!Conversation) throw new Error('ElevenLabs SDK not loaded');

    // Connect directly — agent is fully configured in ElevenLabs dashboard
    conversation = await Conversation.startSession({
      agentId,

      onConnect: ({ conversationId: id }) => {
        console.log('[interview] connected, conversationId:', id);
        conversationId = id;
        setStatus('live');
        startTimer();
      },

      onDisconnect: () => {
        console.log('[interview] disconnected');
        setStatus('disconnected');
        stopTimer();
      },

      onMessage: ({ source, message }) => {
        const side = source === 'user' ? 'student' : 'witness';
        transcriptPanel.addTurn(side, message, witnessName);
        transcriptPanel.open();
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
    console.error('[interview] failed to start:', err);
    alert('Could not connect: ' + err.message);
    resetForRetry();
  }
});

// ── End Interview ──────────────────────────────────────
btnEnd.addEventListener('click', async () => {
  btnEnd.disabled    = true;
  btnEnd.textContent = 'Ending session...';
  stopTimer();

  try {
    if (conversation) {
      await conversation.endSession();
      conversation = null;
    }

    // Show processing screen while ElevenLabs finalises the conversation record
    showScreen('processing');
    await delay(3000);

    // Fallback: if onConnect never fired with an ID, look up the latest conversation
    if (!conversationId) {
      console.warn('[interview] no conversationId from onConnect — fetching latest');
      const url = `/api/latest-conversation?since=${encodeURIComponent(sessionStartedAt || new Date().toISOString())}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        conversationId = data.conversationId;
      }
    }

    if (!conversationId) {
      throw new Error(
        'No conversation ID — the interview may not have connected properly. Please try again.'
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
    console.error('[interview] error ending interview:', err);
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
  conversation     = null;
  sessionStartedAt = null;
  transcriptPanel.clear();
  btnStart.disabled  = false;
  btnStart.innerHTML = '<span class="btn-icon">▶</span> Begin Interview';
  btnEnd.disabled    = false;
  btnEnd.textContent = 'End Interview';
  showScreen('intro');
}

[btnRetry, btnRetryBottom].forEach(btn => btn?.addEventListener('click', resetForRetry));

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Init ───────────────────────────────────────────────
loadWitnessMetadata();
showScreen('intro');
