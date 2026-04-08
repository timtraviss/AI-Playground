import { Router } from 'express';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = Router();

function loadWitness(id) {
  const safePath = resolve(__dirname, '../data/witnesses', `${id}.json`);
  // Prevent path traversal
  if (!safePath.startsWith(resolve(__dirname, '../data/witnesses'))) {
    throw new Error('Invalid witness ID');
  }
  const raw = readFileSync(safePath, 'utf8');
  return JSON.parse(raw);
}

// GET /api/witness/:id — returns public metadata only (no tiered knowledge)
router.get('/:id', (req, res) => {
  try {
    const witness = loadWitness(req.params.id);
    res.json({
      id: witness.id,
      name: witness.persona.name,
      role: witness.persona.role,
      organization: witness.persona.organization,
      incident: witness.scenario.incident,
      location: witness.scenario.location,
      avatarInitials: witness.publicMetadata.avatarInitials,
      scenarioBlurb: witness.publicMetadata.scenarioBlurb,
      briefingNote: witness.publicMetadata.briefingNote,
    });
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.status(404).json({ error: 'Witness not found' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

export { router as witnessRouter, loadWitness };
