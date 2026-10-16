import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rememberDesktopState, desktopCallbackUrl, tabStorage } from './desktopLoginState.js'

const STATE = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN-_0' // 43 base64url chars
const SESSION = { token: 'tok en', refreshToken: 'ref&resh', email: 'a+b@x.com', name: 'Zoë Ann' }

function fakeStorage() {
  const map = new Map()
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map }
}

// The link exactly as DesktopCallback.jsx built it before this change (old apps read these four).
function todaysUrl({ token, refreshToken, email, name }) {
  return `batchmyphotos://auth/callback?token=${encodeURIComponent(token)}&refresh_token=${encodeURIComponent(refreshToken)}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`
}

test('a valid state from the login URL is remembered', () => {
  const storage = fakeStorage()
  rememberDesktopState(`?desktop=true&state=${STATE}`, storage)
  assert.equal(storage.getItem('bmp_desktop_state'), STATE)
})

test('a missing, empty, short or non-base64url state is not remembered', () => {
  for (const search of [
    '?desktop=true',
    '?desktop=true&state=',
    `?desktop=true&state=${STATE.slice(1)}`,
    `?desktop=true&state=${STATE.slice(1)}/`,
    `?desktop=true&state=${STATE.slice(1)}%2B`,
  ]) {
    const storage = fakeStorage()
    rememberDesktopState(search, storage)
    assert.equal(storage.map.size, 0, search)
  }
})

test('with nothing stored the link is exactly today\'s link', () => {
  assert.equal(desktopCallbackUrl(SESSION, fakeStorage()), todaysUrl(SESSION))
})

test('with a valid stored state the link carries it back', () => {
  const storage = fakeStorage()
  storage.setItem('bmp_desktop_state', STATE)
  assert.equal(desktopCallbackUrl(SESSION, storage), `${todaysUrl(SESSION)}&state=${STATE}`)
})

test('a stored value that is not 43 base64url characters is ignored', () => {
  for (const bad of [STATE.slice(1), `${STATE}x`, `${STATE.slice(1)}/`, '<script>']) {
    const storage = fakeStorage()
    storage.setItem('bmp_desktop_state', bad)
    assert.equal(desktopCallbackUrl(SESSION, storage), todaysUrl(SESSION), bad)
  }
})

test('when the browser blocks storage the old link still works', () => {
  globalThis.window = { get sessionStorage() { throw new Error('SecurityError') } }
  try {
    const storage = tabStorage()
    rememberDesktopState(`?desktop=true&state=${STATE}`, storage)
    assert.equal(desktopCallbackUrl(SESSION, storage), todaysUrl(SESSION))
  } finally {
    delete globalThis.window
  }
})

test('the tab storage carries the state from login to the app link', () => {
  const storage = fakeStorage()
  globalThis.window = { sessionStorage: storage }
  try {
    assert.equal(tabStorage(), storage)
    rememberDesktopState(`?desktop=true&state=${STATE}`, tabStorage())
    assert.equal(desktopCallbackUrl(SESSION, tabStorage()), `${todaysUrl(SESSION)}&state=${STATE}`)
  } finally {
    delete globalThis.window
  }
})
