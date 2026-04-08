import { Router } from 'express';

const router = Router();

// GET /api/latest-conversation
// Fetches the most recently completed conversation for this agent from ElevenLabs.
// Used as a fallback when the widget doesn't emit a conversation ID via events.
router.get('/', async (req, res) => {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const agentId = process.env.ELEVENLABS_AGENT_ID;

    const url = `https://api.elevenlabs.io/v1/convai/conversations?agent_id=${encodeURIComponent(agentId)}&page_size=1`;
    const response = await fetch(url, {
      headers: { 'xi-api-key': apiKey },
    });

    if (!response.ok) {
      const body = await response.text();
      return res.status(502).json({ error: `ElevenLabs error ${response.status}: ${body}` });
    }

    const data = await response.json();
    const conversations = data.conversations || data.items || [];

    if (conversations.length === 0) {
      return res.status(404).json({ error: 'No conversations found for this agent' });
    }

    const latest = conversations[0];
    const conversationId = latest.conversation_id || latest.id;

    res.json({ conversationId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export { router as latestConversationRouter };
