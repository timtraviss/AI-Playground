import { Router } from 'express';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENARIO_PATH = resolve(__dirname, '../data/scenarios/catherine.md');

function parseScenario(md) {
  const sections = {};
  const parts = md.split(/^## /m);
  for (const part of parts) {
    const nl = part.indexOf('\n');
    if (nl === -1) continue;
    const heading = part.slice(0, nl).trim();
    const body = part.slice(nl + 1).trim();
    sections[heading] = body;
  }
  return {
    briefing: sections['Scenario Briefing'] || '',
    task: sections['Your Task'] || '',
  };
}

export const adminRouter = Router();

// GET /api/admin/scenario — read current scenario text (no auth needed)
adminRouter.get('/scenario', (_req, res) => {
  try {
    const md = readFileSync(SCENARIO_PATH, 'utf8');
    res.json(parseScenario(md));
  } catch (err) {
    res.status(500).json({ error: 'Could not read scenario file: ' + err.message });
  }
});

// POST /api/admin/scenario — update scenario text (requireAdmin applied in index.js)
adminRouter.post('/scenario', (req, res) => {
  const { briefing, task } = req.body || {};

  if (typeof briefing !== 'string' || typeof task !== 'string') {
    return res.status(400).json({ error: 'briefing and task are required strings.' });
  }

  const md = `## Scenario Briefing\n${briefing.trim()}\n\n## Your Task\n${task.trim()}\n`;

  try {
    writeFileSync(SCENARIO_PATH, md, 'utf8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not write scenario file: ' + err.message });
  }
});
