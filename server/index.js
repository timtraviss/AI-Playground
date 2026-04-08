import express from 'express';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const { sessionRouter } = await import('./routes/session.js');
const { critiqueRouter } = await import('./routes/critique.js');
const { witnessRouter } = await import('./routes/witness.js');
const { latestConversationRouter } = await import('./routes/latestConversation.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(resolve(projectRoot, 'public')));

app.use('/api/session', sessionRouter);
app.use('/api/critique', critiqueRouter);
app.use('/api/witness', witnessRouter);
app.use('/api/latest-conversation', latestConversationRouter);

// Fallback — serve index.html for any unmatched route
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
