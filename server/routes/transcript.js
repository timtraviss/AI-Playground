import { Router } from 'express';
import { fetchConversationTranscript } from '../lib/elevenlabs.js';

export const transcriptRouter = Router();

// GET /api/transcript/:conversationId — fetch transcript from ElevenLabs
transcriptRouter.get('/:conversationId', async (req, res) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'ELEVENLABS_API_KEY is not configured' });
  }

  try {
    const data = await fetchConversationTranscript(req.params.conversationId, apiKey);
    // ElevenLabs may nest the transcript — normalise to a flat array
    const turns = data.transcript || data.conversation?.transcript || [];
    const status = data.status || data.conversation?.status || 'unknown';
    res.json({ conversationId: req.params.conversationId, status, turns });
  } catch (err) {
    console.error('[transcript] fetch error:', err.message);
    res.status(502).json({ error: err.message });
  }
});
