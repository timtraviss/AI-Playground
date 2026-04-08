/**
 * ElevenLabs Conversational AI REST API wrapper.
 * Handles signed URL generation and post-conversation transcript retrieval.
 */

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';

/**
 * Generate a signed WebSocket URL for a private agent conversation.
 * The system prompt is injected as a per-session override so any witness
 * scenario can use the same base agent.
 *
 * @param {string} agentId - ElevenLabs agent ID from dashboard
 * @param {string} apiKey - ElevenLabs API key
 * @param {string} systemPromptOverride - Full witness system prompt
 * @returns {Promise<{ signed_url: string }>}
 */
export async function generateSignedUrl(agentId, apiKey, systemPromptOverride) {
  const response = await fetch(
    `${ELEVENLABS_BASE}/v1/convai/conversation/get_signed_url?agent_id=${encodeURIComponent(agentId)}`,
    {
      method: 'GET',
      headers: {
        'xi-api-key': apiKey,
      },
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ElevenLabs signed URL error ${response.status}: ${body}`);
  }

  const data = await response.json();
  return data; // { signed_url: "wss://..." }
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
    .map((turn, index) => {
      const speaker = turn.role === 'user' ? 'STUDENT' : witnessName.toUpperCase();
      const turnNum = index + 1;
      return `[Turn ${turnNum}] [${speaker}]: ${turn.message}`;
    })
    .join('\n\n');
}
