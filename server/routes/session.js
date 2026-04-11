import { Router } from 'express';
import { generateSignedUrl } from '../lib/elevenlabs.js';
import { buildPrompt } from '../lib/promptBuilder.js';
import { loadWitness } from './witness.js';

const router = Router();

// POST /api/session
// Body: { witnessId: "witness-catherine" }
// Returns: { signedUrl, witnessName, witnessId, scenario, systemPrompt }
router.post('/', async (req, res) => {
  try {
    const { witnessId = 'witness-catherine' } = req.body;

    const witness = loadWitness(witnessId);
    const systemPrompt = buildPrompt(witness);

    const agentId = process.env.ELEVENLABS_AGENT_ID;
    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!agentId || !apiKey) {
      return res.status(500).json({ error: 'ElevenLabs credentials not configured. Set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID in .env' });
    }

    const { signed_url } = await generateSignedUrl(agentId, apiKey, systemPrompt);

    res.json({
      signedUrl: signed_url,
      witnessName: witness.persona.name,
      witnessId: witness.id,
      scenario: witness.scenario.incident,
      systemPrompt, // returned so the client can pass it back at critique time if needed
    });
  } catch (err) {
    console.error('Session route error:', err);
    res.status(500).json({ error: err.message });
  }
});

export { router as sessionRouter };
