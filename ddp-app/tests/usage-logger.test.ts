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
