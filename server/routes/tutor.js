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
    if (err) return res.status(400).json({ error: err.message });
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
