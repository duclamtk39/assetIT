import assert from 'node:assert/strict'
import test from 'node:test'
import { api, ApiError } from '../src/services/api-client'

test('401 from an authenticated API request emits the session-expired event', async () => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  const browserWindow = new EventTarget()
  let expired = 0
  browserWindow.addEventListener('assetflow:session-expired', () => expired++)
  Object.defineProperty(globalThis, 'window', { value: browserWindow, configurable: true, writable: true })
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: 'expired' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  try {
    await assert.rejects(
      () => api.get('/incidents'),
      (error: unknown) => error instanceof ApiError && error.status === 401,
    )
    assert.equal(expired, 1)
  } finally {
    globalThis.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true, writable: true })
  }
})

test('failed login does not emit a session-expired event', async () => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  const browserWindow = new EventTarget()
  let expired = 0
  browserWindow.addEventListener('assetflow:session-expired', () => expired++)
  Object.defineProperty(globalThis, 'window', { value: browserWindow, configurable: true, writable: true })
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: 'invalid credentials' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  try {
    await assert.rejects(() => api.post('/auth/login', { username: 'user', password: 'wrong' }), ApiError)
    assert.equal(expired, 0)
  } finally {
    globalThis.fetch = originalFetch
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true, writable: true })
  }
})
