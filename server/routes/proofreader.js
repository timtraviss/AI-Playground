import { Router } from 'express';
import multer from 'multer';
import { mkdirSync, existsSync, unlinkSync, createReadStream } from 'fs';
import { randomUUID } from 'crypto';
import mammoth from 'mammoth';
import { reviewModule } from '../lib/moduleReviewer.js';
import { annotateDocx } from '../lib/docxAnnotator.js';
import { verifyLegislationIssues } from '../lib/legislationVerifier.js';

const UPLOAD_DIR = '/tmp/proofreader_uploads';
const OUTPUT_DIR = '/tmp/proofreader_output';
mkdirSync(UPLOAD_DIR, { recursive: true });
mkdirSync(OUTPUT_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    const ok = /\.docx$/i.test(file.originalname);
    cb(ok ? null : new Error('Only .docx files are supported'), ok);
  },
});

// In-memory job store
const jobs = new Map();
const JOB_TTL_MS = 15 * 60 * 1000; // 15 min

export const proofreaderRouter = Router();

// ── Helpers ────────────────────────────────────────────────────────────────

function pushEvent(jobId, data) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.events.push(data);
  job.listeners.forEach(send => send(data));
}

function finishJob(jobId, result, error) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.done   = true;
  job.result = result;
  job.error  = error || null;
  job.listeners.forEach(send => send({ step: error ? 'error' : 'done', result, error }));
  job.listeners = [];
  // Cleanup after TTL
  job.cleanupTimer = setTimeout(() => {
    const j = jobs.get(jobId);
    if (j) {
      if (j.outputPath && existsSync(j.outputPath)) unlinkSync(j.outputPath);
      jobs.delete(jobId);
    }
  }, JOB_TTL_MS);
}

function safeUnlink(path) {
  try { if (path && existsSync(path)) unlinkSync(path); } catch {}
}

// ── POST /api/proofreader/upload ───────────────────────────────────────────
proofreaderRouter.post('/upload', (req, res, next) => {
  upload.fields([
    { name: 'module',    maxCount: 1 },
    { name: 'reference', maxCount: 1 },
  ])(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File exceeds the 50 MB limit.' });
      }
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    next();
  });
}, (req, res) => {
  const moduleFile    = req.files?.module?.[0];
  const referenceFile = req.files?.reference?.[0];

  if (!moduleFile) return res.status(400).json({ error: 'No module file uploaded' });

  const jobId = randomUUID();
  jobs.set(jobId, {
    events:      [],
    listeners:   [],
    result:      null,
    done:        false,
    error:       null,
    outputPath:  null,
    cleanupTimer: null,
  });

  runPipeline(jobId, moduleFile, referenceFile).catch(err => {
    console.error('[proofreader] pipeline error:', err);
    pushEvent(jobId, { step: 'error', message: err.message });
    finishJob(jobId, null, err.message);
  });

  res.json({ jobId });
});

// ── GET /api/proofreader/status/:jobId (SSE) ──────────────────────────────
proofreaderRouter.get('/status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Replay buffered events for reconnecting clients
  job.events.forEach(send);

  if (job.done) {
    send({ step: job.error ? 'error' : 'done', result: job.result, error: job.error });
    return res.end();
  }

  job.listeners.push(send);

  req.on('close', () => {
    job.listeners = job.listeners.filter(l => l !== send);
  });
});

// ── GET /api/proofreader/download/:jobId ──────────────────────────────────
proofreaderRouter.get('/download/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job || !job.done) return res.status(404).json({ error: 'Job not ready or not found' });
  if (job.error) return res.status(500).json({ error: job.error });
  if (!job.outputPath || !existsSync(job.outputPath)) {
    return res.status(404).json({ error: 'Output file not found' });
  }

  const filename = job.originalName
    ? job.originalName.replace(/\.docx$/i, '_reviewed.docx')
    : 'reviewed.docx';

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  createReadStream(job.outputPath).pipe(res);
});

// ── Pipeline ───────────────────────────────────────────────────────────────
async function runPipeline(jobId, moduleFile, referenceFile) {
  const job = jobs.get(jobId);

  try {
    // ── Step 1: Extract text ──────────────────────────────────────────────
    pushEvent(jobId, { step: 'extracting', message: 'Extracting text from document…' });

    const { value: moduleText } = await mammoth.extractRawText({ path: moduleFile.path });
    const wordCount = moduleText.trim().split(/\s+/).length;

    let referenceText = null;
    if (referenceFile) {
      const { value } = await mammoth.extractRawText({ path: referenceFile.path });
      referenceText = value;
    }

    pushEvent(jobId, {
      step: 'extracting_done',
      message: `${wordCount.toLocaleString()} words extracted`,
      wordCount,
    });

    // ── Step 2: AI review ─────────────────────────────────────────────────
    pushEvent(jobId, { step: 'reviewing', message: 'Sending document to Claude Sonnet 4.6…' });

    let review;
    const heartbeat = setInterval(() => pushEvent(jobId, { step: 'heartbeat' }), 30_000);
    try {
      review = await reviewModule(moduleText, referenceText, ({ type }) => {
        if (type === 'connected') {
          pushEvent(jobId, { step: 'reviewing_connected', message: 'Claude is generating your review…' });
        }
      });
    } catch (err) {
      console.error('[proofreader] Claude API error:', err);
      throw err;
    } finally {
      clearInterval(heartbeat);
    }

    pushEvent(jobId, {
      step: 'reviewing_done',
      message: `${review.totalIssues} issues found`,
      totalIssues:     review.totalIssues,
      byCategoryCount: review.byCategoryCount,
      criticalCount:   review.criticalCount,
      summary:         review.summary,
    });

    // ── Step 2.5: Verify legislation against legislation.govt.nz ──────────
    const legislationIssues = review.issues.filter(i => i.category === 'LEGISLATION');
    if (legislationIssues.length > 0) {
      pushEvent(jobId, {
        step: 'verifying_legislation',
        message: `Checking ${legislationIssues.length} legislation claim${legislationIssues.length !== 1 ? 's' : ''} against legislation.govt.nz…`,
      });
      try {
        const verified = await verifyLegislationIssues(legislationIssues);
        for (const vi of verified) {
          const idx = review.issues.findIndex(i => i.id === vi.id);
          if (idx !== -1) review.issues[idx] = vi;
        }
        const withNote = verified.filter(i => i.legislationNote && !i.legislationNote.startsWith('['));
        pushEvent(jobId, {
          step: 'verifying_legislation_done',
          message: withNote.length
            ? `${legislationIssues.length} checked — ${withNote.length} statutory text${withNote.length !== 1 ? 's' : ''} retrieved`
            : `${legislationIssues.length} claim${legislationIssues.length !== 1 ? 's' : ''} checked`,
        });
      } catch (err) {
        console.warn('[proofreader] Legislation verification error:', err.message);
        pushEvent(jobId, { step: 'verifying_legislation_done', message: 'Verification skipped' });
      }
    }

    // ── Step 3: Annotate DOCX ─────────────────────────────────────────────
    pushEvent(jobId, { step: 'annotating', message: 'Adding Word comments to document…' });

    const outputPath = `${OUTPUT_DIR}/${jobId}.docx`;
    await annotateDocx(moduleFile.path, review.issues, outputPath);

    job.outputPath   = outputPath;
    job.originalName = moduleFile.originalname;

    const commentCount = review.issues.length;
    pushEvent(jobId, {
      step: 'annotating_done',
      message: `${commentCount} comment${commentCount !== 1 ? 's' : ''} added`,
      commentCount,
    });

    // ── Done ──────────────────────────────────────────────────────────────
    finishJob(jobId, {
      summary:         review.summary,
      totalIssues:     review.totalIssues,
      byCategoryCount: review.byCategoryCount,
      criticalCount:   review.criticalCount,
      criticalIssues:  review.issues.filter(i => i.severity === 'critical'),
    });

  } finally {
    // Clean up uploaded files
    safeUnlink(moduleFile.path);
    if (referenceFile) safeUnlink(referenceFile.path);
  }
}
