/**
 * /api/podcast-converter routes
 *
 * POST /upload        — accepts .m4a, queues conversion job, returns { jobId }
 * GET  /status/:id    — SSE stream of conversion progress events
 * GET  /download/:id  — streams the converted MP3 as a download
 */

import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { unlink } from 'fs/promises';
import { createReadStream } from 'fs';
import { basename } from 'path';
import { runConversion } from '../lib/converter.js';

const router = Router();

// ── Upload limits ─────────────────────────────────────────────────────────────
// 250 MB: accommodates long podcast M4As before bitrate reduction.
// The OUTPUT is always guaranteed < 25 MB by runConversion.
const UPLOAD_LIMIT_MB = 250;

const upload = multer({
  dest: '/tmp/podcast_converter_uploads',
  limits: { fileSize: UPLOAD_LIMIT_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // Validate by extension — do NOT trust client MIME type alone.
    // M4A files may arrive with audio/mp4, audio/x-m4a, audio/aac, etc.
    if (!/\.m4a$/i.test(file.originalname)) {
      return cb(new Error('Only .m4a files are accepted'));
    }
    cb(null, true);
  },
});

// ── In-memory job store ───────────────────────────────────────────────────────
// Keyed by jobId (UUID). Entries expire after JOB_TTL_MS of inactivity.
const JOB_TTL_MS = 10 * 60 * 1000; // 10 minutes
const jobs = new Map();

function getJob(jobId) {
  return jobs.get(jobId) ?? null;
}

function pushEvent(jobId, event) {
  const job = getJob(jobId);
  if (!job) return;
  const data = JSON.stringify(event);
  job.events.push(data);
  job.listeners.forEach((cb) => cb(data));
}

function finishJob(jobId, result) {
  const job = getJob(jobId);
  if (!job) return;
  job.done = true;
  job.result = result;
  pushEvent(jobId, { type: 'done', ...result });
}

function failJob(jobId, message) {
  const job = getJob(jobId);
  if (!job) return;
  job.done = true;
  job.error = message;
  pushEvent(jobId, { type: 'error', message });
}

async function cleanupJob(jobId) {
  const job = getJob(jobId);
  if (!job) return;
  if (job.inputPath)  await unlink(job.inputPath).catch(() => {});
  if (job.outputPath) await unlink(job.outputPath).catch(() => {});
  jobs.delete(jobId);
}

// ── POST /upload ──────────────────────────────────────────────────────────────
router.post('/upload', (req, res, next) => {
  upload.single('audio')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: `File exceeds the ${UPLOAD_LIMIT_MB} MB upload limit. ` +
                 `Consider trimming your podcast before converting.`,
        });
      }
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const preset = ['auto', 'low', 'medium', 'high'].includes(req.body?.preset)
    ? req.body.preset
    : 'auto';
  const forceMono = req.body?.mono === 'true';

  const jobId = randomUUID();
  jobs.set(jobId, {
    events: [],
    listeners: new Set(),
    result: null,
    done: false,
    error: null,
    inputPath: req.file.path,
    outputPath: null,
    originalName: req.file.originalname,
    expiryTimer: null,
  });

  res.json({ jobId });

  // Run pipeline in background — do not await.
  runConversion(req.file.path, preset, forceMono, (event) => {
    pushEvent(jobId, event);
  })
    .then((result) => {
      const job = getJob(jobId);
      if (job) job.outputPath = result.outputPath;
      finishJob(jobId, {
        kbps: result.kbps,
        mono: result.mono,
        sampleRate: result.sampleRate,
        sizeBytes: result.sizeBytes,
        durationSeconds: result.durationSeconds,
      });
    })
    .catch((err) => {
      failJob(jobId, err.message);
    })
    .finally(async () => {
      // Clean up input; output is cleaned after download (or on expiry).
      const job = getJob(jobId);
      if (job?.inputPath) {
        await unlink(job.inputPath).catch(() => {});
        job.inputPath = null;
      }
      // Schedule expiry cleanup for abandoned jobs.
      const job2 = getJob(jobId);
      if (job2) {
        job2.expiryTimer = setTimeout(() => cleanupJob(jobId), JOB_TTL_MS);
      }
    });
});

// ── GET /status/:jobId ── SSE progress stream ─────────────────────────────────
router.get('/status/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${data}\n\n`);

  // Replay events that arrived before client connected.
  job.events.forEach(send);

  if (job.done) {
    res.end();
    return;
  }

  job.listeners.add(send);

  req.on('close', () => {
    job.listeners.delete(send);
  });
});

// ── GET /download/:jobId ──────────────────────────────────────────────────────
router.get('/download/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job || !job.done) {
    return res.status(404).json({ error: 'Job not ready' });
  }
  if (job.error) {
    return res.status(500).json({ error: job.error });
  }
  if (!job.outputPath) {
    return res.status(410).json({ error: 'File already downloaded or expired' });
  }

  const originalBase = basename(job.originalName || 'podcast', '.m4a');
  const downloadName = `${originalBase}.mp3`;

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
  res.setHeader('Content-Length', String(job.result?.sizeBytes ?? ''));

  const stream = createReadStream(job.outputPath);

  stream.pipe(res);

  stream.on('end', async () => {
    // Clean up output file after download.
    const outputPath = job.outputPath;
    job.outputPath = null;
    await unlink(outputPath).catch(() => {});
    // Cancel the expiry timer — job is fully complete.
    clearTimeout(job.expiryTimer);
    setTimeout(() => jobs.delete(req.params.jobId), 5_000);
  });

  stream.on('error', (err) => {
    console.error('Download stream error:', err);
    res.destroy();
  });
});

export { router as podcastConverterRouter };
