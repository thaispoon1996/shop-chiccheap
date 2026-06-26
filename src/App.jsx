import React, { useState } from 'react'
import { Layout } from './components/Layout'
import { DashboardPage } from './pages/DashboardPage'
import { OrdersPage } from './pages/OrdersPage'
import { FinancePage } from './pages/FinancePage'
import { useToast } from './components/common/Toast'
import { exportToCSV, importFromCSV } from './utils/exportImport'

export default function App() {
  const [page, setPage] = useState('dashboard')
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

  const pageProps = { toast, setPage }

  return (
    <>
      <Layout page={page} setPage={setPage}>
        {page === 'dashboard' && <DashboardPage {...pageProps} />}
        {page === 'orders' && <OrdersPage {...pageProps} />}
        {page === 'finance' && <FinancePage {...pageProps} />}
      </Layout>

      {/* Export/Import floating actions */}
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
          onClick={exportToCSV}
          title="Xuất dữ liệu CSV"
          style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(255,255,255,0.95)',
            border: '1px solid var(--gray-200)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >⬇</button>
        <label
          title="Nhập dữ liệu CSV"
          style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(255,255,255,0.95)',
            border: '1px solid var(--gray-200)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer'
          }}
        >
          ⬆
          <input type="file" accept=".csv" onChange={handleImport} style={{ display: 'none' }} />
        </label>
      </div>

      <toast.ToastContainer />
    </>
  )
}
