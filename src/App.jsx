import React, { useState } from 'react'
import { Layout } from './components/Layout'
import { DashboardPage } from './pages/DashboardPage'
import { OrdersPage } from './pages/OrdersPage'
import { FinancePage } from './pages/FinancePage'
import { useToast } from './components/common/Toast'
import { exportToCSV, importFromCSV } from './utils/exportImport'
import { getApiKey, saveApiKey } from './utils/invoiceOCR'

export default function App() {
  const [page, setPage] = useState('dashboard')
  const [showSettings, setShowSettings] = useState(false)
  const toast = useToast()

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
        <button
          onClick={() => setShowSettings(true)}
          title="Cài đặt API key"
          style={fabStyle}
        >⚙️</button>
        <button
          onClick={exportToCSV}
          title="Xuất dữ liệu CSV"
          style={fabStyle}
        >⬇</button>
        <label
          title="Nhập dữ liệu CSV"
          style={{ ...fabStyle, cursor: 'pointer' }}
        >
          ⬆
          <input type="file" accept=".csv" onChange={handleImport} style={{ display: 'none' }} />
        </label>
      </div>

      {showSettings && (
        <ApiKeyModal onClose={() => setShowSettings(false)} toast={toast} />
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

function ApiKeyModal({ onClose, toast }) {
  const [key, setKey] = useState(getApiKey())
  const [show, setShow] = useState(false)

  const handleSave = () => {
    saveApiKey(key)
    toast.show('Đã lưu API key', 'success')
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20
    }} onClick={onClose}>
      <div
        style={{
          background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
        }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>⚙️ Cài đặt API key</h3>
        <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 16 }}>
          Cần Groq API key để dùng tính năng quét hóa đơn bằng AI (miễn phí).
          Đăng ký tại <strong>console.groq.com</strong> → Create API Key
        </p>
        <div style={{ position: 'relative' }}>
          <input
            type={show ? 'text' : 'password'}
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder="gsk_..."
            style={{
              width: '100%', padding: '11px 42px 11px 12px', borderRadius: 10,
              border: '1.5px solid var(--gray-200)', fontSize: 14,
              fontFamily: 'monospace', color: 'var(--gray-800)'
            }}
          />
          <button
            onClick={() => setShow(s => !s)}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              fontSize: 16, color: 'var(--gray-400)'
            }}
          >{show ? '🙈' : '👁️'}</button>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '11px', borderRadius: 10,
              background: 'var(--gray-100)', color: 'var(--gray-700)', fontWeight: 600
            }}
          >Huỷ</button>
          <button
            onClick={handleSave}
            style={{
              flex: 2, padding: '11px', borderRadius: 10,
              background: 'var(--primary)', color: '#fff', fontWeight: 700
            }}
          >Lưu</button>
        </div>
      </div>
    </div>
  )
}
