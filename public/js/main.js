/**
 * P.E.A.C.E. Model Investigative Interviewing Tutor
 *
 * Uses @elevenlabs/client exactly as documented:
 * https://elevenlabs.io/docs/eleven-agents/libraries/java-script
 */

import { TranscriptPanel } from './transcript.js';
import { renderCritique } from './critique.js';
import { showScreen, startTimer, stopTimer, setStatus, setMode, setProcessingStep, setInterviewWitness } from './ui.js';

const WITNESS_ID = 'witness-catherine';

// ── State ──────────────────────────────────────────────
let conversationId = null;
let conversation = null;
let witnessName = 'Catherine Johnson';
let witnessInitials = 'CJ';
let sessionStartedAt = null;

// ── DOM refs ───────────────────────────────────────────
const btnStart  = document.getElementById('btn-start');
const btnEnd    = document.getElementById('btn-end');
const btnRetry  = document.getElementById('btn-retry');
const btnRetryBottom = document.getElementById('btn-retry-bottom');

// ── Transcript panel ───────────────────────────────────
const transcriptPanel = new TranscriptPanel(
  document.getElementById('transcript-panel'),
  document.getElementById('transcript-inner'),
  document.getElementById('btn-transcript-toggle'),
  document.getElementById('transcript-toggle-label'),
);

// ── Load witness metadata ──────────────────────────────
async function loadWitnessMetadata() {
  try {
    const res = await fetch(`/api/witness/${WITNESS_ID}`);
    const data = await res.json();
    witnessName   = data.name;
    witnessInitials = data.avatarInitials;

    document.getElementById('witness-avatar').textContent  = data.avatarInitials;
    document.getElementById('witness-name').textContent    = data.name;
    document.getElementById('witness-role').textContent    = data.role;
    document.getElementById('witness-org').textContent     = data.organization;
    document.getElementById('briefing-text').textContent   = data.scenarioBlurb;
    document.getElementById('briefing-note').textContent   = data.briefingNote;

    btnStart.disabled = false;
  } catch (err) {
    console.error('Failed to load witness:', err);
    document.getElementById('briefing-text').textContent = 'Failed to load scenario. Is the server running?';
  }
}

// ── Start interview ────────────────────────────────────
btnStart.addEventListener('click', async () => {
  btnStart.disabled = true;
  btnStart.textContent = 'Connecting...';

  try {
    setInterviewWitness(witnessName, witnessInitials);
    transcriptPanel.clear();
    conversationId = null;
    sessionStartedAt = new Date().toISOString();
    showScreen('interview');
    setStatus('connecting');

    const sessionRes = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ witnessId: WITNESS_ID }),
    });

    if (!sessionRes.ok) {
      const err = await sessionRes.json().catch(() => ({ error: sessionRes.statusText }));
      throw new Error(err.error || 'Could not create interview session');
    }

    const { signedUrl, agentId, systemPrompt, voiceId } = await sessionRes.json();

    const { Conversation } = window.ElevenLabsClient;
    if (!Conversation) {
      throw new Error('ElevenLabs SDK not loaded');
    }

    const overrides = {
      agent: { prompt: systemPrompt },
    };
    if (voiceId) {
      overrides.tts = { voiceId };
    }

    const callbacks = {
      onConnect: ({ conversationId: id }) => {
        console.log('Connected! Conversation ID:', id);
        conversationId = id;
        setStatus('live');
        startTimer();
      },

      onDisconnect: () => {
        console.log('Disconnected');
        setStatus('disconnected');
        stopTimer();
      },

      onMessage: ({ source, message }) => {
        console.log(`[${source}]:`, message);
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
        console.error('ElevenLabs error:', message, context);
        alert('Connection error: ' + message);
      },
    };

    // Prefer agentId per ElevenLabs guidance, with signedUrl fallback.
    if (agentId) {
      try {
        conversation = await Conversation.startSession({
          agentId,
          overrides,
          ...callbacks,
        });
      } catch (agentErr) {
        if (!signedUrl) throw agentErr;
        console.warn('agentId session start failed; retrying with signedUrl', agentErr);
        conversation = await Conversation.startSession({
          signedUrl,
          overrides,
          ...callbacks,
        });
      }
    } else {
      conversation = await Conversation.startSession({
        signedUrl,
        overrides,
        ...callbacks,
      });
    }

  } catch (err) {
    console.error('Failed to start:', err);
    alert('Could not connect: ' + err.message);
    resetForRetry();
  }
});

// ── End interview ──────────────────────────────────────
btnEnd.addEventListener('click', async () => {
  btnEnd.disabled = true;
  btnEnd.textContent = 'Getting feedback...';
  stopTimer();

  try {
    if (conversation) {
      await conversation.endSession();
      conversation = null;
    }

    // Fallback: if onConnect didn't fire with an ID, fetch recent conversations
    // constrained to this session start window.
    if (!conversationId) {
      console.log('No conversation ID from events — fetching latest...');
      const url = `/api/latest-conversation?since=${encodeURIComponent(sessionStartedAt || new Date().toISOString())}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        conversationId = data.conversationId;
      }
    }

    if (!conversationId) {
      throw new Error('No conversation found. Please complete an interview first.');
    }

    await runCritique();

  } catch (err) {
    console.error('Error:', err);
    alert(err.message);
    resetForRetry();
  }
});

// ── Critique pipeline ──────────────────────────────────
async function runCritique() {
  showScreen('processing');
  setProcessingStep('step-transcript');
  await delay(400);
  setProcessingStep('step-analyse');

  const res = await fetch('/api/critique', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId, witnessId: WITNESS_ID }),
  });

  setProcessingStep('step-critique');
  await delay(300);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`Critique failed: ${err.error}`);
  }

  const critique = await res.json();
  showScreen('critique');
  renderCritique(critique, transcriptPanel.getTurns(), witnessName);
}

// ── Retry ──────────────────────────────────────────────
function resetForRetry() {
  conversationId = null;
  conversation = null;
  sessionStartedAt = null;
  transcriptPanel.clear();
  btnStart.disabled = false;
  btnStart.innerHTML = '<span class="btn-icon">▶</span> Begin Interview';
  btnEnd.disabled = false;
  btnEnd.textContent = 'End & Get Feedback';
  showScreen('intro');
}

[btnRetry, btnRetryBottom].forEach(btn => btn?.addEventListener('click', resetForRetry));

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Init ───────────────────────────────────────────────
loadWitnessMetadata();
showScreen('intro');
