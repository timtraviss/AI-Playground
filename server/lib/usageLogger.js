import { getPool } from './db.js';

const PRICING = {
  'claude-sonnet-4-6':       { input: 3.00,  output: 15.00, cacheRead: 0.30 },
  'claude-haiku-4-5-20251001': { input: 0.80,  output:  4.00, cacheRead: 0.08 },
  'claude-opus-4-7':         { input: 15.00, output: 75.00, cacheRead: 1.50 },
};

export function computeCost(usage, model) {
  const rates = PRICING[model];
  if (!rates) {
    console.warn(`[usageLogger] Unknown model "${model}", using Sonnet pricing`);
  }
  const r = rates ?? PRICING['claude-sonnet-4-6'];
  const input     = usage.input_tokens             ?? 0;
  const output    = usage.output_tokens            ?? 0;
  const cacheRead = usage.cache_read_input_tokens  ?? 0;
  return (input * r.input + output * r.output + cacheRead * r.cacheRead) / 1_000_000;
}

export async function logUsage({ userId, tool, usage, model }) {
  if (!process.env.DATABASE_URL) return;
  const cost = computeCost(usage, model);
  try {
    await getPool().query(
      `INSERT INTO usage_log
         (user_id, tool, model, input_tokens, output_tokens, cache_read_tokens, cost_usd)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        userId ?? null,
        tool,
        model,
        usage.input_tokens            ?? 0,
        usage.output_tokens           ?? 0,
        usage.cache_read_input_tokens ?? 0,
        cost,
      ]
    );
  } catch (err) {
    console.error('[usageLogger] Failed to log usage:', err.message);
  }
}
