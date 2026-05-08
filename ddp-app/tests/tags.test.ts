import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTags } from '../src/lib/export.js'

test('parseTags: valid JSON array', () => {
  assert.deepEqual(parseTags('["exam","DDP"]'), ['exam', 'DDP'])
})

test('parseTags: empty array', () => {
  assert.deepEqual(parseTags('[]'), [])
})

test('parseTags: legacy single string (fallback)', () => {
  assert.deepEqual(parseTags('exam'), ['exam'])
})

test('parseTags: empty string', () => {
  assert.deepEqual(parseTags(''), [])
})
