import { Router } from 'express';
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateSignedUrl } from '../lib/elevenlabs.js';
import { buildPrompt } from '../lib/promptBuilder.js';
import { loadWitness } from './witness.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');
const router = Router();

// POST /api/session
// Body: { witnessId: "witness-catherine" }
// Returns: { signedUrl, agentId, witnessName, witnessId, scenario, voiceId, systemPrompt }
router.post('/', async (req, res) => {
  try {
    const { witnessId = 'witness-catherine' } = req.body;

    const witness = loadWitness(witnessId);
    let systemPrompt = buildPrompt(witness);

    // Optional witness-specific reference notes from a markdown file.
    const refFile = witness.referenceMarkdownFile;
    if (typeof refFile === 'string' && refFile.trim()) {
      const refPath = resolve(projectRoot, refFile);
      if (existsSync(refPath)) {
        const notes = readFileSync(refPath, 'utf8').trim();
        if (notes) {
          systemPrompt = `${systemPrompt}\n\n## Supplemental Witness Notes\n${notes}`;
        }
      }
    }

    const agentId = process.env.ELEVENLABS_AGENT_ID;
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = witness.voiceId || process.env.ELEVENLABS_WITNESS_VOICE_ID || null;

    if (!agentId || !apiKey) {
      return res.status(500).json({ error: 'ElevenLabs credentials not configured. Set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID in .env' });
    }

    const { signed_url } = await generateSignedUrl(agentId, apiKey, systemPrompt);

    res.json({
      signedUrl: signed_url,
      agentId,
      witnessName: witness.persona.name,
      witnessId: witness.id,
      scenario: witness.scenario.incident,
      voiceId,
      systemPrompt, // returned so the client can pass it back at critique time if needed
    });
  } catch (err) {
    console.error('Session route error:', err);
    res.status(500).json({ error: err.message });
  }
});

export { router as sessionRouter };
