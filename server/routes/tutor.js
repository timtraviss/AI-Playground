import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import { convertDocxToMarkdown, slugify } from '../lib/docxToMarkdown.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = resolve(__dirname, '../data/knowledge');
const MODULES_PATH = join(KNOWLEDGE_DIR, 'modules.json');
const UPLOAD_DIR = '/tmp/tutor_uploads';
mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.docx$/i.test(file.originalname);
    cb(ok ? null : new Error('Only .docx files are supported'), ok);
  },
});

function readModules() {
  try {
    return JSON.parse(readFileSync(MODULES_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function writeModules(modules) {
  writeFileSync(MODULES_PATH, JSON.stringify(modules, null, 2), 'utf8');
}

function safeKnowledgePath(id) {
  const safe = id.replace(/[^a-z0-9_]/g, '');
  if (!safe) throw new Error('Invalid module id');
  const full = join(KNOWLEDGE_DIR, `${safe}.md`);
  if (!full.startsWith(KNOWLEDGE_DIR + '/')) throw new Error('Invalid module id');
  return full;
}

export const tutorRouter = Router();

// GET /api/tutor/modules
tutorRouter.get('/modules', (_req, res) => {
  res.json(readModules());
});

// POST /api/tutor/knowledge/upload
tutorRouter.post('/knowledge/upload', (req, res, next) => {
  upload.single('module')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File exceeds the 50 MB limit.' });
      }
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req, res) => {
  const file = req.file;
  const name = (req.body.name || '').trim();

  if (!file) return res.status(400).json({ error: 'No file uploaded.' });
  if (!name) return res.status(400).json({ error: 'Module display name is required.' });

  if (!process.env.ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'ADMIN_PASSWORD not configured.' });
  }
  const password = req.body.password;
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }

  const id = slugify(name);
  if (!id) return res.status(400).json({ error: 'Display name produced an empty id.' });

  try {
    const markdown = await convertDocxToMarkdown(file.path);
    const mdPath = join(KNOWLEDGE_DIR, `${id}.md`);
    writeFileSync(mdPath, markdown, 'utf8');

    const modules = readModules().filter(m => m.id !== id);
    modules.push({ id, name, updatedAt: new Date().toISOString() });
    writeModules(modules);

    res.json({ ok: true, id, name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    try { unlinkSync(file.path); } catch {}
  }
});

// DELETE /api/tutor/knowledge/:id
tutorRouter.delete('/knowledge/:id', (req, res) => {
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'ADMIN_PASSWORD not configured.' });
  }
  const { password } = req.body || {};
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }

  let mdPath;
  try {
    mdPath = safeKnowledgePath(req.params.id);
  } catch {
    return res.status(400).json({ error: 'Invalid module id.' });
  }

  try {
    if (existsSync(mdPath)) unlinkSync(mdPath);
    const modules = readModules().filter(m => m.id !== req.params.id);
    writeModules(modules);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tutor/chat
tutorRouter.post('/chat', async (req, res) => {
  const { moduleId, messages } = req.body || {};

  if (typeof moduleId !== 'string' || !moduleId || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'moduleId and messages are required.' });
  }

  const safeMessages = messages.filter(
    m => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string'
  );
  if (safeMessages.length === 0) {
    return res.status(400).json({ error: 'messages must contain at least one valid message.' });
  }

  let mdPath;
  try {
    mdPath = safeKnowledgePath(moduleId);
  } catch {
    return res.status(400).json({ error: 'Invalid moduleId.' });
  }

  if (!existsSync(mdPath)) {
    return res.status(404).json({ error: 'Module not found.' });
  }

  const moduleMarkdown = readFileSync(mdPath, 'utf8');
  const modules = readModules();
  const moduleMeta = modules.find(m => m.id === moduleId);
  const moduleName = moduleMeta?.name || moduleId;

  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Claude API key not configured.' });

  const client = new Anthropic({ apiKey });

  const systemBlocks = [
    {
      type: 'text',
      text: `You are a DDP Tutor — an AI study guide for New Zealand Police trainee detectives studying the Detective Development Programme (DDP).

STRICT RULES:
1. Answer ONLY from the module content provided below. Do not use outside knowledge, case law, or legislation not present in the module.
2. If a question cannot be answered from the module, say clearly: "That topic isn't covered in this module — I can only help with content from ${moduleName}."
3. Use NZ English throughout (e.g. "offence" not "offense", "licence" not "license").
4. Reference specific sections, legislation, or case law exactly as they appear in the module.
5. After answering, occasionally (not every time) ask a short reflective question to check the trainee's understanding.
6. Keep answers clear and appropriately detailed — trainees are preparing for assessment.`,
      cache_control: { type: 'ephemeral' },
    },
    {
      type: 'text',
      text: `MODULE: ${moduleName}\n\n---\n${moduleMarkdown}\n---`,
      cache_control: { type: 'ephemeral' },
    },
  ];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemBlocks,
      messages: safeMessages,
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta?.type === 'text_delta'
      ) {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// POST /api/tutor/tts
tutorRouter.post('/tts', async (req, res) => {
  const { text } = req.body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text is required.' });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_TUTOR_VOICE_ID;

  if (!apiKey || !voiceId) {
    return res.status(503).json({ error: 'ElevenLabs TTS not configured. Set ELEVENLABS_API_KEY and ELEVENLABS_TUTOR_VOICE_ID.' });
  }

  const ttsRes = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: text.slice(0, 2500),
        model_id: 'eleven_flash_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  );

  if (!ttsRes.ok) {
    const err = (await ttsRes.text()).slice(0, 500);
    return res.status(ttsRes.status).json({ error: `ElevenLabs error: ${err}` });
  }

  res.setHeader('Content-Type', 'audio/mpeg');
  const buf = await ttsRes.arrayBuffer();
  res.send(Buffer.from(buf));
});
