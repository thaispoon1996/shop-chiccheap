import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Layout } from './components/Layout'
import { DashboardPage } from './pages/DashboardPage'
import { OrdersPage } from './pages/OrdersPage'
import { FinancePage } from './pages/FinancePage'
import { useToast } from './components/common/Toast'
import { exportToCSV, importFromCSV } from './utils/exportImport'
import { getApiKey, saveApiKey } from './utils/invoiceOCR'
import * as drive from './utils/driveSync'
import { db } from './db/database'

export default function App() {
  const [page, setPage] = useState('dashboard')
  const [showSettings, setShowSettings] = useState(false)
  const [syncState, setSyncState] = useState('idle') // idle | syncing | done | error
  const [syncError, setSyncError] = useState('')
  const [gSignedIn, setGSignedIn] = useState(false)
  const [lastSync, setLastSyncUI] = useState(drive.getLastSync())
  const syncTimerRef = useRef(null)
  const isSyncing = useRef(false)
  const toast = useToast()

  // Khởi tạo token client ngay khi load (để khi user tap 🔑, popup mở đồng bộ)
  // Nếu đã từng đăng nhập: thử silent re-auth
  useEffect(() => {
    const id = drive.getClientId()
    if (!id) return
    drive.initTokenClient(id).then(() => {
      const wasSignedIn = localStorage.getItem('google_was_signed_in') === 'true'
      if (!wasSignedIn) return
      // Silent re-auth — thường thất bại trên iOS Safari, không sao, giữ flag
      return drive.requestToken(true)
        .then(() => { setGSignedIn(true); doSync() })
        .catch(() => { setGSignedIn(false) })
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // Merge dữ liệu remote vào IndexedDB
  // keyField: 'orderId' cho orders (stable across devices), 'createdAt' cho transactions
  const mergeIntoDb = async (localRecords, remoteRecords, table, keyField = 'createdAt') => {
    const localMap = new Map(localRecords.map(r => [r[keyField], r]))
    for (const r of remoteRecords) {
      const key = r[keyField]
      if (!key) continue // bỏ qua record không có key
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

  const toastRef = useRef(toast)
  useEffect(() => { toastRef.current = toast }, [toast])

  const doSync = useCallback(async (silent = false) => {
    if (!drive.isSignedIn()) return
    if (isSyncing.current) return
    isSyncing.current = true
    setSyncState('syncing')
    setSyncError('')
    try {
      const [localOrders, localTx] = await Promise.all([
        db.orders.toArray(),
        db.transactions.toArray()
      ])

      if (!silent) toastRef.current.show('☁️ Đang kéo dữ liệu từ Drive...', 'info')
      const remote = await drive.pull()

      if (remote) {
        const remoteOrders = remote.orders || []
        const remoteTx = remote.transactions || []
        if (!silent) {
          const activeRemote = remoteOrders.filter(o => !o.deletedAt).length
          toastRef.current.show(`📥 Drive: ${remoteOrders.length} đơn (${activeRemote} hoạt động), đang merge...`, 'info')
        }
        await mergeIntoDb(localOrders, remoteOrders, db.orders, 'orderId')
        await mergeIntoDb(localTx, remoteTx, db.transactions, 'createdAt')
      }

      const [finalOrders, finalTx] = await Promise.all([
        db.orders.toArray(),
        db.transactions.toArray()
      ])
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
      const ordersToSync = finalOrders.filter(o => !o.deletedAt || o.deletedAt > cutoff)
      const txToSync = finalTx.filter(t => !t.deletedAt || t.deletedAt > cutoff)
      await drive.push(ordersToSync, txToSync)

      const activeCount = finalOrders.filter(o => !o.deletedAt).length
      const now = Date.now()
      drive.setLastSync(now)
      setLastSyncUI(String(now))
      setSyncState('done')
      window.dispatchEvent(new CustomEvent('chiccheap:sync'))
      console.log(`[Sync] Push xong ${new Date(now).toLocaleTimeString()} — ${ordersToSync.length} đơn lên Drive`)
      if (!silent) toastRef.current.show(`✅ Đồng bộ xong: ${activeCount} đơn hàng`, 'success')
      setTimeout(() => setSyncState('idle'), 2500)
    } catch (err) {
      if (err.message.includes('hết hạn')) {
        // Token hết hạn: đổi icon thành 🔑 để user biết cần đăng nhập lại
        // KHÔNG xóa google_was_signed_in — giữ để lần sau mở app tự thử lại
        setGSignedIn(false)
        setSyncState('idle')
        if (!silent) toastRef.current.show('🔑 Phiên đăng nhập hết hạn, nhấn nút 🔑 để đăng nhập lại', 'error')
      } else {
        setSyncError(err.message)
        setSyncState('error')
        if (!silent) toastRef.current.show('❌ Lỗi sync: ' + err.message, 'error')
      }
    } finally {
      isSyncing.current = false
    }
  }, [])

  // Pull nhẹ từ Drive — không spinner, không toast, chỉ merge + refresh UI
  const backgroundPull = useCallback(async () => {
    if (isSyncing.current) return
    // Nếu token hết hạn, thử re-auth silent trước
    if (!drive.isSignedIn()) {
      const clientId = drive.getClientId()
      const wasSignedIn = localStorage.getItem('google_was_signed_in') === 'true'
      if (!clientId || !wasSignedIn) return
      try {
        await drive.initTokenClient(clientId)
        await drive.requestToken(true)
        setGSignedIn(true)
        console.log('[Sync] Re-auth silent thành công')
      } catch {
        console.warn('[Sync] Re-auth silent thất bại, bỏ qua pull lần này')
        return
      }
    }
    isSyncing.current = true
    try {
      const [localOrders, localTx] = await Promise.all([
        db.orders.toArray(),
        db.transactions.toArray()
      ])
      const remote = await drive.pull()
      if (!remote) { console.log('[Sync] Drive chưa có dữ liệu'); return }

      const prevCount = localOrders.filter(o => !o.deletedAt).length
      await mergeIntoDb(localOrders, remote.orders || [], db.orders, 'orderId')
      await mergeIntoDb(localTx, remote.transactions || [], db.transactions, 'createdAt')

      const afterOrders = await db.orders.filter(o => !o.deletedAt).toArray()
      const afterCount = afterOrders.length
      const now = Date.now()
      drive.setLastSync(now)
      setLastSyncUI(String(now))
      window.dispatchEvent(new CustomEvent('chiccheap:sync'))
      console.log(`[Sync] Pull xong ${new Date(now).toLocaleTimeString()} — Drive: ${(remote.orders||[]).length} đơn, local trước: ${prevCount}, sau: ${afterCount}`)
    } catch (err) {
      // Background pull thất bại: im lặng, không ảnh hưởng UI
      // Nếu hết hạn token, đổi icon 🔑 nhưng giữ google_was_signed_in để lần sau auto-retry
      if (err.message?.includes('hết hạn')) {
        setGSignedIn(false)
      }
      console.error('[Sync] backgroundPull lỗi:', err.message)
    } finally {
      isSyncing.current = false
    }
  }, [])

  // Kéo ngay khi user mở lại app
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') backgroundPull()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [backgroundPull])

  // Kéo định kỳ mỗi 20 giây để thiết bị khác thấy dữ liệu mới
  useEffect(() => {
    const timer = setInterval(backgroundPull, 20 * 1000)
    return () => clearInterval(timer)
  }, [backgroundPull])

  // Đẩy ngay lên Drive khi có thay đổi dữ liệu cục bộ
  useEffect(() => {
    const onDataChanged = () => {
      if (drive.isSignedIn()) doSync(true)
    }
    window.addEventListener('chiccheap:push', onDataChanged)
    return () => window.removeEventListener('chiccheap:push', onDataChanged)
  }, [doSync])

  const handleGoogleSignIn = () => {
    const clientId = drive.getClientId()
    if (!clientId) {
      toast.show('Vui lòng nhập Google Client ID trước', 'error')
      setShowSettings(true)
      return
    }
    setSyncState('syncing')

    const onAuthSuccess = () => {
      setGSignedIn(true)
      localStorage.setItem('google_was_signed_in', 'true')
      drive.fetchAndCacheUserEmail()
      doSync()
    }
    const onAuthFail = (err) => {
      setSyncState('idle')
      const msg = err?.message || err?.error || String(err) || 'Thử lại'
      toast.show('❌ Đăng nhập thất bại: ' + msg, 'error')
    }

    if (drive.isClientInitialized()) {
      // Gọi requestToken ĐỒNG BỘ ngay sau user tap — iOS Safari không block popup
      drive.requestToken(false).then(onAuthSuccess).catch(onAuthFail)
    } else {
      // Token client chưa init (lần đầu dùng) — phải async trước
      drive.initTokenClient(clientId)
        .then(() => drive.requestToken(false))
        .then(onAuthSuccess)
        .catch(onAuthFail)
    }
  }

  const handleGoogleSignOut = () => {
    drive.signOut()
    setGSignedIn(false)
    setSyncState('idle')
    setSyncError('')
    localStorage.removeItem('google_was_signed_in')
  }

  const syncIcon = !gSignedIn ? '🔑' : syncState === 'syncing' ? '🔄' : syncState === 'done' ? '✅' : syncState === 'error' ? '❌' : '☁️'
  const lastSyncText = lastSync ? `Sync lần cuối: ${new Date(Number(lastSync)).toLocaleTimeString('vi-VN')}` : 'Chưa đồng bộ'
  const syncTitle = syncState === 'syncing' ? 'Đang đồng bộ...' : gSignedIn ? lastSyncText : 'Nhấn để đăng nhập lại Google Drive'

  const pageProps = { toast, setPage, onNeedApiKey: () => setShowSettings(true) }

  const headerActions = (
    <>
      <button
        onClick={gSignedIn ? doSync : handleGoogleSignIn}
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

      {/* Sync error toast */}
      {syncState === 'error' && syncError && (
        <div style={{
          position: 'fixed', bottom: 90, left: 16, right: 16, zIndex: 100,
          background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10,
          padding: '10px 14px', fontSize: 13, color: '#991b1b'
        }}>
          ❌ {syncError}
          <button onClick={() => setSyncState('idle')} style={{ float: 'right', color: '#991b1b', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          toast={toast}
          gSignedIn={gSignedIn}
          lastSync={lastSync}
          syncState={syncState}
          onSignIn={handleGoogleSignIn}
          onSignOut={handleGoogleSignOut}
          onSync={doSync}
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

function SettingsModal({ onClose, toast, gSignedIn, lastSync, syncState, onSignIn, onSignOut, onSync }) {
  const [groqKey, setGroqKey] = useState(getApiKey())
  const [showKey, setShowKey] = useState(false)
  const [clientId, setClientId] = useState(drive.getClientId())
  const [showClientId, setShowClientId] = useState(false)
  const [driveInfo, setDriveInfo] = useState(null)
  const [checking, setChecking] = useState(false)
  const [overwriting, setOverwriting] = useState(false)

  const handleSaveGroq = () => {
    saveApiKey(groqKey)
    toast.show('Đã lưu Groq API key', 'success')
  }

  const handleSaveClientId = async () => {
    drive.saveClientId(clientId)
    if (clientId) await drive.initTokenClient(clientId).catch(() => {})
    toast.show('Đã lưu Google Client ID', 'success')
  }

  const handleOverwriteDrive = async () => {
    if (!window.confirm('Ghi đè Drive bằng dữ liệu thiết bị này? Dữ liệu trên Drive sẽ bị xóa và thay bằng dữ liệu local.')) return
    setOverwriting(true)
    try {
      const [orders, txs] = await Promise.all([db.orders.toArray(), db.transactions.toArray()])
      const activeOrders = orders.filter(o => !o.deletedAt)
      const activeTxs = txs.filter(t => !t.deletedAt)
      await drive.push(activeOrders, activeTxs)
      toast.show(`✅ Đã ghi đè Drive: ${activeOrders.length} đơn, ${activeTxs.length} giao dịch`, 'success')
      setDriveInfo(null)
    } catch (err) {
      toast.show('❌ Lỗi: ' + err.message, 'error')
    } finally {
      setOverwriting(false)
    }
  }

  const handleCheckDrive = async () => {
    setChecking(true)
    setDriveInfo(null)
    try {
      const remote = await drive.pull()
      if (!remote) {
        setDriveInfo({ empty: true })
      } else {
        const allOrders = remote.orders || []
        const orders = allOrders.filter(o => !o.deletedAt)
        const deletedOrders = allOrders.filter(o => o.deletedAt)
        const transactions = (remote.transactions || []).filter(t => !t.deletedAt)
        setDriveInfo({
          orders: orders.length,
          deletedOrders: deletedOrders.length,
          transactions: transactions.length,
          syncedAt: remote.ts ? new Date(remote.ts).toLocaleString('vi-VN') : null
        })
      }
    } catch (err) {
      setDriveInfo({ error: err.message })
    } finally {
      setChecking(false)
    }
  }

  const formatLastSync = (ts) => {
    if (!ts) return 'Chưa đồng bộ'
    const d = new Date(Number(ts))
    return d.toLocaleString('vi-VN')
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      padding: '0 0 0 0'
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

        {/* === Groq AI Section === */}
        <Section title="📷 Quét hóa đơn AI (Groq)">
          <p style={descStyle}>
            Miễn phí. Đăng ký tại <strong>console.groq.com</strong> → API Keys → Create
          </p>
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

        {/* === Google Drive Section === */}
        <Section title="☁️ Đồng bộ Google Drive">
          {!gSignedIn ? (
            <>
              <p style={descStyle}>
                Lưu dữ liệu lên Google Drive để dùng trên nhiều thiết bị.
                Cần tạo <strong>Google OAuth Client ID</strong> — xem hướng dẫn bên dưới.
              </p>
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <input
                  type={showClientId ? 'text' : 'password'}
                  value={clientId}
                  onChange={e => setClientId(e.target.value)}
                  placeholder="xxxx.apps.googleusercontent.com"
                  style={inputStyle}
                />
                <button onClick={() => setShowClientId(s => !s)} style={eyeBtn}>{showClientId ? '🙈' : '👁️'}</button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <button onClick={handleSaveClientId} style={{ ...saveBtn, flex: 1 }}>Lưu Client ID</button>
                <button
                  onClick={onSignIn}
                  disabled={!clientId || syncState === 'syncing'}
                  style={{
                    flex: 2, padding: '10px', borderRadius: 10, fontWeight: 700, fontSize: 14,
                    background: clientId ? '#4285f4' : 'var(--gray-300)',
                    color: '#fff'
                  }}
                >
                  {syncState === 'syncing' ? '⏳ Đang kết nối...' : '🔑 Đăng nhập Google'}
                </button>
              </div>
              <SetupGuide />
            </>
          ) : (
            <div>
              <div style={{
                background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10,
                padding: '12px 14px', marginBottom: 10
              }}>
                <p style={{ fontSize: 13, color: '#166534', fontWeight: 600 }}>✅ Đã kết nối Google Drive</p>
                <p style={{ fontSize: 12, color: '#16a34a', marginTop: 2 }}>
                  Lần đồng bộ cuối: {formatLastSync(lastSync)}
                </p>
              </div>

              {/* Kiểm tra dữ liệu trên Drive */}
              <button
                onClick={handleCheckDrive}
                disabled={checking}
                style={{
                  width: '100%', padding: '9px', borderRadius: 10, marginBottom: 8,
                  border: '1.5px solid var(--gray-200)', background: '#fff',
                  color: 'var(--gray-700)', fontWeight: 600, fontSize: 13
                }}
              >
                {checking ? '⏳ Đang kiểm tra...' : '🔍 Xem dữ liệu trên Drive'}
              </button>

              {driveInfo && (
                <div style={{
                  background: driveInfo.error ? '#fef2f2' : driveInfo.empty ? '#fafafa' : '#f0f9ff',
                  border: `1px solid ${driveInfo.error ? '#fca5a5' : driveInfo.empty ? 'var(--gray-200)' : '#bae6fd'}`,
                  borderRadius: 10, padding: '12px 14px', marginBottom: 10, fontSize: 13
                }}>
                  {driveInfo.error && <p style={{ color: 'var(--danger)' }}>❌ {driveInfo.error}</p>}
                  {driveInfo.empty && <p style={{ color: 'var(--gray-500)' }}>☁️ Drive chưa có dữ liệu nào.</p>}
                  {driveInfo.orders !== undefined && (
                    <>
                      <p style={{ fontWeight: 700, color: '#0369a1', marginBottom: 6 }}>📦 Dữ liệu trên Drive:</p>
                      <p style={{ color: 'var(--gray-700)' }}>🛍️ Đơn hàng đang hoạt động: <strong>{driveInfo.orders}</strong></p>
                      <p style={{ color: 'var(--gray-700)' }}>🗑️ Đã xóa (ẩn): <strong>{driveInfo.deletedOrders}</strong></p>
                      <p style={{ color: 'var(--gray-700)' }}>💰 Giao dịch: <strong>{driveInfo.transactions}</strong></p>
                      {driveInfo.syncedAt && (
                        <p style={{ color: 'var(--gray-500)', fontSize: 12, marginTop: 4 }}>
                          Đẩy lên lúc: {driveInfo.syncedAt}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

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
                onClick={handleOverwriteDrive}
                disabled={overwriting}
                style={{
                  width: '100%', padding: '9px', borderRadius: 10,
                  border: '1.5px solid #fca5a5', background: '#fff',
                  color: '#dc2626', fontWeight: 600, fontSize: 12
                }}
              >
                {overwriting ? '⏳ Đang ghi...' : '⚠️ Ghi đè Drive bằng dữ liệu thiết bị này'}
              </button>
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

function SetupGuide() {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 600 }}
      >
        {open ? '▲' : '▼'} Hướng dẫn tạo Google Client ID
      </button>
      {open && (
        <ol style={{ fontSize: 12, color: 'var(--gray-600)', lineHeight: 1.8, marginTop: 8, paddingLeft: 16 }}>
          <li>Vào <strong>console.cloud.google.com</strong></li>
          <li>Tạo project mới hoặc chọn project có sẵn</li>
          <li>Vào <strong>APIs & Services → Enable APIs</strong> → tìm <strong>Google Drive API</strong> → Enable</li>
          <li>Vào <strong>APIs & Services → Credentials → Create Credentials → OAuth client ID</strong></li>
          <li>Application type: <strong>Web application</strong></li>
          <li>Authorized JavaScript origins: thêm địa chỉ app của bạn<br/>
            (VD: <code>http://localhost:3000</code> hoặc <code>https://tên-của-bạn.github.io</code>)</li>
          <li>Nhấn Create → copy <strong>Client ID</strong> (dạng <code>xxx.apps.googleusercontent.com</code>)</li>
          <li>Dán vào ô trên và nhấn Lưu</li>
        </ol>
      )}
    </div>
  )
}

const descStyle = { fontSize: 13, color: 'var(--gray-500)', marginBottom: 10, lineHeight: 1.5 }
const inputStyle = {
  width: '100%', padding: '11px 42px 11px 12px', borderRadius: 10,
  border: '1.5px solid var(--gray-200)', fontSize: 13,
  fontFamily: 'monospace', color: 'var(--gray-800)', marginBottom: 10
}
const eyeBtn = {
  position: 'absolute', right: 10, top: '40%', transform: 'translateY(-50%)',
  fontSize: 16, color: 'var(--gray-400)'
}
const saveBtn = {
  padding: '9px 18px', borderRadius: 10, fontWeight: 600, fontSize: 13,
  background: 'var(--gray-100)', color: 'var(--gray-700)', marginBottom: 4
}
