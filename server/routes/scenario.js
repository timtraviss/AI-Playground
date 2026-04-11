import { Router } from 'express';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENARIO_PATH = resolve(__dirname, '../data/scenarios/catherine.md');

/**
 * Parse ## Heading sections from a markdown string.
 * Returns { briefing, task } from ## Scenario Briefing and ## Your Task.
 */
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

export const scenarioRouter = Router();

// GET /api/scenario
scenarioRouter.get('/', (_req, res) => {
  try {
    const md = readFileSync(SCENARIO_PATH, 'utf8');
    res.json(parseScenario(md));
  } catch (err) {
    res.status(500).json({ error: 'Could not read scenario file: ' + err.message });
  }
});
