import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildGenerateGraderInfoPrompt } from '../src/lib/prompts/generate-grader-info.js'

test('SA system prompt includes all three SA criteria', () => {
  const { system } = buildGenerateGraderInfoPrompt({ type: 'SA', questionText: 'Q' })
  assert.ok(system.includes('Concept'))
  assert.ok(system.includes('Application'))
  assert.ok(system.includes('Evidential Sufficiency'))
})

test('CL system prompt includes all five CL criteria', () => {
  const { system } = buildGenerateGraderInfoPrompt({ type: 'CL', questionText: 'Q' })
  assert.ok(system.includes('Legislation'))
  assert.ok(system.includes('Core Concepts'))
  assert.ok(system.includes('Case Law'))
  assert.ok(system.includes('Defences'))
  assert.ok(system.includes('Evidential Sufficiency'))
})

test('question text appears in user message', () => {
  const q = 'Explain the elements of robbery under s234'
  const { user } = buildGenerateGraderInfoPrompt({ type: 'SA', questionText: q })
  assert.ok(user.includes(q))
})

test('section text included in user message when provided', () => {
  const { user } = buildGenerateGraderInfoPrompt({
    type: 'SA',
    questionText: 'Q',
    sectionText: 'Section 234 text here',
  })
  assert.ok(user.includes('Section 234 text here'))
})

test('section block absent when sectionText not provided', () => {
  const { user } = buildGenerateGraderInfoPrompt({ type: 'SA', questionText: 'Q' })
  assert.ok(!user.includes('LEGISLATION SECTION'))
})
