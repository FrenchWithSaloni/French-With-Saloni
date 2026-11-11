// ── CONFIG ─────────────────────────────────────────
const API = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : window.location.origin

// ── TOKEN HELPERS ──────────────────────────────────
const getToken  = () => localStorage.getItem('fws_token')
const setToken  = (t) => localStorage.setItem('fws_token', t)
const setUser   = (u) => localStorage.setItem('fws_user', JSON.stringify(u))
const getUser   = () => JSON.parse(localStorage.getItem('fws_user') || 'null')
const clearAuth = () => {
  localStorage.removeItem('fws_token')
  localStorage.removeItem('fws_user')
  localStorage.removeItem('fws_refresh')
}

// ── TOAST ──────────────────────────────────────────
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast')
  if (!t) return
  t.textContent = msg
  t.className = `toast ${type} show`
  setTimeout(() => t.classList.remove('show'), 3500)
}

// ── FORMAT HELPERS ─────────────────────────────────
function formatCourse(course) {
  const map = {
    tef:        'TEF Preparation',
    tcf:        'TCF Preparation',
    a1:         'A1 — Complete Beginner',
    a2:         'A2 — Elementary',
    b1:         'B1 — Intermediate',
    b2:         'B2 — Upper Intermediate',
    'clb7-6mo': 'A1-B2 — 6 months',
    'clb7-4mo': 'CLB 7 — 4 months',
    '1on1':     '1-on-1 Private',
  }
  return map[course] || course || '—'
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric'
  })
}

// ── SESSION REFRESH ────────────────────────────────
const getRefreshToken = () => localStorage.getItem('fws_refresh')
const setRefreshToken = (t) => localStorage.setItem('fws_refresh', t)

const _fetch        = window.fetch.bind(window)
const retiredTokens = new Set()
let refreshPromise  = null

// Returns 'ok', 'expired' (log the student out) or 'error' (server unreachable, stay logged in)
function refreshSession() {
  if (refreshPromise) return refreshPromise   // simultaneous requests share one refresh

  refreshPromise = (async () => {
    const rt = getRefreshToken()
    if (!rt) return 'expired'
    try {
      const res = await _fetch(`${API}/auth/refresh`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refreshToken: rt })
      })
      if (res.status === 401 || res.status === 400) return 'expired'
      if (!res.ok) return 'error'

      const data = await res.json()
      retiredTokens.add(getToken())
      setToken(data.accessToken)
      setRefreshToken(data.refreshToken)
      return 'ok'
    } catch {
      return 'error'
    }
  })().finally(() => { refreshPromise = null })

  return refreshPromise
}

window.fetch = async (input, init = {}) => {
  const res  = await _fetch(input, init)
  const sent = init.headers && init.headers.Authorization
  const url  = typeof input === 'string' ? input : (input && input.url) || ''

  if (res.status !== 401 || !sent || !url.startsWith(API)) return res

  const isCurrent = sent === `Bearer ${getToken()}`
  const isRetired = retiredTokens.has(sent.replace('Bearer ', ''))
  if (!isCurrent && !isRetired) return res    // not a student token (e.g. admin panel)

  if (isCurrent) {
    const result = await refreshSession()
    if (result === 'expired') return res        // really expired: caller logs out
    if (result === 'error') {
      return new Response(JSON.stringify({ error: 'Server unreachable' }), {
        status: 503, headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  return _fetch(input, { ...init, headers: { ...init.headers, Authorization: `Bearer ${getToken()}` } })
}