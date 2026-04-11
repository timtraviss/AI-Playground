import { Router } from 'express';

const router = Router();

function parseConversationTimestampMs(conversation) {
  // ElevenLabs list API returns start_time_unix_secs at top level (required field per API docs)
  if (Number.isFinite(conversation?.start_time_unix_secs)) {
    return Number(conversation.start_time_unix_secs) * 1000;
  }

  // String-date fallbacks for any future API variants
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
    console.log(`[latestConversation] ElevenLabs returned ${conversations.length} conversation(s). sinceMs=${sinceMs} (${new Date(sinceMs).toISOString()})`);
    conversations.forEach((c, i) => {
      const ts = parseConversationTimestampMs(c);
      console.log(`  [${i}] id=${c.conversation_id} start_time_unix_secs=${c.start_time_unix_secs} → parsedMs=${ts} (${ts ? new Date(ts).toISOString() : 'null'}) passes=${ts !== null && ts >= sinceMs}`);
    });

    const filtered = conversations
      .filter((c) => {
        const ts = parseConversationTimestampMs(c);
        return ts !== null && ts >= sinceMs;
      })
      .sort((a, b) => {
        // Newest first — don't assume ElevenLabs returns in chronological order
        const tsA = parseConversationTimestampMs(a) ?? 0;
        const tsB = parseConversationTimestampMs(b) ?? 0;
        return tsB - tsA;
      });

    if (filtered.length === 0) {
      // Fallback: accept the most recent conversation within the last 2 hours,
      // in case of clock skew or the call starting just before sessionStartedAt was recorded.
      const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
      const fallbackCutoff = sinceMs - TWO_HOURS_MS;
      const fallback = conversations
        .filter((c) => {
          const ts = parseConversationTimestampMs(c);
          return ts !== null && ts >= fallbackCutoff;
        })
        .sort((a, b) => (parseConversationTimestampMs(b) ?? 0) - (parseConversationTimestampMs(a) ?? 0));

      if (fallback.length > 0) {
        const fb = fallback[0];
        const fbId = fb.conversation_id || fb.id;
        const fbTs = parseConversationTimestampMs(fb);
        console.log(`[latestConversation] strict filter found nothing; using 2h fallback → id=${fbId} ts=${fbTs ? new Date(fbTs).toISOString() : 'null'}`);
        if (fbId) return res.json({ conversationId: fbId });
      }

      return res.status(404).json({
        error: 'No recent conversations found for this session window',
        debug: {
          since: new Date(sinceMs).toISOString(),
          totalConversations: conversations.length,
          conversations: conversations.map(c => ({
            id: c.conversation_id,
            start_time_unix_secs: c.start_time_unix_secs,
            parsedMs: parseConversationTimestampMs(c),
          })),
        },
      });
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
