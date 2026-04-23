import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCost } from '../server/lib/usageLogger.js';

test('computeCost: sonnet — no cache', () => {
  // input: 1000 * 3.00 / 1e6 = 0.003
  // output: 500 * 15.00 / 1e6 = 0.0075
  const cost = computeCost(
    { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0 },
    'claude-sonnet-4-6'
  );
  assert.ok(Math.abs(cost - 0.0105) < 1e-9, `expected 0.0105, got ${cost}`);
});

test('computeCost: sonnet — with cache read', () => {
  // input: 500 * 3.00 / 1e6 = 0.0015
  // output: 200 * 15.00 / 1e6 = 0.003
  // cache: 40000 * 0.30 / 1e6 = 0.012
  const cost = computeCost(
    { input_tokens: 500, output_tokens: 200, cache_read_input_tokens: 40000 },
    'claude-sonnet-4-6'
  );
  assert.ok(Math.abs(cost - 0.0165) < 1e-9, `expected 0.0165, got ${cost}`);
});

test('computeCost: haiku is cheaper than sonnet for same tokens', () => {
  const usage = { input_tokens: 10000, output_tokens: 2000, cache_read_input_tokens: 0 };
  assert.ok(
    computeCost(usage, 'claude-haiku-4-5-20251001') < computeCost(usage, 'claude-sonnet-4-6')
  );
});

test('computeCost: unknown model falls back to sonnet', () => {
  const cost = computeCost(
    { input_tokens: 1000, output_tokens: 0, cache_read_input_tokens: 0 },
    'claude-unknown-xyz'
  );
  assert.ok(Math.abs(cost - 0.003) < 1e-9);
});

test('computeCost: missing fields default to zero', () => {
  assert.equal(computeCost({}, 'claude-sonnet-4-6'), 0);
});
