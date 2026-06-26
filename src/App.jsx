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
  const toast = useToast()

  // Khởi tạo Google auth khi mở app nếu đã có Client ID
  useEffect(() => {
    const id = drive.getClientId()
    if (id) drive.initTokenClient(id).catch(() => {})
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
  const mergeIntoDb = async (localRecords, remoteRecords, table) => {
    const localMap = new Map(localRecords.map(r => [r.createdAt, r]))
    for (const r of remoteRecords) {
      const existing = localMap.get(r.createdAt)
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

  const doSync = useCallback(async () => {
    if (!drive.isSignedIn()) return
    setSyncState('syncing')
    setSyncError('')
    try {
      const [localOrders, localTx] = await Promise.all([
        db.orders.toArray(),
        db.transactions.toArray()
      ])

      const remote = await drive.pull()

      if (remote) {
        await mergeIntoDb(localOrders, remote.orders || [], db.orders)
        await mergeIntoDb(localTx, remote.transactions || [], db.transactions)
      }

      const [finalOrders, finalTx] = await Promise.all([
        db.orders.toArray(),
        db.transactions.toArray()
      ])
      await drive.push(finalOrders, finalTx)

      const now = Date.now()
      drive.setLastSync(now)
      setLastSyncUI(String(now))
      setSyncState('done')
      // Thông báo các trang reload dữ liệu
      window.dispatchEvent(new CustomEvent('chiccheap:sync'))
      setTimeout(() => setSyncState('idle'), 2500)
    } catch (err) {
      setSyncError(err.message)
      setSyncState('error')
      if (err.message.includes('hết hạn')) setGSignedIn(false)
    }
  }, [])

  const handleGoogleSignIn = async () => {
    const clientId = drive.getClientId()
    if (!clientId) {
      toast.show('Vui lòng nhập Google Client ID trước', 'error')
      setShowSettings(true)
      return
    }
    setSyncState('syncing')
    try {
      await drive.initTokenClient(clientId)
      await drive.requestToken()
      setGSignedIn(true)
      await doSync()
    } catch (err) {
      setSyncError(err.message)
      setSyncState('error')
    }
  }

  const handleGoogleSignOut = () => {
    drive.signOut()
    setGSignedIn(false)
    setSyncState('idle')
    setSyncError('')
  }

  const syncIcon = syncState === 'syncing' ? '🔄' : syncState === 'done' ? '✅' : syncState === 'error' ? '❌' : '☁️'
  const syncTitle = syncState === 'syncing' ? 'Đang đồng bộ...' : gSignedIn ? 'Đồng bộ Google Drive' : 'Đăng nhập Google Drive'

  const pageProps = { toast, setPage, onNeedApiKey: () => setShowSettings(true) }

  return (
    <>
      <Layout page={page} setPage={setPage}>
        {page === 'dashboard' && <DashboardPage {...pageProps} />}
        {page === 'orders' && <OrdersPage {...pageProps} />}
        {page === 'finance' && <FinancePage {...pageProps} />}
      </Layout>

      {/* Floating action buttons */}
      <div style={{
        position: 'fixed',
        top: 'calc(60px + env(safe-area-inset-top, 0px))',
        right: 16,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        gap: 6
      }}>
        <button onClick={() => setShowSettings(true)} title="Cài đặt" style={fabStyle}>⚙️</button>
        <button
          onClick={gSignedIn ? doSync : handleGoogleSignIn}
          title={syncTitle}
          disabled={syncState === 'syncing'}
          style={{ ...fabStyle, opacity: syncState === 'syncing' ? 0.6 : 1 }}
        >{syncIcon}</button>
        <button onClick={exportToCSV} title="Xuất CSV" style={fabStyle}>⬇</button>
        <label title="Nhập CSV" style={{ ...fabStyle, cursor: 'pointer' }}>
          ⬆
          <input type="file" accept=".csv" onChange={handleImport} style={{ display: 'none' }} />
        </label>
      </div>

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

const fabStyle = {
  width: 36, height: 36, borderRadius: 10,
  background: 'rgba(255,255,255,0.95)',
  border: '1px solid var(--gray-200)',
  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center'
}

function SettingsModal({ onClose, toast, gSignedIn, lastSync, syncState, onSignIn, onSignOut, onSync }) {
  const [groqKey, setGroqKey] = useState(getApiKey())
  const [showKey, setShowKey] = useState(false)
  const [clientId, setClientId] = useState(drive.getClientId())
  const [showClientId, setShowClientId] = useState(false)

  const handleSaveGroq = () => {
    saveApiKey(groqKey)
    toast.show('Đã lưu Groq API key', 'success')
  }

  const handleSaveClientId = async () => {
    drive.saveClientId(clientId)
    if (clientId) await drive.initTokenClient(clientId).catch(() => {})
    toast.show('Đã lưu Google Client ID', 'success')
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
                padding: '12px 14px', marginBottom: 12
              }}>
                <p style={{ fontSize: 13, color: '#166534', fontWeight: 600 }}>✅ Đã kết nối Google Drive</p>
                <p style={{ fontSize: 12, color: '#16a34a', marginTop: 4 }}>
                  Lần đồng bộ cuối: {formatLastSync(lastSync)}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
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
