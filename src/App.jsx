import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Layout } from './components/Layout'
import { DashboardPage } from './pages/DashboardPage'
import { OrdersPage } from './pages/OrdersPage'
import { FinancePage } from './pages/FinancePage'
import { useToast } from './components/common/Toast'
import { exportToCSV, importFromCSV } from './utils/exportImport'
import { getApiKey, saveApiKey } from './utils/invoiceOCR'
import * as fb from './utils/firebaseSync'
import { db } from './db/database'

export default function App() {
  const [page, setPage] = useState('dashboard')
  const [showSettings, setShowSettings] = useState(false)
  const [syncState, setSyncState] = useState('idle')
  const [gSignedIn, setGSignedIn] = useState(false)
  const [fbUser, setFbUser] = useState(null)
  const [lastSync, setLastSyncUI] = useState(fb.getLastSync())
  const isSyncing = useRef(false)
  const toast = useToast()
  const toastRef = useRef(toast)
  useEffect(() => { toastRef.current = toast }, [toast])

  const mergeIntoDb = async (localRecords, remoteRecords, table, keyField = 'createdAt') => {
    const localMap = new Map(localRecords.map(r => [r[keyField], r]))
    for (const r of remoteRecords) {
      const key = r[keyField]
      if (!key) continue
      const existing = localMap.get(key)
      if (existing) {
        if ((r.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
          const { id: _id, ...rest } = r
          await table.update(existing.id, rest)
        }
      } else {
        const { id: _id, ...rest } = r
        await table.add(rest)
      }
    }
  }

  // Xử lý dữ liệu từ Firebase real-time listener
  const handleRemoteData = useCallback(async (remote) => {
    if (!remote) return
    // Bỏ qua nếu đây là data chúng ta vừa push (tránh merge thừa)
    if (remote.ts && remote.ts === fb.getLastPushTs()) return
    if (isSyncing.current) return
    isSyncing.current = true
    try {
      const [localOrders, localTx] = await Promise.all([
        db.orders.toArray(), db.transactions.toArray()
      ])
      await mergeIntoDb(localOrders, remote.orders || [], db.orders, 'orderId')
      await mergeIntoDb(localTx, remote.transactions || [], db.transactions, 'createdAt')
      const now = Date.now()
      fb.setLastSync(now)
      setLastSyncUI(String(now))
      window.dispatchEvent(new CustomEvent('chiccheap:sync'))
      console.log(`[FB] Nhận dữ liệu: ${(remote.orders || []).length} đơn`)
    } catch (err) {
      console.error('[FB] Merge lỗi:', err.message)
    } finally {
      isSyncing.current = false
    }
  }, [])

  // Đẩy dữ liệu local lên Firebase
  const pushToCloud = useCallback(async (silent = false) => {
    if (!fb.isSignedIn()) return
    if (isSyncing.current) return
    isSyncing.current = true
    setSyncState('syncing')
    try {
      const [orders, txs] = await Promise.all([
        db.orders.toArray(), db.transactions.toArray()
      ])
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
      const ordersToSync = orders.filter(o => !o.deletedAt || o.deletedAt > cutoff)
      const txToSync = txs.filter(t => !t.deletedAt || t.deletedAt > cutoff)
      await fb.push(ordersToSync, txToSync)
      const activeCount = orders.filter(o => !o.deletedAt).length
      const now = Date.now()
      fb.setLastSync(now)
      setLastSyncUI(String(now))
      setSyncState('done')
      if (!silent) toastRef.current.show(`✅ Đồng bộ xong: ${activeCount} đơn`, 'success')
      setTimeout(() => setSyncState('idle'), 2500)
      console.log(`[FB] Push xong ${new Date(now).toLocaleTimeString()} — ${ordersToSync.length} đơn`)
    } catch (err) {
      setSyncState('error')
      if (!silent) toastRef.current.show('❌ Lỗi sync: ' + err.message, 'error')
      setTimeout(() => setSyncState('idle'), 3000)
    } finally {
      isSyncing.current = false
    }
  }, [])

  // Khởi tạo Firebase và lắng nghe auth state
  useEffect(() => {
    if (!fb.isConfigured()) return
    fb.init().then(() => {
      // onAuthChange tự khôi phục session từ lần trước — không cần đăng nhập lại
      const unsub = fb.onAuthChange((user) => {
        if (user) {
          setFbUser(user)
          setGSignedIn(true)
          // Subscribe real-time — nhận dữ liệu ngay khi thiết bị khác thay đổi
          fb.subscribe(handleRemoteData)
          // Push dữ liệu local lên để các thiết bị khác có thể pull
          pushToCloud(true)
        } else {
          setFbUser(null)
          setGSignedIn(false)
          fb.unsubscribe()
        }
      })
      return unsub
    }).catch(err => console.error('[FB] Init lỗi:', err))
  }, [handleRemoteData, pushToCloud])

  // Đẩy ngay khi có thay đổi dữ liệu local
  useEffect(() => {
    const onDataChanged = () => pushToCloud(true)
    window.addEventListener('chiccheap:push', onDataChanged)
    return () => window.removeEventListener('chiccheap:push', onDataChanged)
  }, [pushToCloud])

  const handleGoogleSignIn = async () => {
    if (!fb.isConfigured()) {
      toast.show('Vui lòng nhập Firebase Config trong Cài đặt trước', 'error')
      setShowSettings(true)
      return
    }
    setSyncState('syncing')
    try {
      await fb.init()
      const user = await fb.signIn()
      setFbUser(user)
      setGSignedIn(true)
      fb.subscribe(handleRemoteData)
      await pushToCloud(false)
    } catch (err) {
      setSyncState('idle')
      if (err.code !== 'auth/popup-closed-by-user') {
        toast.show('❌ Đăng nhập thất bại: ' + err.message, 'error')
      }
    }
  }

  const handleGoogleSignOut = async () => {
    await fb.signOut()
    setFbUser(null)
    setGSignedIn(false)
    setSyncState('idle')
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await importFromCSV(file)
      toast.show('Nhập dữ liệu thành công! Vui lòng tải lại trang.', 'success')
      setTimeout(() => window.location.reload(), 1500)
    } catch (err) {
      toast.show('Lỗi nhập dữ liệu: ' + err.message, 'error')
    }
    e.target.value = ''
  }

  const syncIcon = !gSignedIn ? '🔑' : syncState === 'syncing' ? '🔄' : syncState === 'done' ? '✅' : '☁️'
  const lastSyncText = lastSync ? `Sync lần cuối: ${new Date(Number(lastSync)).toLocaleTimeString('vi-VN')}` : 'Chưa đồng bộ'
  const syncTitle = syncState === 'syncing' ? 'Đang đồng bộ...' : gSignedIn ? lastSyncText : 'Đăng nhập để đồng bộ'

  const pageProps = { toast, setPage, onNeedApiKey: () => setShowSettings(true) }

  const headerActions = (
    <>
      <button
        onClick={gSignedIn ? () => pushToCloud(false) : handleGoogleSignIn}
        title={syncTitle}
        disabled={syncState === 'syncing'}
        style={{ ...headerBtnStyle, opacity: syncState === 'syncing' ? 0.6 : 1 }}
      >{syncIcon}</button>
      <button onClick={exportToCSV} title="Xuất CSV" style={headerBtnStyle}>⬇</button>
      <label title="Nhập CSV" style={{ ...headerBtnStyle, cursor: 'pointer' }}>
        ⬆
        <input type="file" accept=".csv" onChange={handleImport} style={{ display: 'none' }} />
      </label>
      <button onClick={() => setShowSettings(true)} title="Cài đặt" style={headerBtnStyle}>⚙️</button>
    </>
  )

  return (
    <>
      <Layout page={page} setPage={setPage} headerActions={headerActions}>
        {page === 'dashboard' && <DashboardPage {...pageProps} />}
        {page === 'orders' && <OrdersPage {...pageProps} />}
        {page === 'finance' && <FinancePage {...pageProps} />}
      </Layout>

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          toast={toast}
          gSignedIn={gSignedIn}
          fbUser={fbUser}
          lastSync={lastSync}
          syncState={syncState}
          onSignIn={handleGoogleSignIn}
          onSignOut={handleGoogleSignOut}
          onSync={() => pushToCloud(false)}
        />
      )}

      <toast.ToastContainer />
    </>
  )
}

const headerBtnStyle = {
  width: 34, height: 34, borderRadius: 8,
  background: 'rgba(255,255,255,0.18)',
  border: '1px solid rgba(255,255,255,0.25)',
  color: '#fff',
  fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0
}

function SettingsModal({ onClose, toast, gSignedIn, fbUser, lastSync, syncState, onSignIn, onSignOut, onSync }) {
  const [groqKey, setGroqKey] = useState(getApiKey())
  const [showKey, setShowKey] = useState(false)
  const [fbConfigStr, setFbConfigStr] = useState(() => {
    const c = fb.getConfig()
    return c ? JSON.stringify(c, null, 2) : ''
  })
  const [overwriting, setOverwriting] = useState(false)

  const handleSaveGroq = () => {
    saveApiKey(groqKey)
    toast.show('Đã lưu Groq API key', 'success')
  }

  const handleSaveFbConfig = () => {
    try {
      const config = JSON.parse(fbConfigStr)
      if (!config.apiKey || !config.databaseURL) {
        toast.show('Config thiếu apiKey hoặc databaseURL', 'error')
        return
      }
      fb.saveConfig(config)
      toast.show('Đã lưu Firebase Config — tải lại trang để áp dụng', 'success')
    } catch {
      toast.show('JSON không hợp lệ, kiểm tra lại', 'error')
    }
  }

  const handleOverwrite = async () => {
    if (!window.confirm('Ghi đè cloud bằng dữ liệu thiết bị này?')) return
    setOverwriting(true)
    try {
      const [orders, txs] = await Promise.all([db.orders.toArray(), db.transactions.toArray()])
      const activeOrders = orders.filter(o => !o.deletedAt)
      const activeTxs = txs.filter(t => !t.deletedAt)
      await fb.push(activeOrders, activeTxs)
      toast.show(`✅ Đã ghi đè: ${activeOrders.length} đơn, ${activeTxs.length} giao dịch`, 'success')
    } catch (err) {
      toast.show('❌ Lỗi: ' + err.message, 'error')
    } finally {
      setOverwriting(false)
    }
  }

  const formatLastSync = (ts) => {
    if (!ts) return 'Chưa đồng bộ'
    return new Date(Number(ts)).toLocaleString('vi-VN')
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
    }} onClick={onClose}>
      <div
        style={{
          background: '#fff', borderRadius: '20px 20px 0 0',
          padding: 24, width: '100%', maxWidth: 480,
          maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.2)'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: 36, height: 4, background: 'var(--gray-200)', borderRadius: 2, margin: '0 auto 20px' }} />

        {/* Groq AI */}
        <Section title="📷 Quét hóa đơn AI (Groq)">
          <p style={descStyle}>Miễn phí. Đăng ký tại <strong>console.groq.com</strong> → API Keys → Create</p>
          <div style={{ position: 'relative' }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={groqKey}
              onChange={e => setGroqKey(e.target.value)}
              placeholder="gsk_..."
              style={inputStyle}
            />
            <button onClick={() => setShowKey(s => !s)} style={eyeBtn}>{showKey ? '🙈' : '👁️'}</button>
          </div>
          <button onClick={handleSaveGroq} style={saveBtn}>Lưu</button>
        </Section>

        <div style={{ height: 1, background: 'var(--gray-100)', margin: '20px 0' }} />

        {/* Firebase Sync */}
        <Section title="☁️ Đồng bộ Firebase">
          {gSignedIn ? (
            <div>
              <div style={{
                background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10,
                padding: '12px 14px', marginBottom: 10
              }}>
                <p style={{ fontSize: 13, color: '#166534', fontWeight: 600 }}>✅ Đã kết nối Firebase</p>
                {fbUser && <p style={{ fontSize: 12, color: '#16a34a', marginTop: 2 }}>{fbUser.email}</p>}
                <p style={{ fontSize: 12, color: '#16a34a', marginTop: 2 }}>
                  Lần đồng bộ cuối: {formatLastSync(lastSync)}
                </p>
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button
                  onClick={onSync}
                  disabled={syncState === 'syncing'}
                  style={{
                    flex: 2, padding: '11px', borderRadius: 10, fontWeight: 700, fontSize: 14,
                    background: syncState === 'syncing' ? 'var(--gray-300)' : 'var(--primary)',
                    color: '#fff'
                  }}
                >
                  {syncState === 'syncing' ? '🔄 Đang đồng bộ...' : '🔄 Đồng bộ ngay'}
                </button>
                <button
                  onClick={onSignOut}
                  style={{
                    flex: 1, padding: '11px', borderRadius: 10, fontWeight: 600, fontSize: 13,
                    background: 'var(--gray-100)', color: 'var(--gray-600)'
                  }}
                >Đăng xuất</button>
              </div>
              <button
                onClick={handleOverwrite}
                disabled={overwriting}
                style={{
                  width: '100%', padding: '9px', borderRadius: 10,
                  border: '1.5px solid #fca5a5', background: '#fff',
                  color: '#dc2626', fontWeight: 600, fontSize: 12
                }}
              >
                {overwriting ? '⏳ Đang ghi...' : '⚠️ Ghi đè cloud bằng dữ liệu thiết bị này'}
              </button>
            </div>
          ) : (
            <div>
              <p style={descStyle}>
                Lưu dữ liệu lên Firebase để đồng bộ real-time giữa các thiết bị.{' '}
                <strong>Không bị lỗi token</strong> như Google Drive.
              </p>

              {/* Firebase Config */}
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-600)', display: 'block', marginBottom: 6 }}>
                Firebase Config (JSON):
              </label>
              <textarea
                value={fbConfigStr}
                onChange={e => setFbConfigStr(e.target.value)}
                placeholder={'{\n  "apiKey": "...",\n  "authDomain": "...",\n  "databaseURL": "...",\n  "projectId": "..."\n}'}
                rows={6}
                style={{
                  ...inputStyle, resize: 'vertical', fontFamily: 'monospace',
                  fontSize: 11, lineHeight: 1.5, marginBottom: 10
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <button onClick={handleSaveFbConfig} style={{ ...saveBtn, flex: 1 }}>Lưu Config</button>
                <button
                  onClick={onSignIn}
                  disabled={!fb.isConfigured() || syncState === 'syncing'}
                  style={{
                    flex: 2, padding: '10px', borderRadius: 10, fontWeight: 700, fontSize: 14,
                    background: fb.isConfigured() ? '#4285f4' : 'var(--gray-300)', color: '#fff'
                  }}
                >
                  {syncState === 'syncing' ? '⏳ Đang kết nối...' : '🔑 Đăng nhập Google'}
                </button>
              </div>
              <button
                onClick={onSignOut}
                style={{
                  width: '100%', padding: '9px', borderRadius: 10, marginBottom: 14,
                  border: '1.5px solid var(--gray-200)', background: 'var(--gray-50)',
                  color: 'var(--gray-500)', fontWeight: 600, fontSize: 12
                }}
              >Đăng xuất / Xóa phiên cũ</button>
              <FirebaseSetupGuide />
            </div>
          )}
        </Section>

        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '13px', borderRadius: 12, marginTop: 20,
            background: 'var(--gray-100)', color: 'var(--gray-700)', fontWeight: 600, fontSize: 15
          }}
        >Đóng</button>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 12 }}>{title}</h3>
      {children}
    </div>
  )
}

function FirebaseSetupGuide() {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginTop: 4 }}>
      <button onClick={() => setOpen(o => !o)} style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 600 }}>
        {open ? '▲' : '▼'} Hướng dẫn tạo Firebase project
      </button>
      {open && (
        <ol style={{ fontSize: 12, color: 'var(--gray-600)', lineHeight: 1.8, marginTop: 8, paddingLeft: 16 }}>
          <li>Vào <strong>console.firebase.google.com</strong> → Tạo project mới</li>
          <li>Vào <strong>Authentication</strong> → Sign-in method → bật <strong>Google</strong></li>
          <li>Vào <strong>Realtime Database</strong> → Create database → chọn vùng → Start in <strong>test mode</strong></li>
          <li>Vào <strong>Project settings</strong> → Your apps → Add app → Web → đặt tên → Register</li>
          <li>Copy config object (dạng JSON) và dán vào ô trên</li>
          <li>Thêm domain Vercel vào <strong>Authentication → Settings → Authorized domains</strong></li>
        </ol>
      )}
    </div>
  )
}

const descStyle = { fontSize: 13, color: 'var(--gray-500)', marginBottom: 10, lineHeight: 1.5 }
const inputStyle = {
  width: '100%', padding: '11px 42px 11px 12px', borderRadius: 10,
  border: '1.5px solid var(--gray-200)', fontSize: 13,
  color: 'var(--gray-800)', marginBottom: 10
}
const eyeBtn = {
  position: 'absolute', right: 10, top: '40%', transform: 'translateY(-50%)',
  fontSize: 16, color: 'var(--gray-400)'
}
const saveBtn = {
  padding: '9px 18px', borderRadius: 10, fontWeight: 600, fontSize: 13,
  background: 'var(--gray-100)', color: 'var(--gray-700)', marginBottom: 4
}
