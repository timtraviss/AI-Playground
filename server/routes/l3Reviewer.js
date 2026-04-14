import { Router } from 'express';
import multer from 'multer';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import { randomUUID } from 'crypto';
import mammoth from 'mammoth';
import { reviewInterview } from '../lib/interviewReviewer.js';
import { buildMarkdownReport, buildDocxBuffer } from '../lib/l3ReportGenerator.js';

const UPLOAD_DIR = '/tmp/l3_uploads';
mkdirSync(UPLOAD_DIR, { recursive: true });

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

export const l3ReviewerRouter = Router();

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
    jobs.delete(jobId);
  }, JOB_TTL_MS);
}

function safeUnlink(path) {
  try { if (path && existsSync(path)) unlinkSync(path); } catch {}
}

function parseMulti(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  return v.split(',').map(s => s.trim()).filter(Boolean);
}

// ── POST /api/l3-reviewer/upload ───────────────────────────────────────────
l3ReviewerRouter.post('/upload', (req, res, next) => {
  upload.fields([
    { name: 'transcript', maxCount: 1 },
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
  const transcriptFile = req.files?.transcript?.[0];

  if (!transcriptFile) return res.status(400).json({ error: 'No transcript file uploaded.' });

  const formData = {
    dateOfInterview:          req.body.dateOfInterview          || '',
    reasonForInterview:       req.body.reasonForInterview       || '',
    fileNumber:               req.body.fileNumber               || '',
    lengthMinutes:            req.body.lengthMinutes            || '',
    interviewerName:          req.body.interviewerName          || '',
    interviewerQid:           req.body.interviewerQid           || '',
    interviewerSection:       req.body.interviewerSection       || '',
    interviewerSupervisor:    req.body.interviewerSupervisor    || '',
    wellcheckAcknowledged:    req.body.wellcheckAcknowledged    || '',
    firstTimeAccreditation:   req.body.firstTimeAccreditation   || '',
    assessorName:             req.body.assessorName             || '',
    assessorQid:              req.body.assessorQid              || '',
    dateEvaluated:            req.body.dateEvaluated            || '',
    dateFeedbackGiven:        req.body.dateFeedbackGiven        || '',
    intervieweeName:          req.body.intervieweeName          || '',
    intervieweeGender:        req.body.intervieweeGender        || '',
    specialConsiderations:    parseMulti(req.body.specialConsiderations),
    otherPersonsPresent:      parseMulti(req.body.otherPersonsPresent),
    supportingDocuments:      parseMulti(req.body.supportingDocuments),
    planningNotes:            req.body.planningNotes            || '',
    detailedKnowledge:        req.body.detailedKnowledge        || '',
    planningComments:         req.body.planningComments         || '',
    enquiriesIdentified:      req.body.enquiriesIdentified      || '',
    whatWentWell:             req.body.whatWentWell             || '',
    learningPoints:           req.body.learningPoints           || '',
    assessorPositiveFeedback: req.body.assessorPositiveFeedback || '',
    assessorLearningPoints:   req.body.assessorLearningPoints   || '',
    learningDevelopmentPlan:  req.body.learningDevelopmentPlan  || '',
  };

  const jobId = randomUUID();
  jobs.set(jobId, {
    events:      [],
    listeners:   [],
    result:      null,
    done:        false,
    error:       null,
    mdReport:    null,
    docxBuffer:  null,
    cleanupTimer: null,
  });

  runPipeline(jobId, transcriptFile, formData).catch(err => {
    console.error('[l3Reviewer] pipeline error:', err);
    pushEvent(jobId, { step: 'error', message: err.message });
    finishJob(jobId, null, err.message);
  });

  res.json({ jobId });
});

// ── GET /api/l3-reviewer/status/:jobId (SSE) ──────────────────────────────
l3ReviewerRouter.get('/status/:jobId', (req, res) => {
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

// ── GET /api/l3-reviewer/download/:jobId/docx ─────────────────────────────
l3ReviewerRouter.get('/download/:jobId/docx', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job || !job.done) return res.status(404).json({ error: 'Job not ready or not found' });
  if (job.error) return res.status(500).json({ error: job.error });
  if (!job.docxBuffer) return res.status(404).json({ error: 'DOCX report not available' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', 'attachment; filename="l3-interview-review.docx"');
  res.send(job.docxBuffer);
});

// ── GET /api/l3-reviewer/download/:jobId/md ───────────────────────────────
l3ReviewerRouter.get('/download/:jobId/md', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job || !job.done) return res.status(404).json({ error: 'Job not ready or not found' });
  if (job.error) return res.status(500).json({ error: job.error });
  if (!job.mdReport) return res.status(404).json({ error: 'Markdown report not available' });

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="l3-interview-review.md"');
  res.send(job.mdReport);
});

// ── Pipeline ───────────────────────────────────────────────────────────────
async function runPipeline(jobId, transcriptFile, formData) {
  const job = jobs.get(jobId);

  try {
    // ── Step 1: Extract transcript text ──────────────────────────────────
    pushEvent(jobId, { step: 'extracting', message: 'Extracting text from transcript…' });

    let transcriptText;
    try {
      const { value } = await mammoth.extractRawText({ path: transcriptFile.path });
      transcriptText = value;
    } catch (err) {
      throw new Error('Could not read this file — please ensure it is a valid Word document (.docx).');
    }

    const wordCount = transcriptText.trim().split(/\s+/).length;
    pushEvent(jobId, {
      step: 'extracting_done',
      message: `${wordCount.toLocaleString()} words extracted`,
      wordCount,
    });

    // ── Step 2: AI review ─────────────────────────────────────────────────
    pushEvent(jobId, { step: 'reviewing', message: 'Sending transcript to Claude Sonnet 4.6…' });

    let review;
    const heartbeat = setInterval(() => pushEvent(jobId, { step: 'heartbeat' }), 30_000);
    try {
      review = await reviewInterview(transcriptText, formData, ({ type }) => {
        if (type === 'connected') {
          pushEvent(jobId, { step: 'reviewing_connected', message: 'Claude is generating the assessment…' });
        }
      });
    } finally {
      clearInterval(heartbeat);
    }

    pushEvent(jobId, {
      step: 'reviewing_done',
      message: `Assessment complete — ${review.verdict}`,
    });

    // ── Step 3: Generate reports ──────────────────────────────────────────
    pushEvent(jobId, { step: 'generating', message: 'Generating Word and Markdown reports…' });

    job.mdReport   = buildMarkdownReport(formData, review);
    job.docxBuffer = buildDocxBuffer(formData, review);

    pushEvent(jobId, { step: 'generating_done', message: 'Reports ready' });

    // ── Done ──────────────────────────────────────────────────────────────
    finishJob(jobId, {
      verdict:               review.verdict,
      narrativeSummary:      review.narrativeSummary,
      section5:              review.section5,
      section6:              review.section6,
      section7:              review.section7,
      section8:              review.section8,
      strengths:             review.strengths,
      learningPoints:        review.learningPoints,
      aiSuggestedFeedback:   review.aiSuggestedFeedback,
    });

  } finally {
    safeUnlink(transcriptFile.path);
  }
}
