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

export const isSignedIn = () => !!_token && Date.now() < _expiry

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

export function requestToken() {
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
      resolve()
    }
    _tokenClient.requestAccessToken({ prompt: isSignedIn() ? '' : 'consent' })
  })
}

export function signOut() {
  if (_token) window.google?.accounts?.oauth2?.revoke(_token)
  _token = null
  _expiry = 0
  _fileId = null
}

async function apiFetch(url, opts = {}) {
  if (!isSignedIn()) throw new Error('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.')
  const res = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${_token}`, ...opts.headers }
  })
  if (res.status === 401) { _token = null; throw new Error('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.') }
  return res
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
