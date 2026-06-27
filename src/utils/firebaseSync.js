import { initializeApp, getApps } from 'firebase/app'
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut as fbSignOut } from 'firebase/auth'
import { getDatabase, ref, set, onValue, off, get } from 'firebase/database'

let _auth = null
let _db = null
let _uid = null
let _realtimeRef = null
let _lastPushTs = 0

export const getConfig = () => {
  try { return JSON.parse(localStorage.getItem('fb_config') || 'null') } catch { return null }
}
export const saveConfig = (cfg) => localStorage.setItem('fb_config', JSON.stringify(cfg))
export const isConfigured = () => { const c = getConfig(); return !!(c?.apiKey && c?.databaseURL) }
export const isSignedIn = () => !!_uid
export const getLastPushTs = () => _lastPushTs
export const getLastSync = () => localStorage.getItem('last_sync_ts') || ''
export const setLastSync = (ts) => localStorage.setItem('last_sync_ts', String(ts))

export async function init() {
  const config = getConfig()
  if (!config?.apiKey) throw new Error('Chưa có Firebase config')
  if (getApps().length === 0) initializeApp(config)
  _auth = getAuth()
  _db = getDatabase()
}

export function onAuthChange(callback) {
  if (!_auth) return () => {}
  return onAuthStateChanged(_auth, (user) => {
    _uid = user?.uid || null
    callback(user)
  })
}

export async function signIn() {
  if (!_auth) await init()
  const provider = new GoogleAuthProvider()
  const result = await signInWithPopup(_auth, provider)
  _uid = result.user.uid
  return result.user
}

export async function signOut() {
  unsubscribe()
  _uid = null
  if (_auth) await fbSignOut(_auth)
}

export async function push(orders, transactions) {
  if (!_uid || !_db) throw new Error('Chưa đăng nhập')
  const ts = Date.now()
  _lastPushTs = ts
  await set(ref(_db, `users/${_uid}/data`), { v: 1, ts, orders, transactions })
}

export async function pull() {
  if (!_uid || !_db) throw new Error('Chưa đăng nhập')
  const snap = await get(ref(_db, `users/${_uid}/data`))
  return snap.val()
}

export function subscribe(callback) {
  if (!_uid || !_db) return
  unsubscribe()
  _realtimeRef = ref(_db, `users/${_uid}/data`)
  onValue(_realtimeRef, (snap) => callback(snap.val()))
}

export function unsubscribe() {
  if (_realtimeRef) { off(_realtimeRef); _realtimeRef = null }
}
