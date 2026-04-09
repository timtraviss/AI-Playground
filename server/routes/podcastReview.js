import { Router } from 'express';
import multer from 'multer';
import { mkdirSync, unlinkSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { transcribe } from '../lib/whisper.js';
import { extractClaims } from '../lib/claimExtractor.js';
import { reviewClaim } from '../lib/claimReviewer.js';

const UPLOAD_DIR = '/tmp/podcast_review_uploads';
mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB — OpenAI Whisper API limit
  fileFilter: (_req, file, cb) => {
    const ok = /\.(mp3|m4a|wav|ogg|flac)$/i.test(file.originalname);
    cb(ok ? null : new Error('Only MP3, M4A, WAV, OGG, FLAC files are supported'), ok);
  },
});

// In-memory job store  { jobId: { status, events, result } }
const jobs = new Map();

export const podcastReviewRouter = Router();

// ── POST /api/podcast-review/upload ────────────────────────────────────────
podcastReviewRouter.post('/upload', upload.single('audio'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });

  const jobId = randomUUID();
  jobs.set(jobId, { events: [], result: null, done: false, error: null });

  // Kick off background pipeline — don't await
  runPipeline(jobId, req.file).catch(err => {
    pushEvent(jobId, { step: 'error', message: err.message });
    finishJob(jobId, null, err.message);
  });

  res.json({ jobId });
});

// ── GET /api/podcast-review/status/:jobId ──────────────────────────────────
podcastReviewRouter.get('/status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send any buffered events first
  for (const evt of job.events) {
    res.write(`data: ${JSON.stringify(evt)}\n\n`);
  }

  if (job.done) {
    res.end();
    return;
  }

  // Subscribe to future events
  if (!job.subscribers) job.subscribers = [];
  job.subscribers.push(res);

  req.on('close', () => {
    if (job.subscribers) {
      job.subscribers = job.subscribers.filter(s => s !== res);
    }
  });
});

// ── GET /api/podcast-review/result/:jobId ──────────────────────────────────
podcastReviewRouter.get('/result/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!job.done) return res.status(202).json({ status: 'processing' });
  if (job.error) return res.status(500).json({ error: job.error });
  res.json(job.result);
});

// ── Pipeline ────────────────────────────────────────────────────────────────
async function runPipeline(jobId, file) {
  const audioPath = file.path;

  try {
    // Step 1 — Transcribe
    pushEvent(jobId, { step: 'transcribing' });
    const transcript = await transcribe(audioPath);

    // Step 2 — Extract claims
    pushEvent(jobId, { step: 'extracting' });
    const claims = await extractClaims(transcript);
    pushEvent(jobId, { step: 'extracting', claimsFound: claims.length });

    // Step 3 — Review each claim
    const reviewed = [];
    for (let i = 0; i < claims.length; i++) {
      const claim = claims[i];
      pushEvent(jobId, {
        step: 'checking',
        current: i + 1,
        total: claims.length,
        claim: claim.quote?.slice(0, 100),
      });
      const result = await reviewClaim(claim);
      reviewed.push(result);
    }

    // Build result
    const categoryCounts = {};
    for (const r of reviewed) {
      categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1;
    }

    const priorityCategories = new Set(['INACCURATE', 'MISSING CAVEAT', 'OUTDATED LAW']);
    const priorityIssues = reviewed.filter(r => priorityCategories.has(r.category));

    const result = {
      jobId,
      filename: file.originalname,
      reviewedAt: new Date().toISOString().split('T')[0],
      transcript,
      totalClaims: reviewed.length,
      categoryCounts,
      priorityIssues,
      claims: reviewed,
    };

    pushEvent(jobId, { step: 'done' });
    finishJob(jobId, result, null);
  } finally {
    // Clean up upload
    try { if (existsSync(audioPath)) unlinkSync(audioPath); } catch {}
  }
}

function pushEvent(jobId, evt) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.events.push(evt);
  if (job.subscribers) {
    for (const res of job.subscribers) {
      try { res.write(`data: ${JSON.stringify(evt)}\n\n`); } catch {}
    }
  }
}

function finishJob(jobId, result, error) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.done = true;
  job.result = result;
  job.error = error;
  if (job.subscribers) {
    for (const res of job.subscribers) {
      try { res.end(); } catch {}
    }
  }
}
