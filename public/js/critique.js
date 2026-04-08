/**
 * Renders the structured critique JSON into the critique screen DOM.
 */

export function renderCritique(data, fullTranscriptTurns, witnessName) {
  // ── Overall score ─────────────────────────────────
  const scoreEl = document.getElementById('score-number');
  const bandEl = document.getElementById('score-band');
  const summaryEl = document.getElementById('score-summary');
  const ringFill = document.getElementById('score-ring-fill');

  // Animate score counter
  animateCounter(scoreEl, 0, data.overallScore, 1200);

  // Ring: circumference = 2π × 50 ≈ 314
  const circumference = 314;
  const offset = circumference - (data.overallScore / 100) * circumference;
  setTimeout(() => {
    ringFill.style.strokeDashoffset = offset;
    // Colour the ring by band
    const ringColors = { Distinction: '#e8c96a', Merit: '#60a5fa', Pass: '#4ade80', 'Not Yet': '#f87171' };
    ringFill.style.stroke = ringColors[data.overallBand] || '#e8c96a';
  }, 100);

  bandEl.textContent = data.overallBand;
  const bandColors = { Distinction: '#e8c96a', Merit: '#60a5fa', Pass: '#4ade80', 'Not Yet': '#f87171' };
  bandEl.style.color = bandColors[data.overallBand] || '#e8c96a';

  summaryEl.textContent = data.summary;

  // ── PEACE phase bars ──────────────────────────────
  const phaseBarsEl = document.getElementById('phase-bars');
  phaseBarsEl.innerHTML = '';

  const phases = [
    { key: 'engageExplain', label: 'Engage & Explain' },
    { key: 'account', label: 'Account' },
    { key: 'closure', label: 'Closure' },
  ];

  phases.forEach(({ key, label }) => {
    const phase = data.phaseScores?.[key];
    if (!phase) return;

    const item = document.createElement('div');
    item.className = 'phase-bar-item';
    item.innerHTML = `
      <div class="phase-bar-header">
        <span class="phase-bar-label">${label}</span>
        <span class="phase-bar-score">${phase.score}/100</span>
      </div>
      <div class="phase-bar-track">
        <div class="phase-bar-fill" data-width="${phase.score}%"></div>
      </div>
      <p class="phase-bar-notes">${phase.notes || ''}</p>
    `;
    phaseBarsEl.appendChild(item);
  });

  // Animate bars after render
  setTimeout(() => {
    document.querySelectorAll('.phase-bar-fill[data-width]').forEach(el => {
      el.style.width = el.dataset.width;
    });
  }, 200);

  // ── Questioning technique ─────────────────────────
  const pillsEl = document.getElementById('questioning-pills');
  const qt = data.questioningTechnique || {};
  pillsEl.innerHTML = `
    <div class="q-pill teds">
      <span class="q-pill-count">${qt.tedsCount ?? 0}</span>
      <span class="q-pill-label">TEDS / Open</span>
    </div>
    <div class="q-pill leading">
      <span class="q-pill-count">${qt.leadingCount ?? 0}</span>
      <span class="q-pill-label">Leading</span>
    </div>
    <div class="q-pill closed">
      <span class="q-pill-count">${qt.closedCount ?? 0}</span>
      <span class="q-pill-label">Closed</span>
    </div>
  `;
  document.getElementById('questioning-notes').textContent = qt.notes || '';

  // ── Key facts ─────────────────────────────────────
  const kf = data.keyFactsElicited || {};
  const total = kf.totalPossible || 0;
  const elicited = kf.totalElicited || 0;
  const pct = total > 0 ? Math.round((elicited / total) * 100) : 0;

  setTimeout(() => {
    document.getElementById('facts-progress-bar').style.width = `${pct}%`;
  }, 300);
  document.getElementById('facts-count').textContent = `${elicited} of ${total} key facts elicited (${pct}%)`;

  const factsList = document.getElementById('facts-list');
  factsList.innerHTML = '';
  (kf.facts || []).forEach(f => {
    const item = document.createElement('div');
    item.className = `fact-item ${f.elicited ? 'elicited' : 'missed'}`;
    item.innerHTML = `
      <span class="fact-icon">${f.elicited ? '✓' : '○'}</span>
      <div>
        <div class="fact-text">${escHtml(f.fact)}</div>
        ${f.method ? `<div class="fact-method">${escHtml(f.method)}</div>` : ''}
      </div>
    `;
    factsList.appendChild(item);
  });

  // ── Strengths ─────────────────────────────────────
  const strengthsList = document.getElementById('strengths-list');
  strengthsList.innerHTML = '';
  (data.strengths || []).forEach(s => {
    const li = document.createElement('li');
    li.className = 'strength-item';
    li.innerHTML = `<span class="strength-icon">✓</span><span>${escHtml(s)}</span>`;
    strengthsList.appendChild(li);
  });

  // ── Improvements ──────────────────────────────────
  const improvementsList = document.getElementById('improvements-list');
  improvementsList.innerHTML = '';
  (data.improvements || []).forEach(imp => {
    const card = document.createElement('div');
    card.className = 'improvement-card';
    card.innerHTML = `
      <div class="improvement-issue">${escHtml(imp.issue)}</div>
      <div class="improvement-suggestion">${escHtml(imp.suggestion)}</div>
      ${imp.example ? `<div class="improvement-example">${escHtml(imp.example)}</div>` : ''}
    `;
    improvementsList.appendChild(card);
  });

  // ── Full transcript ───────────────────────────────
  if (fullTranscriptTurns && fullTranscriptTurns.length > 0) {
    const fullTranscriptEl = document.getElementById('full-transcript');
    fullTranscriptEl.innerHTML = '';
    fullTranscriptTurns.forEach(turn => {
      const div = document.createElement('div');
      div.className = `turn turn-${turn.source}`;
      div.innerHTML = `
        <span class="turn-label">${turn.source === 'student' ? 'You' : escHtml(witnessName)}</span>
        <p class="turn-text">${escHtml(turn.text)}</p>
      `;
      fullTranscriptEl.appendChild(div);
    });
  }

  // Full transcript toggle
  document.getElementById('btn-show-full-transcript').addEventListener('click', function () {
    const el = document.getElementById('full-transcript');
    const isHidden = el.classList.toggle('hidden');
    this.textContent = isHidden ? 'Show Full Transcript ▾' : 'Hide Full Transcript ▴';
  });
}

function animateCounter(el, from, to, duration) {
  const start = performance.now();
  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(from + (to - from) * eased);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
