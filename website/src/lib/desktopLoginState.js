// The desktop app opens /login?desktop=true&state=<random> and accepts only an app
// link that carries the same state back. The state rides in sessionStorage (one tab)
// from Login to DesktopCallback. Older apps send no state and get the old link.
const KEY = 'bmp_desktop_state'
const STATE_SHAPE = /^[A-Za-z0-9_-]{43}$/

// Reading window.sessionStorage throws when the browser blocks site storage;
// those users still get the old link instead of an error.
export function tabStorage() {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function rememberDesktopState(search, storage) {
  const state = new URLSearchParams(search).get('state')
  if (state && STATE_SHAPE.test(state)) storage?.setItem(KEY, state)
}

export function desktopCallbackUrl({ token, refreshToken, email, name }, storage) {
  const url = `batchmyphotos://auth/callback?token=${encodeURIComponent(token)}&refresh_token=${encodeURIComponent(refreshToken)}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`
  const state = storage?.getItem(KEY)
  return state && STATE_SHAPE.test(state) ? `${url}&state=${state}` : url
}
