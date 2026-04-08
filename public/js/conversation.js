/**
 * ElevenLabs conversation manager.
 * Uses the @elevenlabs/client IIFE bundle served from /elevenlabs-client.js
 * which exposes window.ElevenLabsClient = { Conversation, ... }
 */

export class WitnessConversation {
  constructor({ onTranscriptTurn, onStatusChange, onModeChange, onConversationId }) {
    this.onTranscriptTurn = onTranscriptTurn;
    this.onStatusChange = onStatusChange;
    this.onModeChange = onModeChange;
    this.onConversationId = onConversationId;

    this._session = null;
    this._conversationId = null;
    this._witnessName = 'Witness';
  }

  async start(witnessId = 'witness-catherine') {
    this.onStatusChange('connecting');

    // 1. Get signed URL from our backend
    const sessionRes = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ witnessId }),
    });

    if (!sessionRes.ok) {
      const err = await sessionRes.json().catch(() => ({ error: sessionRes.statusText }));
      throw new Error(`Session error: ${err.error}`);
    }

    const { signedUrl, witnessName } = await sessionRes.json();
    this._witnessName = witnessName;

    // 2. Get the Conversation class from the IIFE bundle
    const Conversation = window.ElevenLabsClient?.Conversation;
    if (!Conversation) {
      throw new Error('ElevenLabs SDK not loaded. Check /elevenlabs-client.js is accessible.');
    }

    console.log('[ElevenLabs] Starting session with signed URL...');

    // 3. Start the session
    this._session = await Conversation.startSession({
      signedUrl,

      onConnect: ({ conversationId }) => {
        console.log('[ElevenLabs] Connected, conversation ID:', conversationId);
        this._conversationId = conversationId;
        this.onConversationId(conversationId);
        this.onStatusChange('live');
      },

      onDisconnect: () => {
        console.log('[ElevenLabs] Disconnected');
        this.onStatusChange('disconnected');
      },

      onError: (message, context) => {
        console.error('[ElevenLabs] Error:', message, context);
      },

      onMessage: ({ source, message }) => {
        console.log(`[ElevenLabs] Message [${source}]:`, message);
        const side = source === 'user' ? 'student' : 'witness';
        this.onTranscriptTurn(side, message);
      },

      onModeChange: ({ mode }) => {
        console.log('[ElevenLabs] Mode:', mode);
        this.onModeChange(mode);
      },
    });

    return { witnessName };
  }

  async end() {
    if (this._session) {
      try {
        await this._session.endSession();
      } catch (e) {
        console.warn('[ElevenLabs] endSession error (may already be closed):', e.message);
      }
      this._session = null;
    }
    return this._conversationId;
  }

  getConversationId() {
    return this._conversationId;
  }

  getWitnessName() {
    return this._witnessName;
  }
}
