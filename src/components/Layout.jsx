import React from 'react'

const navItems = [
  { key: 'dashboard', label: 'Tổng quan', icon: DashIcon },
  { key: 'orders', label: 'Đơn hàng', icon: OrderIcon },
  { key: 'finance', label: 'Tài chính', icon: FinanceIcon }
]

export function Layout({ page, setPage, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <header style={{
        background: 'var(--primary)',
        color: '#fff',
        padding: '12px 20px 12px',
        paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        boxShadow: '0 2px 8px rgba(124,58,237,0.3)',
        flexShrink: 0
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'rgba(255,255,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20
        }}>👗</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.3px' }}>ChicCheap</div>
          <div style={{ fontSize: 11, opacity: 0.8 }}>Quản lý cho thuê trang phục</div>
        </div>
      </header>

      {/* Content */}
      <main style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {children}
      </main>

      {/* Bottom Nav */}
      <nav style={{
        background: '#fff',
        borderTop: '1px solid var(--gray-200)',
        display: 'flex',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        boxShadow: '0 -2px 10px rgba(0,0,0,0.08)',
        flexShrink: 0
      }}>
        {navItems.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setPage(key)}
            style={{
              flex: 1,
              padding: '10px 4px 8px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              color: page === key ? 'var(--primary)' : 'var(--gray-400)',
              transition: 'color 0.2s',
              fontSize: 10,
              fontWeight: 600
            }}
          >
            <Icon active={page === key} />
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}

function DashIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="8" height="8" rx="2" fill={active ? 'var(--primary)' : 'var(--gray-400)'} />
      <rect x="13" y="3" width="8" height="8" rx="2" fill={active ? 'var(--primary)' : 'var(--gray-400)'} opacity="0.6" />
      <rect x="3" y="13" width="8" height="8" rx="2" fill={active ? 'var(--primary)' : 'var(--gray-400)'} opacity="0.6" />
      <rect x="13" y="13" width="8" height="8" rx="2" fill={active ? 'var(--primary)' : 'var(--gray-400)'} opacity="0.3" />
    </svg>
  )
}

function OrderIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" stroke={active ? 'var(--primary)' : 'var(--gray-400)'} strokeWidth="2" strokeLinecap="round" />
      <rect x="9" y="3" width="6" height="4" rx="1" fill={active ? 'var(--primary)' : 'var(--gray-400)'} />
      <path d="M9 12h6M9 16h4" stroke={active ? 'var(--primary)' : 'var(--gray-400)'} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function FinanceIcon({ active }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z" stroke={active ? 'var(--primary)' : 'var(--gray-400)'} strokeWidth="2" />
      <path d="M12 6v2m0 8v2M9 9h3a1 1 0 110 2h-2a1 1 0 000 2h3" stroke={active ? 'var(--primary)' : 'var(--gray-400)'} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
