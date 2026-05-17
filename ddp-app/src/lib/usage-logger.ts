import { prisma } from '@/lib/db'

const PRICING: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-opus-4-7': { input: 15.00, output: 75.00, cacheRead: 1.50 },
}

export function computeCost(
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number },
  model: string
): number {
  const rates = PRICING[model]
  if (!rates) {
    console.warn(`[usageLogger] Unknown model "${model}", falling back to claude-opus-4-7 pricing`)
  }
  const r = rates ?? PRICING['claude-opus-4-7']
  return (
    (usage.input_tokens * r.input +
      usage.output_tokens * r.output +
      (usage.cache_read_input_tokens ?? 0) * r.cacheRead) /
    1_000_000
  )
}

export async function logUsage({
  tool,
  usage,
  model,
}: {
  tool: string
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number }
  model: string
}): Promise<void> {
  const cost = computeCost(usage, model)
  try {
    await prisma.$executeRaw`
      INSERT INTO usage_log (user_id, tool, model, input_tokens, output_tokens, cache_read_tokens, cost_usd)
      VALUES (
        NULL,
        ${tool},
        ${model},
        ${usage.input_tokens},
        ${usage.output_tokens},
        ${usage.cache_read_input_tokens ?? 0},
        ${cost}
      )
    `
  } catch (err) {
    console.error('[usageLogger] Failed to log usage:', err instanceof Error ? err.message : err)
  }
}
