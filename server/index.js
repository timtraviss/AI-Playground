import express from 'express';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const { configRouter } = await import('./routes/config.js');
const { transcriptRouter } = await import('./routes/transcript.js');
const { witnessRouter } = await import('./routes/witness.js');
const { latestConversationRouter } = await import('./routes/latestConversation.js');
const { podcastReviewRouter } = await import('./routes/podcastReview.js');
const { podcastConverterRouter } = await import('./routes/podcastConverter.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(resolve(projectRoot, 'public')));

app.use('/api/config', configRouter);
app.use('/api/transcript', transcriptRouter);
app.use('/api/witness', witnessRouter);
app.use('/api/latest-conversation', latestConversationRouter);
app.use('/api/podcast-review', podcastReviewRouter);
app.use('/api/podcast-converter', podcastConverterRouter);

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

// Landing page fallback
app.get('*', (req, res) => {
  res.sendFile(resolve(projectRoot, 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n  W.I.T.N.E.S.S. Tutor running at http://localhost:${PORT}\n`);

  if (!process.env.ELEVENLABS_API_KEY) console.warn('  ⚠  ELEVENLABS_API_KEY not set');
  if (!process.env.ELEVENLABS_AGENT_ID) console.warn('  ⚠  ELEVENLABS_AGENT_ID not set');
  if (!process.env.CLAUDE_API_KEY) console.warn('  ⚠  CLAUDE_API_KEY not set');
});
