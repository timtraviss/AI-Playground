/**
 * UI state machine and DOM helpers.
 * Manages screen transitions, timer, waveform, and status indicators.
 */

const SCREENS = ['intro', 'interview', 'processing', 'critique'];

export function showScreen(name) {
  SCREENS.forEach(s => {
    const el = document.getElementById(`screen-${s}`);
    if (!el) return;
    el.classList.toggle('active', s === name);
    el.classList.toggle('hidden', s !== name);
  });
}

// ── Timer ──────────────────────────────────────────────
let timerInterval = null;
let timerSeconds = 0;

export function startTimer() {
  timerSeconds = 0;
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    timerSeconds++;
    updateTimerDisplay();
  }, 1000);
}

export function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

function updateTimerDisplay() {
  const el = document.getElementById('timer');
  if (!el) return;
  const m = Math.floor(timerSeconds / 60).toString().padStart(2, '0');
  const s = (timerSeconds % 60).toString().padStart(2, '0');
  el.textContent = `${m}:${s}`;
}

// ── Status badge ───────────────────────────────────────
export function setStatus(status) {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  if (!dot || !text) return;

  dot.className = 'status-dot';
  const labels = {
    connecting: 'Connecting...',
    live: 'Live',
    disconnected: 'Ended',
  };
  if (status === 'live') dot.classList.add('live');
  if (status === 'connecting') dot.classList.add('connecting');
  text.textContent = labels[status] || status;
}

// ── Waveform / speaking indicator ─────────────────────
export function setMode(mode, avatarEl, waveformEl, speakingLabelEl) {
  const speaking = mode === 'speaking';
  waveformEl.classList.toggle('active', speaking);
  avatarEl.classList.toggle('speaking', speaking);
  speakingLabelEl.textContent = speaking ? 'Speaking...' : 'Listening...';
}

// ── Processing steps ───────────────────────────────────
export function setProcessingStep(step) {
  const steps = ['step-transcript', 'step-analyse', 'step-critique'];
  const idx = steps.indexOf(step);
  steps.forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('active', 'done');
    if (i < idx) el.classList.add('done');
    if (i === idx) el.classList.add('active');
  });
}

// ── Interview avatar / name setup ──────────────────────
export function setInterviewWitness(witnessName, avatarInitials) {
  const avatarEl = document.getElementById('interview-avatar');
  const nameEl = document.getElementById('interview-witness-name');
  if (avatarEl) avatarEl.textContent = avatarInitials;
  if (nameEl) nameEl.textContent = witnessName;
}
