# AI Usage Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log Anthropic API token usage from generate, mark, and grader-info routes into the shared `public.usage_log` PostgreSQL table so all DDP AI costs appear in the parent app's admin panel.

**Architecture:** A single `src/lib/usage-logger.ts` utility exports `computeCost` (pure) and `logUsage` (fire-and-forget via `prisma.$executeRaw`). Each of the three Anthropic call sites imports `logUsage` and calls it after the API response, non-blocking with `.catch(console.error)`. The generate route is streaming, so `stream.finalMessage()` is called after the event loop to retrieve token counts.

**Tech Stack:** Next.js 15 App Router, TypeScript, `@anthropic-ai/sdk`, Prisma (`$executeRaw`), Node.js built-in test runner (`node:test`) via `npx tsx --test`

---

## File Map

| Action | Path |
|--------|------|
| Create | `src/lib/usage-logger.ts` |
| Create | `tests/usage-logger.test.ts` |
| Modify | `src/app/api/generate/route.ts` |
| Modify | `src/app/api/mark/route.ts` |
| Modify | `src/app/api/questions/[id]/generate-grader-info/route.ts` |

---

## Task 1: Create the `usage-logger` utility (TDD)

**Files:**
- Create: `tests/usage-logger.test.ts`
- Create: `src/lib/usage-logger.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/usage-logger.test.ts`:

```typescript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeCost } from '../src/lib/usage-logger.js'

test('computeCost: correct cost for claude-opus-4-7', () => {
  // input: 1000 * 15.00 / 1e6 = 0.015
  // output: 500 * 75.00 / 1e6 = 0.0375
  // cache:  200 * 1.50 / 1e6 = 0.0003
  // total: 0.0528
  const cost = computeCost(
    { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 200 },
    'claude-opus-4-7'
  )
  assert.ok(Math.abs(cost - 0.0528) < 1e-10, `expected 0.0528, got ${cost}`)
})

test('computeCost: zero tokens yields zero cost', () => {
  const cost = computeCost({ input_tokens: 0, output_tokens: 0 }, 'claude-opus-4-7')
  assert.strictEqual(cost, 0)
})

test('computeCost: missing cache_read_input_tokens defaults to 0', () => {
  const withZero = computeCost(
    { input_tokens: 1000, output_tokens: 0, cache_read_input_tokens: 0 },
    'claude-opus-4-7'
  )
  const withAbsent = computeCost({ input_tokens: 1000, output_tokens: 0 }, 'claude-opus-4-7')
  assert.strictEqual(withZero, withAbsent)
})

test('computeCost: unknown model falls back to opus pricing without throwing', () => {
  const cost = computeCost({ input_tokens: 1000, output_tokens: 1000 }, 'unknown-model')
  assert.ok(typeof cost === 'number')
  assert.ok(cost > 0)
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd "/Users/timothytraviss/Library/CloudStorage/Dropbox/Claude Code/AI Playground/ddp-app"
npx tsx --test tests/usage-logger.test.ts
```

Expected: error `Cannot find module '../src/lib/usage-logger.js'` or similar.

- [ ] **Step 3: Implement `src/lib/usage-logger.ts`**

Create `src/lib/usage-logger.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx tsx --test tests/usage-logger.test.ts
```

Expected output:
```
TAP version 13
ok 1 - computeCost: correct cost for claude-opus-4-7
ok 2 - computeCost: zero tokens yields zero cost
ok 3 - computeCost: missing cache_read_input_tokens defaults to 0
ok 4 - computeCost: unknown model falls back to opus pricing without throwing
# tests 4
# pass 4
# fail 0
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/usage-logger.ts tests/usage-logger.test.ts
git commit -m "feat: add usage-logger utility (computeCost + logUsage)"
```

---

## Task 2: Add usage logging to the generate route

**Files:**
- Modify: `src/app/api/generate/route.ts`

The generate route uses `anthropic.messages.stream()` with a `for await` loop inside a `ReadableStream` callback. After the loop, the SDK makes `stream.finalMessage()` available — this resolves immediately (the data is already buffered) and returns the full message including `usage`. We call `logUsage` fire-and-forget before closing the controller.

- [ ] **Step 1: Add the import and the logUsage call**

Open `src/app/api/generate/route.ts`. Make two changes:

**Change 1** — add import at the top (after existing imports):

```typescript
import { logUsage } from '@/lib/usage-logger'
```

**Change 2** — inside the `ReadableStream` `start` callback, after the `for await` loop and after `controller.enqueue(enc.encode('data: [DONE]\n\n'))`, add:

```typescript
        const finalMsg = await stream.finalMessage()
        logUsage({
          tool: `ddp-generate-${type.toLowerCase()}`,
          usage: finalMsg.usage,
          model: 'claude-opus-4-7',
        }).catch(console.error)
```

The full `start` callback should look like this after the change:

```typescript
    async start(controller) {
      const enc = new TextEncoder()
      controller.enqueue(enc.encode(': ping\n\n'))
      try {
        const stream = anthropic.messages.stream({
          model: 'claude-opus-4-7',
          max_tokens: 2048,
          system: prompt.system,
          messages: [{ role: 'user', content: prompt.user }],
        })

        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            controller.enqueue(
              enc.encode(`data: ${JSON.stringify({ delta: event.delta.text })}\n\n`)
            )
          }
        }

        controller.enqueue(enc.encode('data: [DONE]\n\n'))

        const finalMsg = await stream.finalMessage()
        logUsage({
          tool: `ddp-generate-${type.toLowerCase()}`,
          usage: finalMsg.usage,
          model: 'claude-opus-4-7',
        }).catch(console.error)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: msg })}\n\n`))
      } finally {
        controller.close()
      }
    },
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/timothytraviss/Library/CloudStorage/Dropbox/Claude Code/AI Playground/ddp-app"
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/generate/route.ts
git commit -m "feat: log usage after generate streaming call"
```

---

## Task 3: Add usage logging to the mark route

**Files:**
- Modify: `src/app/api/mark/route.ts`

The mark route uses `anthropic.messages.create()` (non-streaming). The response object `msg` already has `msg.usage`. We add `logUsage` fire-and-forget inside the try block after `rawJson` is extracted.

- [ ] **Step 1: Add the import**

Open `src/app/api/mark/route.ts`. Add after existing imports:

```typescript
import { logUsage } from '@/lib/usage-logger'
```

- [ ] **Step 2: Add the logUsage call inside the try block**

Inside the `try` block, after the line `rawJson = rawJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')`, add:

```typescript
    logUsage({
      tool: `ddp-mark-${question.type.toLowerCase()}`,
      usage: msg.usage,
      model: 'claude-opus-4-7',
    }).catch(console.error)
```

The try block should look like this after the change:

```typescript
  let rawJson: string
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 2048,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
    })
    const block = msg.content[0]
    if (block.type !== 'text') throw new Error('Unexpected response type from LLM')
    rawJson = block.text.trim()
    rawJson = rawJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    logUsage({
      tool: `ddp-mark-${question.type.toLowerCase()}`,
      usage: msg.usage,
      model: 'claude-opus-4-7',
    }).catch(console.error)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: msg }), { status: 502, headers: { 'Content-Type': 'application/json' } })
  }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/mark/route.ts
git commit -m "feat: log usage after mark API call"
```

---

## Task 4: Add usage logging to the grader-info route

**Files:**
- Modify: `src/app/api/questions/[id]/generate-grader-info/route.ts`

Same pattern as the mark route — non-streaming `messages.create`, `message.usage` available on the response.

- [ ] **Step 1: Add the import**

Open `src/app/api/questions/[id]/generate-grader-info/route.ts`. Add after existing imports:

```typescript
import { logUsage } from '@/lib/usage-logger'
```

- [ ] **Step 2: Add the logUsage call after messages.create**

After the line `const message = await anthropic.messages.create({...})`, add:

```typescript
  logUsage({
    tool: `ddp-grader-info-${question.type.toLowerCase()}`,
    usage: message.usage,
    model: 'claude-opus-4-7',
  }).catch(console.error)
```

The relevant section should look like this after the change:

```typescript
  const message = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: user }],
  })

  logUsage({
    tool: `ddp-grader-info-${question.type.toLowerCase()}`,
    usage: message.usage,
    model: 'claude-opus-4-7',
  }).catch(console.error)

  const graderInfo =
    message.content[0].type === 'text' ? message.content[0].text.trim() : ''
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run all tests to confirm nothing regressed**

```bash
npx tsx --test tests/usage-logger.test.ts tests/tags.test.ts tests/generate-grader-info.test.ts
```

Expected: all tests pass, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/questions/[id]/generate-grader-info/route.ts
git commit -m "feat: log usage after grader-info API call"
```

---

## Verification (manual)

After all tasks are complete:

1. Start the dev server: `npm run dev`
2. Generate one question of any type via the UI
3. In `psql` or Heroku data explorer, check the row was inserted:
   ```sql
   SELECT * FROM usage_log ORDER BY ts DESC LIMIT 5;
   ```
   Expected: a row with `tool` like `ddp-generate-sa`, `user_id = NULL`, non-zero token counts and `cost_usd`.
4. Repeat for a mark run and a grader-info generation to verify all three call sites log correctly.
