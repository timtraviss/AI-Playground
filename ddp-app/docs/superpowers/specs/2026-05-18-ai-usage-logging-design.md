# AI Usage Logging for DDP App

**Date:** 2026-05-18  
**Status:** Approved

## Goal

Log Anthropic API usage from the DDP app into the existing `public.usage_log` table shared with the parent AI Playground app, so all AI costs are visible in one admin panel without any new UI or infrastructure.

## Background

The parent AI Playground app already maintains a `public.usage_log` table (columns: `id, user_id, tool, model, input_tokens, output_tokens, cache_read_tokens, cost_usd, ts`) and an admin panel that queries it. Both apps share the same Heroku PostgreSQL database via `DATABASE_URL`. The DDP app has no user concept, so `user_id` will always be `NULL`.

## Scope

Log all three Anthropic call sites:

| Route | Tool name pattern |
|---|---|
| `POST /api/generate` | `ddp-generate-{type}` (e.g. `ddp-generate-sa`) |
| `POST /api/mark` | `ddp-mark-{type}` (e.g. `ddp-mark-cl`) |
| `POST /api/questions/[id]/generate-grader-info` | `ddp-grader-info-{type}` (e.g. `ddp-grader-info-sa`) |

Type suffix is lowercased question type: `sa`, `cl`, `mc`, `pr`.

## Design

### 1. New file: `src/lib/usage-logger.ts`

Three exports:

**`PRICING`** — record keyed by model ID with per-million-token rates:

```ts
const PRICING: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-opus-4-7': { input: 15.00, output: 75.00, cacheRead: 1.50 },
}
```

**`computeCost(usage, model)`** — pure function. Multiplies token counts by rates and divides by 1,000,000. Falls back to Opus pricing for unknown models with a console warning.

**`logUsage({ tool, usage, model })`** — async function. Uses `prisma.$executeRaw` to insert into `public.usage_log`. `user_id` is always `NULL`. Catches all errors and logs them with `console.error` — a failed log write must never surface to the caller.

```ts
export async function logUsage({
  tool,
  usage,
  model,
}: {
  tool: string
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number }
  model: string
}): Promise<void>
```

### 2. Route changes

**`/api/generate/route.ts`**

After the `for await (const event of stream)` loop completes, call `stream.finalMessage()` to retrieve token counts, then fire-and-forget `logUsage`:

```ts
const finalMsg = await stream.finalMessage()
logUsage({ tool: `ddp-generate-${type.toLowerCase()}`, usage: finalMsg.usage, model: 'claude-opus-4-7' }).catch(console.error)
```

This goes inside the `ReadableStream` `start` callback, after enqueueing `[DONE]` and before `controller.close()`.

**`/api/mark/route.ts`**

After the `anthropic.messages.create(...)` call, `msg.usage` is already available. Add immediately after the existing `rawJson` extraction:

```ts
logUsage({ tool: `ddp-mark-${question.type.toLowerCase()}`, usage: msg.usage, model: 'claude-opus-4-7' }).catch(console.error)
```

**`/api/questions/[id]/generate-grader-info/route.ts`**

Same pattern as mark. After `anthropic.messages.create(...)`:

```ts
logUsage({ tool: `ddp-grader-info-${question.type.toLowerCase()}`, usage: message.usage, model: 'claude-opus-4-7' }).catch(console.error)
```

## Data flow

```
Route handler
  → Anthropic API call (stream or blocking)
  → Extract usage (stream.finalMessage() or msg.usage)
  → logUsage(...).catch(console.error)   ← non-blocking, never throws
      → computeCost(usage, model)
      → prisma.$executeRaw INSERT INTO usage_log ...
```

## Error handling

- Failed log writes are swallowed with `console.error` — they never affect the response.
- Unknown model names fall back to Opus pricing with a warning.
- If `DATABASE_URL` is unset (local dev without DB), `prisma.$executeRaw` will throw, which is caught by the `.catch(console.error)` at the call site.

## Out of scope

- No new UI — usage is visible in the existing parent app admin panel.
- No user attribution — `user_id` is always `NULL`.
- No bulk mark route changes beyond what is listed above (bulk mark calls `/api/mark` per question, so it is covered automatically).
