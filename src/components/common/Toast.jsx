import React, { useEffect, useState } from 'react'

export function Toast({ message, type = 'success', onClose }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false)
      setTimeout(onClose, 300)
    }, 2500)
    return () => clearTimeout(t)
  }, [onClose])

  const colors = {
    success: { bg: '#059669', icon: '✓' },
    error: { bg: '#dc2626', icon: '✕' },
    warning: { bg: '#d97706', icon: '!' }
  }
  const c = colors[type] || colors.success

  return (
    <div style={{
      position: 'fixed',
      bottom: `calc(80px + env(safe-area-inset-bottom, 0px))`,
      left: '50%',
      transform: `translateX(-50%) translateY(${visible ? '0' : '100px'})`,
      background: c.bg,
      color: '#fff',
      padding: '12px 20px',
      borderRadius: 12,
      fontSize: 14,
      fontWeight: 600,
      boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      transition: 'transform 0.3s ease',
      whiteSpace: 'nowrap',
      maxWidth: '90vw'
    }}>
      <span style={{ fontSize: 16 }}>{c.icon}</span>
      {message}
    </div>
  )
}

export function useToast() {
  const [toasts, setToasts] = useState([])

  const show = (message, type = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
  }

  const remove = (id) => setToasts(prev => prev.filter(t => t.id !== id))

  const ToastContainer = () => (
    <>
      {toasts.map(t => (
        <Toast key={t.id} message={t.message} type={t.type} onClose={() => remove(t.id)} />
      ))}
    </>
  )

  return { show, ToastContainer }
}
