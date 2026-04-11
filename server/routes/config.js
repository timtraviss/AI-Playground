import { Router } from 'express';

export const configRouter = Router();

// GET /api/config — return public client config (keeps API keys server-side)
configRouter.get('/', (req, res) => {
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!agentId) {
    return res.status(503).json({ error: 'ELEVENLABS_AGENT_ID is not configured on the server' });
  }
  res.json({ agentId });
});
