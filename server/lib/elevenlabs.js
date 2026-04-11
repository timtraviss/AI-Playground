/**
 * ElevenLabs Conversational AI REST API wrapper.
 * Handles signed URL generation and post-conversation transcript retrieval.
 */

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';

/**
 * Generate a signed WebSocket URL for a private agent conversation.
 * Tries legacy POST override flow first, then falls back to current GET flow.
 *
 * @param {string} agentId - ElevenLabs agent ID from dashboard
 * @param {string} apiKey - ElevenLabs API key
 * @param {string} systemPromptOverride - Full witness system prompt
 * @returns {Promise<{ signed_url: string }>}
 */
export async function generateSignedUrl(agentId, apiKey, systemPromptOverride) {
  const legacyBody = {
    agent_id: agentId,
    conversation_config_override: {
      agent: {
        prompt: { prompt: systemPromptOverride },
      },
    },
  };

  // Legacy API: supports prompt override via POST JSON body.
  const legacyResponse = await fetch(
    `${ELEVENLABS_BASE}/v1/convai/conversation/get_signed_url`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(legacyBody),
    }
  );

  if (legacyResponse.ok) {
    return legacyResponse.json(); // { signed_url: "wss://..." }
  }

  const legacyErrBody = await legacyResponse.text();
  const fallbackAllowed = legacyResponse.status === 404 || legacyResponse.status === 405;
  if (!fallbackAllowed) {
    throw new Error(`ElevenLabs signed URL error ${legacyResponse.status}: ${legacyErrBody}`);
  }

  // Current API variants: GET endpoint with agent_id query param.
  const candidatePaths = [
    '/v1/convai/conversation/get-signed-url',
    '/v1/convai/conversation/get_signed_url',
  ];

  for (const path of candidatePaths) {
    const url = `${ELEVENLABS_BASE}${path}?agent_id=${encodeURIComponent(agentId)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'xi-api-key': apiKey },
    });

    if (response.ok) {
      return response.json(); // { signed_url: "wss://..." }
    }

    const errBody = await response.text();
    if (response.status !== 404 && response.status !== 405) {
      throw new Error(`ElevenLabs signed URL error ${response.status}: ${errBody}`);
    }
  }

  throw new Error(
    `ElevenLabs signed URL error ${legacyResponse.status}: ${legacyErrBody}`
  );
}

/**
 * Fetch the full conversation transcript after a session ends.
 *
 * @param {string} conversationId
 * @param {string} apiKey
 * @returns {Promise<Object>} Full conversation object with transcript array
 */
export async function fetchConversationTranscript(conversationId, apiKey) {
  const response = await fetch(
    `${ELEVENLABS_BASE}/v1/convai/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: 'GET',
      headers: {
        'xi-api-key': apiKey,
      },
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ElevenLabs transcript fetch error ${response.status}: ${body}`);
  }

  return response.json();
}

/**
 * Format an ElevenLabs transcript array into a readable string for Claude.
 * ElevenLabs transcript items have: { role: "user"|"agent", message: "..." }
 *
 * @param {Array} transcript
 * @param {string} witnessName
 * @returns {string}
 */
export function formatTranscriptForCritique(transcript, witnessName) {
  if (!transcript || transcript.length === 0) {
    return 'No transcript available.';
  }

  return transcript
    .filter(turn => turn.message != null && turn.message.trim() !== '')
    .map((turn, index) => {
      const speaker = turn.role === 'user' ? 'STUDENT' : witnessName.toUpperCase();
      const turnNum = index + 1;
      return `[Turn ${turnNum}] [${speaker}]: ${turn.message}`;
    })
    .join('\n\n');
}
