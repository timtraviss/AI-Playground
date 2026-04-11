/**
 * Unit tests for computeTargetKbps.
 *
 * Run with:  npm test
 * Requires:  Node.js >= 22 (uses built-in node:test runner, no extra deps)
 *
 * These tests cover the pure computation function and do NOT require ffmpeg
 * or any external dependencies to be present.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTargetKbps } from '../server/lib/converter.js';

// ── Happy-path bitrate planning ───────────────────────────────────────────────

test('short audio (30s) → capped at 192 kbps', () => {
  // 30s is so short that computed kbps >>> 192, so it clamps to max
  assert.equal(computeTargetKbps(30), 192);
});

test('1-hour podcast → 56 kbps', () => {
  // targetBits = 25×1024²×8×0.96 = 201,326,592
  // targetBps  = floor(201326592 / 3600) = 55923
  // kbps       = round(55.923) = 56  →  clamp(56, 32, 192) = 56
  assert.equal(computeTargetKbps(3600), 56);
});

test('30-minute podcast → 112 kbps', () => {
  // targetBps = floor(201326592 / 1800) = 111848  →  round(111.848) = 112
  assert.equal(computeTargetKbps(1800), 112);
});

test('2-hour podcast → clamped to 32 kbps', () => {
  // targetBps = floor(201326592 / 7200) = 27961  →  round(27.961) = 28  →  clamp = 32
  assert.equal(computeTargetKbps(7200), 32);
});

test('4-hour podcast → clamped to 32 kbps', () => {
  // targetBps = floor(201326592 / 14400) = 13978  →  round(13.978) = 14  →  clamp = 32
  assert.equal(computeTargetKbps(4 * 3600), 32);
});

// ── Custom targetMB ───────────────────────────────────────────────────────────

test('custom targetMB=50, 1-hour → 112 kbps', () => {
  // targetBits = 50×1024²×8×0.96 = 402,653,184
  // targetBps  = floor(402653184 / 3600) = 111848  →  round(111.848) = 112
  assert.equal(computeTargetKbps(3600, 50), 112);
});

test('custom targetMB=10, 1-hour → 22 kbps → clamped to 32', () => {
  // targetBits = 10×1024²×8×0.96 = 80,530,637  (approx)
  // Computed will be < 32 → clamp to 32
  assert.equal(computeTargetKbps(3600, 10), 32);
});

// ── Edge cases ────────────────────────────────────────────────────────────────

test('duration=0 → throws Invalid duration', () => {
  assert.throws(() => computeTargetKbps(0), /Invalid duration/);
});

test('negative duration → throws Invalid duration', () => {
  assert.throws(() => computeTargetKbps(-60), /Invalid duration/);
});

test('null duration → throws Invalid duration', () => {
  assert.throws(() => computeTargetKbps(null), /Invalid duration/);
});

test('undefined duration → throws Invalid duration', () => {
  assert.throws(() => computeTargetKbps(undefined), /Invalid duration/);
});

test('NaN duration → throws Invalid duration', () => {
  assert.throws(() => computeTargetKbps(NaN), /Invalid duration/);
});

// ── Output is always an integer in [32, 192] ──────────────────────────────────

test('result is always an integer', () => {
  [30, 300, 1800, 3600, 7200, 14400].forEach((d) => {
    const result = computeTargetKbps(d);
    assert.equal(result, Math.floor(result), `Expected integer for duration ${d}`);
  });
});

test('result is always between 32 and 192', () => {
  [1, 30, 300, 1800, 3600, 7200, 14400, 86400].forEach((d) => {
    const result = computeTargetKbps(d);
    assert.ok(result >= 32, `Expected >= 32 for duration ${d}, got ${result}`);
    assert.ok(result <= 192, `Expected <= 192 for duration ${d}, got ${result}`);
  });
});
