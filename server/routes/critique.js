import { Router } from 'express';
import { fetchConversationTranscript, formatTranscriptForCritique } from '../lib/elevenlabs.js';
import { generateCritique } from '../lib/claude.js';
import { loadWitness } from './witness.js';

const router = Router();

// POST /api/critique
// Body: { conversationId: "...", witnessId: "witness-001" }
// Returns: structured critique JSON
router.post('/', async (req, res) => {
  try {
    const { conversationId, witnessId = 'witness-001' } = req.body;

    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId is required' });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'ELEVENLABS_API_KEY not configured' });
    }

    if (!process.env.CLAUDE_API_KEY) {
      return res.status(500).json({ error: 'CLAUDE_API_KEY not configured' });
    }

    // Load witness and fetch transcript in parallel
    const [witness, conversationData] = await Promise.all([
      Promise.resolve(loadWitness(witnessId)),
      fetchConversationTranscript(conversationId, apiKey),
    ]);

    const transcript = conversationData.transcript || conversationData.conversation?.transcript || [];
    const formattedTranscript = formatTranscriptForCritique(transcript, witness.persona.name);

    const critique = await generateCritique(formattedTranscript, witness);

    res.json({
      ...critique,
      conversationId,
      witnessId,
      transcriptLength: transcript.length,
    });
  } catch (err) {
    console.error('Critique route error:', err);
    res.status(500).json({ error: err.message });
  }
});

export { router as critiqueRouter };
