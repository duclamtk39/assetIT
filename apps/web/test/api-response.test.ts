import assert from 'node:assert/strict'
import test from 'node:test'
import { readApiCollection } from '../src/services/api-response'

test('reads paginated user and people responses returned by the API', () => {
  const items = [{ id: 'u1', name: 'Administrator' }]
  assert.deepEqual(readApiCollection({ items }), items)
})

test('reads lookup arrays such as departments', () => {
  const departments = [{ id: 'd1', code: 'IT', name: 'IT' }]
  assert.deepEqual(readApiCollection(departments), departments)
})

test('accepts legacy data envelopes during rolling upgrades', () => {
  const items = [{ id: 'u1' }]
  assert.deepEqual(readApiCollection({ data: { items } }), items)
  assert.deepEqual(readApiCollection({ data: items }), items)
})

test('rejects malformed responses instead of silently hiding departments', () => {
  assert.throws(() => readApiCollection({ data: {} as { items: never[] } }), /does not contain a collection/)
})
