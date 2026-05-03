import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, renameSync } from 'fs';
import { resolve, dirname, join, extname } from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import { convertDocxToMarkdown, slugify } from '../lib/docxToMarkdown.js';
import { requireAdmin } from '../middleware/auth.js';
import { logUsage } from '../lib/usageLogger.js';
import { transcribe } from '../lib/whisper.js';
import { transcribeLocal } from '../lib/localWhisper.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = resolve(__dirname, '../data/knowledge');
const TUTOR_SYSTEM_PROMPT = readFileSync(resolve(__dirname, '../prompts/tutor-persona.md'), 'utf8');
const TUTOR_ASSESSMENT_GUIDE = readFileSync(resolve(__dirname, '../prompts/tutor-assessment.md'), 'utf8');
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

const audioUpload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 10 * 1024 * 1024 } });

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
tutorRouter.post('/knowledge/upload', requireAdmin, (req, res, next) => {
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

  const id = slugify(name);
  if (!id) return res.status(400).json({ error: 'Display name produced an empty id.' });

  try {
    const markdown = await convertDocxToMarkdown(file.path);
    const mdPath = safeKnowledgePath(id);
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
tutorRouter.delete('/knowledge/:id', requireAdmin, (req, res) => {
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
      text: TUTOR_SYSTEM_PROMPT.replace('{MODULE_NAME}', moduleName),
      cache_control: { type: 'ephemeral' },
    },
    {
      type: 'text',
      text: `MODULE: ${moduleName}\n\n---\n${moduleMarkdown}\n---`,
      cache_control: { type: 'ephemeral' },
    },
    {
      type: 'text',
      text: `ASSESSMENT GUIDE:\n\n${TUTOR_ASSESSMENT_GUIDE}`,
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

    const finalMsg = await stream.finalMessage();
    logUsage({ userId: req.user?.id, tool: 'ddp-tutor', usage: finalMsg.usage, model: 'claude-sonnet-4-6' }).catch(() => {});

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

  try {
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
  } catch (err) {
    res.status(502).json({ error: 'TTS service unreachable.' });
  }
});

// POST /api/tutor/transcribe
tutorRouter.post('/transcribe', (req, res, next) => {
  audioUpload.single('audio')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No audio uploaded.' });

  // Whisper uses the file extension to set the MIME type — add it back.
  const origExt = extname(file.originalname || '').toLowerCase() || '.webm';
  const audioPath = file.path + origExt;
  let cleaned = false;
  try {
    renameSync(file.path, audioPath);
    cleaned = true;
    let text;
    try {
      text = await transcribeLocal(audioPath);
    } catch (localErr) {
      if (!process.env.OPENAI_API_KEY) throw localErr;
      text = await transcribe(audioPath, 'whisper-1');
    }
    res.json({ text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    try { unlinkSync(cleaned ? audioPath : file.path); } catch {}
  }
});
