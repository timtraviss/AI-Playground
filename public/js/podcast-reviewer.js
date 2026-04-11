(function () {
  'use strict';

  // ── Elements ──────────────────────────────────────────────────────────────
  const screenUpload   = document.getElementById('screen-upload');
  const screenProgress = document.getElementById('screen-progress');
  const screenResults  = document.getElementById('screen-results');

  const dropZone    = document.getElementById('drop-zone');
  const fileInput   = document.getElementById('file-input');
  const btnBrowse   = document.getElementById('btn-browse');
  const btnClear    = document.getElementById('btn-clear');
  const btnUpload   = document.getElementById('btn-upload');
  const fileSelected = document.getElementById('file-selected');
  const fileName    = document.getElementById('file-name');
  const btnAgain      = document.getElementById('btn-again');
  const progressError = document.getElementById('progress-error');
  const progressErrorMsg = document.getElementById('progress-error-msg');
  const btnRetry      = document.getElementById('btn-retry');
  const uploadProgress = document.getElementById('upload-progress');
  const uploadProgressFill = document.getElementById('upload-progress-fill');
  const transcribeProgress = document.getElementById('transcribe-progress');

  let selectedFile = null;
  let currentStep  = null;
  let transcribeTimer = null;
  let transcribeStartedAt = 0;
  let transcribeModel = '';
  let transcribeRetry = false;
  let lastResults = null;

  // ── Screen management ─────────────────────────────────────────────────────
  function showScreen(id) {
    [screenUpload, screenProgress, screenResults].forEach(s => {
      s.hidden = (s.id !== id);
    });
  }

  // ── File selection ────────────────────────────────────────────────────────
  function setFile(file) {
    selectedFile = file;
    fileName.textContent = file.name;
    fileSelected.hidden = false;
    btnUpload.disabled = false;
  }

  function clearFile() {
    selectedFile = null;
    fileInput.value = '';
    fileSelected.hidden = true;
    btnUpload.disabled = true;
  }

  btnBrowse.addEventListener('click', () => fileInput.click());
  btnClear.addEventListener('click', clearFile);
  btnAgain.addEventListener('click', () => { clearFile(); showScreen('screen-upload'); });
  btnRetry.addEventListener('click', () => { clearFile(); showScreen('screen-upload'); });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) setFile(fileInput.files[0]);
  });

  // Drag and drop
  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) setFile(file);
  });
  dropZone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') fileInput.click();
  });

  // ── Upload & pipeline ─────────────────────────────────────────────────────
  btnUpload.addEventListener('click', startReview);

  async function startReview() {
    if (!selectedFile) return;

    showScreen('screen-progress');
    resetSteps();
    progressError.hidden = true;

    // Activate upload step immediately so the user sees something happening
    activateStep('uploading');
    uploadProgress.hidden = false;
    uploadProgressFill.style.width = '0%';
    const fileSizeLabel = `${(selectedFile.size / 1024 / 1024).toFixed(1)} MB`;
    document.getElementById('note-uploading').textContent = `${fileSizeLabel} — starting upload…`;

    const formData = new FormData();
    formData.append('audio', selectedFile);

    let jobId;
    try {
      const data = await uploadWithProgress('/api/podcast-review/upload', formData, ({ percent, elapsedMs }) => {
        uploadProgressFill.style.width = `${percent}%`;
        document.getElementById('note-uploading').textContent =
          `${fileSizeLabel} — uploaded ${percent}% · ${formatElapsed(elapsedMs)} elapsed`;
      });
      jobId = data.jobId;
    } catch (err) {
      showError(err.message, currentStep);
      return;
    }

    uploadProgressFill.style.width = '100%';
    document.getElementById('note-uploading').textContent = `${fileSizeLabel} — upload complete`;
    completeStep('uploading');
    uploadProgress.hidden = true;

    // Open SSE stream
    const es = new EventSource(`/api/podcast-review/status/${jobId}`);

    es.onmessage = (e) => {
      let evt;
      try { evt = JSON.parse(e.data); } catch { return; }
      handleProgressEvent(evt, jobId, es);
    };

    es.onerror = () => {
      es.close();
      // If we hit done already, result fetch will handle it
    };
  }

  function handleProgressEvent(evt, jobId, es) {
    switch (evt.step) {
      case 'transcribing':
        transcribeModel = evt.model || 'Whisper API';
        transcribeRetry = evt.retry || false;
        activateStep('transcribing');
        startTranscribeTimer();
        break;

      case 'heartbeat':
        break;

      case 'transcribed': {
        stopTranscribeTimer();
        completeStep('transcribing');
        activateStep('transcribed');
        setTimeout(() => {
          const words = (evt.wordCount ?? 0).toLocaleString();
          const fallbackNote = evt.wasFallback ? ' · no speaker labels (whisper-1 used)' : '';
          document.getElementById('note-transcribed').textContent =
            `~${words} words transcribed${fallbackNote}`;
          completeStep('transcribed');
        }, 150);
        break;
      }

      case 'extracting':
        activateStep('extracting');
        if (evt.claimsFound !== undefined) {
          document.getElementById('note-extracting').textContent =
            `Found ${evt.claimsFound} legislative claim${evt.claimsFound !== 1 ? 's' : ''}`;
        } else {
          document.getElementById('note-extracting').textContent = 'Analysing transcript with Claude…';
        }
        break;

      case 'checking':
        completeStep('extracting');
        activateStep('checking');
        document.getElementById('note-checking').textContent =
          `Claim ${evt.current} of ${evt.total}: "${(evt.claim || '').slice(0, 80)}${(evt.claim || '').length > 80 ? '…' : ''}"`;
        break;

      case 'done':
        stopTranscribeTimer();
        completeStep('checking');
        activateStep('done');
        completeStep('done');
        es.close();
        fetchAndShowResults(jobId);
        break;

      case 'error':
        stopTranscribeTimer();
        es.close();
        showError(evt.message || 'Unknown error', currentStep);
        break;
    }
  }

  async function fetchAndShowResults(jobId) {
    try {
      const resp = await fetch(`/api/podcast-review/result/${jobId}`);
      if (!resp.ok) throw new Error(`Could not fetch results (${resp.status})`);
      const data = await resp.json();
      renderResults(data);
      showScreen('screen-results');
    } catch (err) {
      showError(err.message, currentStep);
    }
  }

  // ── Step helpers ──────────────────────────────────────────────────────────
  function resetSteps() {
    stopTranscribeTimer();
    document.querySelectorAll('.step-item').forEach(el => {
      el.classList.remove('active', 'complete', 'error');
    });
    document.querySelectorAll('.step-note').forEach(el => { el.textContent = ''; });
    uploadProgress.hidden = true;
    uploadProgressFill.style.width = '0%';
    progressError.hidden = true;
    progressErrorMsg.textContent = '';
  }

  function activateStep(name) {
    currentStep = name;
    const el = document.getElementById(`step-${name}`);
    if (el) { el.classList.remove('complete', 'error'); el.classList.add('active'); }
  }

  function completeStep(name) {
    const el = document.getElementById(`step-${name}`);
    if (el) { el.classList.remove('active', 'error'); el.classList.add('complete'); }
  }

  function showError(msg, failedStep) {
    stopTranscribeTimer();
    uploadProgress.hidden = true;
    // Mark the failing step red
    if (failedStep) {
      const el = document.getElementById(`step-${failedStep}`);
      if (el) {
        el.classList.remove('active');
        el.classList.add('error');
        const note = el.querySelector('.step-note');
        if (note) note.textContent = 'Failed — see details below';
      }
    }
    progressErrorMsg.textContent = msg;
    progressError.hidden = false;
  }

  function startTranscribeTimer() {
    stopTranscribeTimer();
    transcribeStartedAt = Date.now();
    transcribeProgress.hidden = false;
    updateTranscribeNote();
    transcribeTimer = setInterval(updateTranscribeNote, 1000);
  }

  function stopTranscribeTimer() {
    if (transcribeTimer) {
      clearInterval(transcribeTimer);
      transcribeTimer = null;
    }
    transcribeProgress.hidden = true;
  }

  function updateTranscribeNote() {
    const elapsedMs = Date.now() - transcribeStartedAt;
    const modelLabel = transcribeModel || 'Whisper API';
    const prefix = transcribeRetry
      ? `Primary timed out — retrying with ${modelLabel}`
      : `Sending to ${modelLabel}`;
    document.getElementById('note-transcribing').textContent =
      `${prefix}… ${formatElapsed(elapsedMs)} elapsed`;
  }

  function uploadWithProgress(url, formData, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const startedAt = Date.now();

      xhr.open('POST', url, true);
      xhr.responseType = 'json';

      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        const percent = Math.max(0, Math.min(100, Math.round((e.loaded / e.total) * 100)));
        onProgress({ percent, elapsedMs: Date.now() - startedAt });
      };

      xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));

      xhr.onload = () => {
        const responseBody = xhr.response ?? safeJsonParse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(responseBody || {});
          return;
        }
        const message = responseBody?.error || `Upload error ${xhr.status}`;
        reject(new Error(message));
      };

      xhr.send(formData);
    });
  }

  function safeJsonParse(text) {
    try { return JSON.parse(text); } catch { return null; }
  }

  function formatElapsed(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  // ── Results rendering ─────────────────────────────────────────────────────
  const CATEGORY_LABELS = {
    'ACCURATE': 'Accurate',
    'INACCURATE': 'Inaccurate',
    'OVERSIMPLIFIED': 'Oversimplified',
    'MISSING CAVEAT': 'Missing Caveat',
    'WRONG SECTION': 'Wrong Section',
    'OUTDATED LAW': 'Outdated Law',
    'GOOD EXPLANATION': 'Good Explanation',
    'AMBIGUOUS': 'Ambiguous',
  };

  function categoryClass(cat) {
    return 'cat-' + (cat || '').replace(/\s+/g, '-');
  }

  function renderResults(data) {
    lastResults = data;
    document.getElementById('result-filename').textContent = data.filename || 'Podcast Review';
    document.getElementById('result-date').textContent =
      `Reviewed ${data.reviewedAt} · legislation.govt.nz (current in-force)`;

    // Summary pills
    const bar = document.getElementById('summary-bar');
    bar.innerHTML = '';
    const total = document.createElement('div');
    total.className = 'summary-pill';
    total.style.cssText = 'background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.1);color:#94a3b8;';
    total.textContent = `${data.totalClaims} claim${data.totalClaims !== 1 ? 's' : ''}`;
    bar.appendChild(total);

    const catOrder = ['INACCURATE','MISSING CAVEAT','OUTDATED LAW','WRONG SECTION','OVERSIMPLIFIED','AMBIGUOUS','ACCURATE','GOOD EXPLANATION'];
    for (const cat of catOrder) {
      const count = data.categoryCounts?.[cat];
      if (!count) continue;
      const pill = document.createElement('div');
      pill.className = `summary-pill ${categoryClass(cat)}`;
      pill.textContent = `${count} ${CATEGORY_LABELS[cat] || cat}`;
      bar.appendChild(pill);
    }

    // Priority issues
    const prioritySection = document.getElementById('priority-section');
    const priorityList = document.getElementById('priority-list');
    const priorities = data.priorityIssues || [];
    if (priorities.length > 0) {
      priorityList.innerHTML = '';
      priorities.forEach(c => priorityList.appendChild(buildClaimCard(c)));
      prioritySection.hidden = false;
    } else {
      prioritySection.hidden = true;
    }

    // All claims
    const allList = document.getElementById('all-claims');
    allList.innerHTML = '';
    (data.claims || []).forEach(c => allList.appendChild(buildClaimCard(c)));
  }

  function buildClaimCard(claim) {
    const cat = (claim.category || 'AMBIGUOUS').toUpperCase();
    const catCls = categoryClass(cat);
    const label = CATEGORY_LABELS[cat] || cat;
    // isPriority used by the priority section filter in renderResults above

    const card = document.createElement('div');
    card.className = `claim-card ${catCls}`;

    // Top row: timestamp + category badge
    const top = document.createElement('div');
    top.className = 'claim-top';

    if (claim.timestamp && claim.timestamp !== 'unknown') {
      const ts = document.createElement('span');
      ts.className = 'claim-timestamp';
      ts.textContent = claim.timestamp;
      top.appendChild(ts);
    }

    const badge = document.createElement('span');
    badge.className = `summary-pill ${catCls}`;
    badge.style.fontSize = '10px';
    badge.textContent = label;
    top.appendChild(badge);

    card.appendChild(top);

    // Quote
    const quote = document.createElement('blockquote');
    quote.className = 'claim-quote';
    quote.textContent = `"${claim.quote || ''}"`;
    card.appendChild(quote);

    // Finding
    if (claim.finding) {
      const finding = document.createElement('p');
      finding.className = 'claim-finding';
      finding.textContent = claim.finding;
      card.appendChild(finding);
    }

    // Correct statement
    if (claim.correctStatement) {
      const box = document.createElement('div');
      box.className = 'claim-correct';
      const lbl = document.createElement('div');
      lbl.className = 'claim-correct-label';
      lbl.textContent = 'Correct statement';
      const txt = document.createElement('div');
      txt.textContent = claim.correctStatement;
      box.appendChild(lbl);
      box.appendChild(txt);
      card.appendChild(box);
    }

    // Statutory text (collapsible)
    if (claim.statutoryText && !claim.statutoryText.startsWith('[')) {
      const toggle = document.createElement('button');
      toggle.className = 'statutory-toggle';
      toggle.innerHTML = '<span class="toggle-arrow">▶</span> View statutory text';

      const textEl = document.createElement('div');
      textEl.className = 'statutory-text';
      textEl.textContent = claim.statutoryText;

      toggle.addEventListener('click', () => {
        const open = textEl.classList.toggle('visible');
        toggle.classList.toggle('open', open);
      });

      card.appendChild(toggle);
      card.appendChild(textEl);
    }

    return card;
  }

  // ── Markdown export ───────────────────────────────────────────────────────
  const VERDICT_ORDER = ['INACCURATE','MISSING CAVEAT','OUTDATED LAW','WRONG SECTION','OVERSIMPLIFIED','AMBIGUOUS','ACCURATE','GOOD EXPLANATION'];

  function exportMarkdown() {
    const data = lastResults;
    if (!data) return;

    const lines = [];

    lines.push(`# Legislation Review Report`);
    lines.push(`**File:** ${data.filename || 'Unknown'}`);
    lines.push(`**Reviewed:** ${data.reviewedAt || new Date().toLocaleDateString()}`);
    lines.push(`**Source:** legislation.govt.nz (current in-force)`);
    lines.push('');

    // Summary table
    lines.push(`## Summary`);
    lines.push(`**Total claims reviewed:** ${data.totalClaims}`);
    lines.push('');
    lines.push('| Category | Count |');
    lines.push('|---|---|');
    for (const cat of VERDICT_ORDER) {
      const count = data.categoryCounts?.[cat];
      if (count) lines.push(`| ${CATEGORY_LABELS[cat] || cat} | ${count} |`);
    }
    lines.push('');

    // Priority issues
    const priorities = data.priorityIssues || [];
    if (priorities.length > 0) {
      lines.push('## Priority Issues');
      lines.push('');
      priorities.forEach((c, i) => lines.push(...claimToMarkdown(c, i + 1)));
    }

    // All claims
    lines.push('## All Claims');
    lines.push('');
    (data.claims || []).forEach((c, i) => lines.push(...claimToMarkdown(c, i + 1)));

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const baseName = (data.filename || 'podcast-review').replace(/\.[^.]+$/, '');
    a.download = `${baseName}-legislation-review.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function claimToMarkdown(claim, index) {
    const cat = (claim.category || 'AMBIGUOUS').toUpperCase();
    const label = CATEGORY_LABELS[cat] || cat;
    const lines = [];

    const ts = claim.timestamp && claim.timestamp !== 'unknown' ? ` · ${claim.timestamp}` : '';
    lines.push(`### ${index}. ${label}${ts}`);
    lines.push('');
    if (claim.quote) lines.push(`> "${claim.quote}"`);
    lines.push('');
    if (claim.finding) lines.push(claim.finding);
    if (claim.correctStatement) {
      lines.push('');
      lines.push(`**Correct statement:** ${claim.correctStatement}`);
    }
    if (claim.statutoryText && !claim.statutoryText.startsWith('[')) {
      lines.push('');
      lines.push(`**Statutory text:**`);
      lines.push('');
      lines.push(`> ${claim.statutoryText.replace(/\n/g, '\n> ')}`);
    }
    lines.push('');
    return lines;
  }

  // ── Transcript download ───────────────────────────────
  function downloadTranscript() {
    const data = lastResults;
    if (!data || !data.transcript) return;

    const lines = [];
    lines.push(`# Full Transcript`);
    lines.push(`**File:** ${data.filename || 'Unknown'}`);
    lines.push(`**Reviewed:** ${data.reviewedAt || new Date().toLocaleDateString()}`);
    lines.push('');
    lines.push(data.transcript);

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const baseName = (data.filename || 'podcast').replace(/\.[^.]+$/, '');
    a.download = `${baseName}-transcript.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  document.getElementById('btn-export-md').addEventListener('click', exportMarkdown);
  document.getElementById('btn-export-transcript').addEventListener('click', downloadTranscript);

})();
