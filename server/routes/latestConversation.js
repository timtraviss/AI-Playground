import { Router } from 'express';

const router = Router();

function parseConversationTimestampMs(conversation) {
  const candidates = [
    conversation?.created_at,
    conversation?.started_at,
    conversation?.start_time,
    conversation?.timestamp,
  ];

  for (const value of candidates) {
    if (!value) continue;
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return ms;
  }

  if (Number.isFinite(conversation?.created_at_unix_secs)) {
    return Number(conversation.created_at_unix_secs) * 1000;
  }
  if (Number.isFinite(conversation?.started_at_unix_secs)) {
    return Number(conversation.started_at_unix_secs) * 1000;
  }
  return null;
}

// GET /api/latest-conversation
// Fetches the most recent conversation for this agent since the given timestamp.
// Query: ?since=<ISO-8601 timestamp>
router.get('/', async (req, res) => {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const agentId = process.env.ELEVENLABS_AGENT_ID;
    const since = req.query.since;

    if (!apiKey || !agentId) {
      return res.status(503).json({ error: 'ElevenLabs service not configured' });
    }
    if (!since || Number.isNaN(Date.parse(since))) {
      return res.status(400).json({ error: 'Valid ?since=ISO_TIMESTAMP query parameter is required' });
    }
    const sinceMs = Date.parse(since);

    const url = `https://api.elevenlabs.io/v1/convai/conversations?agent_id=${encodeURIComponent(agentId)}&page_size=10`;
    const response = await fetch(url, {
      headers: { 'xi-api-key': apiKey },
    });

    if (!response.ok) {
      const body = await response.text();
      return res.status(502).json({ error: `ElevenLabs error ${response.status}: ${body}` });
    }

    const data = await response.json();
    const conversations = data.conversations || data.items || [];
    const filtered = conversations.filter((c) => {
      const ts = parseConversationTimestampMs(c);
      return ts !== null && ts >= sinceMs;
    });

    if (filtered.length === 0) {
      return res.status(404).json({ error: 'No recent conversations found for this session window' });
    }

    const latest = filtered[0];
    const conversationId = latest.conversation_id || latest.id;

    if (!conversationId) {
      return res.status(502).json({ error: 'Recent conversation is missing an ID from ElevenLabs response' });
    }

    res.json({ conversationId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export { router as latestConversationRouter };
