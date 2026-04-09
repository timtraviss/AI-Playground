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

  let selectedFile = null;
  let currentStep  = null;

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

    const formData = new FormData();
    formData.append('audio', selectedFile);

    let jobId;
    try {
      const resp = await fetch('/api/podcast-review/upload', { method: 'POST', body: formData });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || `Upload error ${resp.status}`);
      }
      ({ jobId } = await resp.json());
    } catch (err) {
      showError(err.message, currentStep);
      return;
    }

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
        activateStep('transcribing');
        document.getElementById('note-transcribing').textContent = 'Sending audio to Whisper API…';
        break;

      case 'extracting':
        completeStep('transcribing');
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
        completeStep('checking');
        activateStep('done');
        completeStep('done');
        es.close();
        fetchAndShowResults(jobId);
        break;

      case 'error':
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
    document.querySelectorAll('.step-item').forEach(el => {
      el.classList.remove('active', 'complete');
    });
    document.querySelectorAll('.step-note').forEach(el => { el.textContent = ''; });
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

})();
