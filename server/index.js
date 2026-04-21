import express from 'express';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { requestLogger, errorLogger } from './middleware/logger.js';
import { logsRouter } from './routes/logs.js';
import { initDb } from './lib/db.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const { configRouter } = await import('./routes/config.js');
const { transcriptRouter } = await import('./routes/transcript.js');
const { witnessRouter } = await import('./routes/witness.js');
const { latestConversationRouter } = await import('./routes/latestConversation.js');
const { critiqueRouter } = await import('./routes/critique.js');
const { scenarioRouter } = await import('./routes/scenario.js');
const { adminRouter } = await import('./routes/admin.js');
const { podcastReviewRouter } = await import('./routes/podcastReview.js');
const { podcastConverterRouter } = await import('./routes/podcastConverter.js');
const { proofreaderRouter } = await import('./routes/proofreader.js');
const { l3ReviewerRouter } = await import('./routes/l3Reviewer.js');
const { tutorRouter } = await import('./routes/tutor.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(express.json());
app.use(requestLogger);
app.use(express.static(resolve(projectRoot, 'public')));

app.use('/api/config', configRouter);
app.use('/api/transcript', transcriptRouter);
app.use('/api/witness', witnessRouter);
app.use('/api/latest-conversation', latestConversationRouter);
app.use('/api/critique', critiqueRouter);
app.use('/api/scenario', scenarioRouter);
app.use('/api/admin', adminRouter);
app.use('/api/podcast-review', podcastReviewRouter);
app.use('/api/podcast-converter', podcastConverterRouter);
app.use('/api/proofreader', proofreaderRouter);
app.use('/api/l3-reviewer', l3ReviewerRouter);
app.use('/api/tutor', tutorRouter);
app.use('/api/logs', logsRouter);

// Return JSON for unknown API routes instead of HTML fallback pages.
app.use('/api', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
});

// Interview subpage
app.get('/interview', (req, res) => {
  res.redirect('/interview/');
});
app.get('/interview/', (req, res) => {
  res.sendFile(resolve(projectRoot, 'public', 'interview', 'index.html'));
});

// Admin page
app.get('/admin', (req, res) => {
  res.sendFile(resolve(projectRoot, 'public', 'admin', 'index.html'));
});

// Podcast Reviewer subpage
app.get('/podcast-reviewer', (req, res) => {
  res.redirect('/podcast-reviewer/');
});
app.get('/podcast-reviewer/', (req, res) => {
  res.sendFile(resolve(projectRoot, 'public', 'podcast-reviewer', 'index.html'));
});

// Podcast Converter subpage
app.get('/podcast-converter', (req, res) => {
  res.redirect('/podcast-converter/');
});
app.get('/podcast-converter/', (req, res) => {
  res.sendFile(resolve(projectRoot, 'public', 'podcast-converter', 'index.html'));
});

// Module Proofreader subpage
app.get('/proofreader', (req, res) => {
  res.redirect('/proofreader/');
});
app.get('/proofreader/', (req, res) => {
  res.sendFile(resolve(projectRoot, 'public', 'proofreader', 'index.html'));
});

// L3 Interview Reviewer subpage
app.get('/l3-reviewer', (req, res) => {
  res.redirect('/l3-reviewer/');
});
app.get('/l3-reviewer/', (req, res) => {
  res.sendFile(resolve(projectRoot, 'public', 'l3-reviewer', 'index.html'));
});

// DDP Tutor subpage
app.get('/tutor', (req, res) => res.redirect('/tutor/'));
app.get('/tutor/', (req, res) => {
  res.sendFile(resolve(projectRoot, 'public', 'tutor', 'index.html'));
});

// Landing page fallback
app.get('*', (req, res) => {
  res.sendFile(resolve(projectRoot, 'public', 'index.html'));
});

// Global error handler
app.use(errorLogger);
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: 'Internal server error' });
});

await initDb();

app.listen(PORT, () => {
  console.log(`\n  W.I.T.N.E.S.S. Tutor running at http://localhost:${PORT}\n`);

  if (!process.env.ELEVENLABS_API_KEY) console.warn('  ⚠  ELEVENLABS_API_KEY not set');
  if (!process.env.ELEVENLABS_AGENT_ID) console.warn('  ⚠  ELEVENLABS_AGENT_ID not set');
  if (!process.env.CLAUDE_API_KEY) console.warn('  ⚠  CLAUDE_API_KEY not set');
});
