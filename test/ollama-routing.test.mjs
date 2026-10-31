import test from 'node:test'
import assert from 'node:assert/strict'
import { primaryModel, routeModel } from '../bridge/ollama.mjs'

const models = (names) => names.map((name) => ({ name }))

test('prefers an installed Qwen 14B model for the primary role', () => {
  assert.equal(primaryModel(models(['llama3.1:8b', 'qwen2.5:14b-instruct-q4_K_M'])), 'qwen2.5:14b-instruct-q4_K_M')
})

test('uses the configured default only when it is installed', () => {
  const installed = models(['qwen2.5:14b', 'llama3.1:8b'])
  assert.equal(primaryModel(installed, 'llama3.1:8b'), 'llama3.1:8b')
  assert.equal(primaryModel(installed, 'missing:latest'), 'qwen2.5:14b')
})

test('routes coding prompts to an installed coding specialist', () => {
  const result = routeModel('Help me debug this Python function', models(['qwen2.5:14b', 'qwen2.5-coder:7b']), 'qwen2.5:14b')
  assert.equal(result.role, 'coding')
  assert.equal(result.model, 'qwen2.5-coder:7b')
  assert.equal(result.fallback, false)
})

test('falls back to the primary model when a specialist is unavailable', () => {
  const result = routeModel('Explain this screenshot', models(['qwen2.5:14b']), 'qwen2.5:14b')
  assert.equal(result.role, 'vision')
  assert.equal(result.model, 'qwen2.5:14b')
  assert.equal(result.fallback, true)
})

test('manual model selection is honored only for installed models', () => {
  assert.equal(routeModel('Explain this', models(['qwen2.5:14b']), 'qwen2.5:14b', 'qwen2.5:14b').model, 'qwen2.5:14b')
  assert.equal(routeModel('Explain this', models(['qwen2.5:14b']), 'qwen2.5:14b', 'missing:latest').model, 'qwen2.5:14b')
})

test('manual specialist mode falls back when no specialist is installed', () => {
  const result = routeModel('What time is it?', models(['qwen2.5:14b']), 'qwen2.5:14b', '', 'reason')
  assert.equal(result.role, 'reasoning')
  assert.equal(result.fallback, true)
})
