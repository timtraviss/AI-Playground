/* ── Podcast Converter — Frontend ──────────────────────────────────────────── */

// ── DOM refs ──────────────────────────────────────────────────────────────────
const screens = {
  upload:   document.getElementById('screen-upload'),
  progress: document.getElementById('screen-progress'),
  result:   document.getElementById('screen-result'),
};

const dropZone     = document.getElementById('drop-zone');
const fileInput    = document.getElementById('file-input');
const btnBrowse    = document.getElementById('btn-browse');
const btnClear     = document.getElementById('btn-clear');
const btnConvert   = document.getElementById('btn-convert');
const fileSelected = document.getElementById('file-selected');
const fileName     = document.getElementById('file-name');
const pcOptions    = document.getElementById('pc-options');

const progressError    = document.getElementById('progress-error');
const progressErrorMsg = document.getElementById('progress-error-msg');
const btnRetry         = document.getElementById('btn-retry');

const btnDownload = document.getElementById('btn-download');
const btnAgain    = document.getElementById('btn-again');

const resDuration   = document.getElementById('res-duration');
const resBitrate    = document.getElementById('res-bitrate');
const resChannels   = document.getElementById('res-channels');
const resSamplerate = document.getElementById('res-samplerate');
const resSize       = document.getElementById('res-size');

// ── State ─────────────────────────────────────────────────────────────────────
let selectedFile = null;
let currentJobId = null;
let currentStep  = null;
let uploadStartedAt = 0;

// ── Screen switching ──────────────────────────────────────────────────────────
function showScreen(name) {
  Object.entries(screens).forEach(([k, el]) => {
    el.hidden = k !== name;
  });
}

// ── File handling ─────────────────────────────────────────────────────────────
function acceptFile(file) {
  if (!file) return;
  if (!/\.m4a$/i.test(file.name)) {
    alert('Please select an .m4a file.');
    return;
  }
  selectedFile = file;
  fileName.textContent = file.name;
  fileSelected.hidden = false;
  pcOptions.hidden = false;
  btnConvert.disabled = false;
  dropZone.classList.remove('drag-over');
}

function clearFile() {
  selectedFile = null;
  fileInput.value = '';
  fileSelected.hidden = true;
  pcOptions.hidden = true;
  btnConvert.disabled = true;
}

// File input
fileInput.addEventListener('change', () => acceptFile(fileInput.files[0]));
btnBrowse.addEventListener('click', () => fileInput.click());
btnClear.addEventListener('click', clearFile);

// Drop zone keyboard activation
dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});
dropZone.addEventListener('click', (e) => {
  if (e.target !== btnBrowse) fileInput.click();
});

// Drag and drop
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  acceptFile(e.dataTransfer.files[0]);
});

// ── Step helpers ──────────────────────────────────────────────────────────────
function setStepState(stepId, state, note = '') {
  const el = document.getElementById(stepId);
  if (!el) return;
  el.dataset.state = state;
  const noteEl = document.getElementById('note-' + stepId.replace('step-', ''));
  if (noteEl) noteEl.textContent = note;
}

function activateStep(stepId, note = '') {
  // Complete previous step
  if (currentStep && currentStep !== stepId) {
    setStepState(currentStep, 'done');
  }
  currentStep = stepId;
  setStepState(stepId, 'active', note);
}

function completeStep(stepId, note = '') {
  setStepState(stepId, 'done', note);
  currentStep = null;
}

function errorStep(stepId, note = '') {
  setStepState(stepId, 'error', note);
}

// ── Progress bar ──────────────────────────────────────────────────────────────
const progressBar  = document.getElementById('progress-bar');
const progressFill = document.getElementById('progress-fill');

function setProgress(pct) {
  progressBar.hidden = false;
  progressFill.style.width = `${pct}%`;
}

// ── Upload progress bar (on the uploading step) ───────────────────────────────
const uploadProgressBar  = document.getElementById('upload-progress-bar');
const uploadProgressFill = document.getElementById('upload-progress-fill');

function setUploadProgress(pct) {
  uploadProgressBar.hidden = false;
  uploadProgressFill.style.width = `${pct}%`;
}

// ── Reset steps ───────────────────────────────────────────────────────────────
function resetSteps() {
  ['step-uploading', 'step-analysing', 'step-converting', 'step-verifying', 'step-done-step']
    .forEach((id) => {
      const el = document.getElementById(id);
      if (el) delete el.dataset.state;
      const noteId = 'note-' + id.replace('step-', '');
      const noteEl = document.getElementById(noteId);
      if (noteEl) noteEl.textContent = '';
    });
  uploadProgressBar.hidden = true;
  uploadProgressFill.style.width = '0%';
  progressBar.hidden = true;
  progressFill.style.width = '0%';
  progressError.hidden = true;
  progressErrorMsg.textContent = '';
  currentStep = null;
}

// ── Error display ─────────────────────────────────────────────────────────────
function showError(message, failedStepId) {
  if (failedStepId) errorStep(failedStepId, 'Failed — see below');
  progressError.hidden = false;
  progressErrorMsg.textContent = message || 'An unexpected error occurred. Please try again.';
}

// ── Format helpers ────────────────────────────────────────────────────────────
function formatDuration(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return h > 0
    ? `${h}h ${m}m ${s}s`
    : `${m}m ${s}s`;
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

// ── Preset / mono values ──────────────────────────────────────────────────────
function getPreset() {
  return document.querySelector('input[name="preset"]:checked')?.value ?? 'auto';
}

function getMono() {
  return document.getElementById('force-mono')?.checked ?? false;
}

// ── Convert ───────────────────────────────────────────────────────────────────
btnConvert.addEventListener('click', startConversion);

async function startConversion() {
  if (!selectedFile) return;

  showScreen('progress');
  resetSteps();
  const fileSizeMB = (selectedFile.size / (1024 * 1024)).toFixed(1);
  activateStep('step-uploading', `${fileSizeMB} MB — starting upload…`);
  setUploadProgress(0);
  uploadStartedAt = Date.now();

  const formData = new FormData();
  formData.append('audio', selectedFile);
  formData.append('preset', getPreset());
  formData.append('mono', String(getMono()));

  let jobId;
  try {
    const data = await uploadWithProgress('/api/podcast-converter/upload', formData, ({ percent }) => {
      setUploadProgress(percent);
      const elapsed = formatElapsed(Date.now() - uploadStartedAt);
      const noteEl = document.getElementById('note-uploading');
      if (noteEl) noteEl.textContent = `${fileSizeMB} MB — uploaded ${percent}% · ${elapsed} elapsed`;
    });
    jobId = data.jobId;
    currentJobId = jobId;
  } catch (err) {
    showError(err.message, 'step-uploading');
    return;
  }

  setUploadProgress(100);
  const uploadNote = document.getElementById('note-uploading');
  if (uploadNote) uploadNote.textContent = `${fileSizeMB} MB — upload complete`;

  completeStep('step-uploading');
  activateStep('step-analysing', 'Running ffprobe…');

  // Open SSE stream
  const sse = new EventSource(`/api/podcast-converter/status/${jobId}`);

  sse.onmessage = (e) => {
    let event;
    try { event = JSON.parse(e.data); } catch { return; }
    handleEvent(event, jobId, sse);
  };

  sse.onerror = () => {
    sse.close();
    showError('Connection to server lost. Please try again.', currentStep ?? 'step-analysing');
  };
}

function handleEvent(event, jobId, sse) {
  switch (event.type) {

    case 'probed': {
      const dur = formatDuration(event.durationSeconds);
      completeStep('step-analysing', dur);
      activateStep('step-converting', 'Starting…');
      break;
    }

    case 'converting': {
      const chan = event.mono ? 'Mono' : 'Stereo';
      const sr   = event.sampleRate ? ` · ${(event.sampleRate / 1000).toFixed(1)} kHz` : '';
      const note = `${event.kbps} kbps · ${chan}${sr}${event.attempt > 0 ? ` (attempt ${event.attempt + 1})` : ''}`;
      if (event.attempt === 0) {
        activateStep('step-converting', note);
      } else {
        setStepState('step-converting', 'active', note);
      }
      setProgress(0);
      break;
    }

    case 'progress': {
      setProgress(event.percent);
      const noteEl = document.getElementById('note-converting');
      if (noteEl && event.percent > 0) {
        // Preserve existing text, just update percent
        const base = noteEl.textContent.replace(/\s*—\s*\d+%$/, '');
        noteEl.textContent = `${base} — ${event.percent}%`;
      }
      break;
    }

    case 'verifying': {
      completeStep('step-converting');
      activateStep('step-verifying', 'Checking output file size…');
      break;
    }

    case 'retrying': {
      setStepState('step-verifying', 'active', `Over limit — retrying at ${event.kbps} kbps, mono…`);
      break;
    }

    case 'done': {
      sse.close();
      completeStep('step-verifying');
      completeStep('step-done-step', 'Conversion complete');
      showResult(event, jobId);
      break;
    }

    case 'error': {
      sse.close();
      showError(event.message, currentStep ?? 'step-converting');
      break;
    }
  }
}

// ── Result screen ─────────────────────────────────────────────────────────────
function showResult(event, jobId) {
  resDuration.textContent   = formatDuration(event.durationSeconds);
  resBitrate.textContent    = `${event.kbps} kbps`;
  resChannels.textContent   = event.mono ? 'Mono' : 'Stereo';
  resSamplerate.textContent = `${(event.sampleRate / 1000).toFixed(1)} kHz`;
  resSize.textContent       = formatBytes(event.sizeBytes) + ' (< 25 MB ✓)';

  const originalBase = (selectedFile?.name ?? 'podcast').replace(/\.m4a$/i, '');
  btnDownload.href     = `/api/podcast-converter/download/${jobId}`;
  btnDownload.download = `${originalBase}.mp3`;

  // Small delay so the user sees the last step complete
  setTimeout(() => showScreen('result'), 400);
}

// ── Reset / retry ─────────────────────────────────────────────────────────────
function resetAll() {
  clearFile();
  currentJobId = null;
  showScreen('upload');
}

btnRetry.addEventListener('click', resetAll);
btnAgain.addEventListener('click', resetAll);

function uploadWithProgress(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.responseType = 'json';

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const percent = Math.max(0, Math.min(100, Math.round((e.loaded / e.total) * 100)));
      onProgress({ percent });
    };

    xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));

    xhr.onload = () => {
      const body = xhr.response;
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body || {});
        return;
      }
      const msg = body?.error || `Upload error ${xhr.status}`;
      reject(new Error(msg));
    };

    xhr.send(formData);
  });
}

function formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

async function readApiResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }

  const text = await res.text();
  const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 140);
  if (res.ok) {
    throw new Error(`Unexpected non-JSON response from server (${res.status}). ${snippet}`);
  }
  return {
    error: `Server returned ${res.status} with unexpected content. ${snippet || 'No response body.'}`,
  };
}
