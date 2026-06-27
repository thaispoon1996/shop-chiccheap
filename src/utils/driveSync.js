const FILE_NAME = 'chiccheap-sync.json'
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata'

export const getClientId = () => localStorage.getItem('google_client_id') || ''
export const saveClientId = (id) => localStorage.setItem('google_client_id', id.trim())
export const getLastSync = () => localStorage.getItem('last_sync_ts') || ''
export const setLastSync = (ts) => localStorage.setItem('last_sync_ts', String(ts))

let _token = null
let _expiry = 0
let _fileId = null
let _tokenClient = null
let _refreshTimer = null

export const isSignedIn = () => !!_token && Date.now() < _expiry
export const isClientInitialized = () => !!_tokenClient

function loadGIS() {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src*="gsi/client"]')
    if (existing) {
      const poll = setInterval(() => {
        if (window.google?.accounts?.oauth2) { clearInterval(poll); resolve() }
      }, 100)
      return
    }
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.onload = resolve
    s.onerror = () => reject(new Error('Không tải được Google SDK'))
    document.head.appendChild(s)
  })
}

export async function initTokenClient(clientId) {
  await loadGIS()
  _tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: () => {}
  })
}

function scheduleRefresh(expiresIn) {
  if (_refreshTimer) clearTimeout(_refreshTimer)
  // Refresh 5 phút trước khi hết hạn; expiresIn tính bằng giây
  const delay = Math.max(0, (expiresIn - 300) * 1000)
  if (delay > 0) {
    _refreshTimer = setTimeout(() => {
      requestToken(true).catch(() => {
        console.warn('[Auth] Auto-refresh token thất bại')
      })
    }, delay)
  }
}

export function requestToken(silent = false) {
  return new Promise((resolve, reject) => {
    if (!_tokenClient) { reject(new Error('Chưa khởi tạo. Vui lòng nhập Client ID.')); return }
    _tokenClient.callback = (resp) => {
      if (resp.error) {
        reject(new Error(resp.error === 'access_denied' ? 'Người dùng từ chối quyền truy cập.' : resp.error))
        return
      }
      _token = resp.access_token
      _expiry = Date.now() + (resp.expires_in - 60) * 1000
      _fileId = null
      // Tự gia hạn token 5 phút trước khi hết hạn — không cần đăng nhập lại
      scheduleRefresh(resp.expires_in)
      resolve()
    }
    const hint = localStorage.getItem('google_user_email') || ''
    // prompt: 'select_account' = luôn hiện account picker (đáng tin trên iOS Safari)
    // prompt: 'none' = hoàn toàn silent (dùng cho background refresh)
    _tokenClient.requestAccessToken({
      prompt: silent ? 'none' : 'select_account',
      ...(hint ? { login_hint: hint } : {})
    })
  })
}

// Lưu email người dùng vào localStorage để dùng login_hint cho các lần sau
export async function fetchAndCacheUserEmail() {
  try {
    const res = await apiFetch('https://www.googleapis.com/oauth2/v2/userinfo')
    const info = await res.json()
    if (info.email) localStorage.setItem('google_user_email', info.email)
  } catch {}
}

export function signOut() {
  if (_token) window.google?.accounts?.oauth2?.revoke(_token)
  _token = null
  _expiry = 0
  _fileId = null
  if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null }
  localStorage.removeItem('google_user_email')
}

async function apiFetch(url, opts = {}) {
  if (!isSignedIn()) throw new Error('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)
  try {
    const res = await fetch(url, {
      ...opts,
      signal: controller.signal,
      headers: { Authorization: `Bearer ${_token}`, ...opts.headers }
    })
    if (res.status === 401) { _token = null; throw new Error('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.') }
    return res
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Kết nối Drive timeout, kiểm tra mạng và thử lại.')
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function getFileId() {
  if (_fileId) return _fileId
  const res = await apiFetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D'${FILE_NAME}'&fields=files(id)`
  )
  const { files } = await res.json()
  if (files?.length) { _fileId = files[0].id; return _fileId }
  // Tạo file mới nếu chưa có
  const cr = await apiFetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] })
  })
  const { id } = await cr.json()
  _fileId = id
  return _fileId
}

export async function push(orders, transactions) {
  const id = await getFileId()
  await apiFetch(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ v: 1, ts: Date.now(), orders, transactions })
  })
}

export async function pull() {
  const id = await getFileId()
  const res = await apiFetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`)
  const text = await res.text()
  if (!text || text.length < 5) return null
  try { return JSON.parse(text) } catch { return null }
}

// Merge 2 mảng theo createdAt, record nào updatedAt mới hơn thì thắng
export function mergeByCreatedAt(local, remote) {
  const map = new Map(local.map(r => [r.createdAt, r]))
  for (const r of remote) {
    const ex = map.get(r.createdAt)
    if (!ex || (r.updatedAt ?? 0) > (ex.updatedAt ?? 0)) map.set(r.createdAt, r)
  }
  return [...map.values()]
}
