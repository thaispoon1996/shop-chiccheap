import React, { useState, useEffect, useRef, useCallback } from 'react'
import { db, ORDER_STATUS_LIST } from '../db/database'
import { formatCurrency, formatDate, isOverdue, isDueSoon, removeAccents } from '../utils/formatters'
import { StatusBadge } from '../components/common/StatusBadge'
import { Modal, ConfirmDialog } from '../components/common/Modal'
import { OrderForm } from '../components/OrderForm'

function highlightText(text, query) {
  if (!query || !text) return text
  const norm = removeAccents(String(text)).toLowerCase()
  const normQ = removeAccents(query).toLowerCase()
  const parts = []
  let last = 0
  let idx = norm.indexOf(normQ)
  while (idx !== -1) {
    if (idx > last) parts.push({ t: String(text).slice(last, idx), hl: false })
    parts.push({ t: String(text).slice(idx, idx + normQ.length), hl: true })
    last = idx + normQ.length
    idx = norm.indexOf(normQ, last)
  }
  if (last < String(text).length) parts.push({ t: String(text).slice(last), hl: false })
  if (parts.length === 0) return text
  return parts.map((p, i) =>
    p.hl
      ? <mark key={i} style={{ background: '#fde047', borderRadius: 2, padding: '0 1px', color: '#713f12' }}>{p.t}</mark>
      : <span key={i}>{p.t}</span>
  )
}

export function OrdersPage({ toast, onNeedApiKey }) {
  const [orders, setOrders] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editOrder, setEditOrder] = useState(null)
  const [deleteOrder, setDeleteOrder] = useState(null)
  const [swipeId, setSwipeId] = useState(null)
  const [sortBy, setSortBy] = useState('returnDate')

  const loadOrders = useCallback(async () => {
    const all = await db.orders.filter(o => !o.deletedAt).toArray()
    setOrders(all)
  }, [])

  useEffect(() => { loadOrders() }, [loadOrders])
  useEffect(() => {
    window.addEventListener('chiccheap:sync', loadOrders)
    return () => window.removeEventListener('chiccheap:sync', loadOrders)
  }, [loadOrders])

  const filtered = orders
    .filter(o => {
      if (statusFilter.length > 0 && !statusFilter.includes(o.status)) return false
      if (dateFrom && o.returnDate < dateFrom) return false
      if (dateTo && o.returnDate > dateTo) return false
      if (!search) return true
      const q = removeAccents(search)
      return (
        removeAccents(o.customerName || '').includes(q) ||
        (o.phone || '').includes(search) ||
        removeAccents(o.notes || '').includes(q) ||
        (o.orderId || '').toLowerCase().includes(search.toLowerCase())
      )
    })
    .sort((a, b) => {
      if (sortBy === 'returnDate') return new Date(a.returnDate) - new Date(b.returnDate)
      if (sortBy === 'createdAt') return b.createdAt - a.createdAt
      if (sortBy === 'totalAmount') return b.totalAmount - a.totalAmount
      return 0
    })

  const handleDelete = async () => {
    await db.orders.update(deleteOrder.id, { deletedAt: Date.now() })
    toast.show(`Đã xoá đơn hàng của ${deleteOrder.customerName}`)
    setDeleteOrder(null)
    loadOrders()
    window.dispatchEvent(new CustomEvent('chiccheap:push'))
  }

  const handleSave = () => {
    setShowForm(false)
    setEditOrder(null)
    toast.show(editOrder ? 'Cập nhật đơn hàng thành công' : 'Tạo đơn hàng thành công')
    loadOrders()
    window.dispatchEvent(new CustomEvent('chiccheap:push'))
  }

  const toggleStatus = (s) => {
    setStatusFilter(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    )
  }

  const hasDateFilter = dateFrom || dateTo

  return (
    <div style={{ minHeight: '100%', background: 'var(--gray-50)' }}>
      {/* Search + Filter bar */}
      <div style={{
        background: '#fff',
        padding: '12px 16px',
        borderBottom: '1px solid var(--gray-200)',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        {/* Search */}
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--gray-400)' }}>🔍</span>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm tên, SĐT, ghi chú..."
            style={{
              width: '100%', padding: '10px 12px 10px 38px',
              borderRadius: 10, border: '1.5px solid var(--gray-200)',
              background: 'var(--gray-50)', fontSize: 14
            }}
          />
        </div>

        {/* Date range filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--gray-500)', flexShrink: 0 }}>📅 Ngày trả:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            style={{
              flex: 1, padding: '6px 8px', borderRadius: 8, fontSize: 12,
              border: `1.5px solid ${dateFrom ? 'var(--primary)' : 'var(--gray-200)'}`,
              color: 'var(--gray-700)'
            }}
          />
          <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>→</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            style={{
              flex: 1, padding: '6px 8px', borderRadius: 8, fontSize: 12,
              border: `1.5px solid ${dateTo ? 'var(--primary)' : 'var(--gray-200)'}`,
              color: 'var(--gray-700)'
            }}
          />
          {hasDateFilter && (
            <button
              onClick={() => { setDateFrom(''); setDateTo('') }}
              style={{ fontSize: 16, color: 'var(--gray-400)', flexShrink: 0 }}
            >✕</button>
          )}
        </div>

        {/* Status filter chips */}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, overflowX: 'auto', paddingBottom: 2 }}>
          {ORDER_STATUS_LIST.map((s, i) => (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              style={{
                padding: '5px 12px',
                borderRadius: 20,
                border: `1.5px solid ${statusFilter.includes(s) ? 'var(--primary)' : 'var(--gray-200)'}`,
                background: statusFilter.includes(s) ? 'var(--primary-light)' : '#fff',
                color: statusFilter.includes(s) ? 'var(--primary)' : 'var(--gray-600)',
                fontSize: 12, fontWeight: 600,
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
            >{i + 1}. {s}</button>
          ))}
        </div>

        {/* Sort */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--gray-500)', flexShrink: 0 }}>Sắp xếp:</span>
          {[
            { key: 'returnDate', label: 'Ngày trả' },
            { key: 'createdAt', label: 'Mới nhất' },
            { key: 'totalAmount', label: 'Tiền' }
          ].map(s => (
            <button key={s.key} onClick={() => setSortBy(s.key)} style={{
              padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
              border: '1px solid var(--gray-200)',
              background: sortBy === s.key ? 'var(--primary)' : 'var(--gray-100)',
              color: sortBy === s.key ? '#fff' : 'var(--gray-600)'
            }}>{s.label}</button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--gray-400)' }}>{filtered.length} đơn</span>
        </div>
      </div>

      {/* Order cards */}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 80 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--gray-400)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Không có đơn hàng nào</div>
            <div style={{ fontSize: 13 }}>{search || statusFilter.length > 0 || hasDateFilter ? 'Thử thay đổi bộ lọc' : 'Nhấn + để tạo đơn hàng đầu tiên'}</div>
          </div>
        ) : filtered.map(order => (
          <OrderCard
            key={order.id}
            order={order}
            query={search}
            active={swipeId === order.id}
            onSwipe={id => setSwipeId(swipeId === id ? null : id)}
            onEdit={() => { setEditOrder(order); setShowForm(true) }}
            onDelete={() => setDeleteOrder(order)}
          />
        ))}
      </div>

      {/* FAB */}
      <button
        onClick={() => { setEditOrder(null); setShowForm(true) }}
        style={{
          position: 'fixed',
          bottom: `calc(72px + env(safe-area-inset-bottom, 0px))`,
          right: 20,
          width: 56, height: 56, borderRadius: '50%',
          background: 'var(--primary)',
          color: '#fff', fontSize: 28,
          boxShadow: '0 4px 16px rgba(124,58,237,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 20
        }}
      >+</button>

      {showForm && (
        <Modal
          title={editOrder ? 'Chỉnh sửa đơn hàng' : 'Tạo đơn hàng mới'}
          onClose={() => { setShowForm(false); setEditOrder(null) }}
        >
          <OrderForm
            order={editOrder}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditOrder(null) }}
            onNeedApiKey={onNeedApiKey}
          />
        </Modal>
      )}

      {deleteOrder && (
        <ConfirmDialog
          message={`Bạn có chắc muốn xoá đơn hàng của "${deleteOrder.customerName}"?`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteOrder(null)}
        />
      )}
    </div>
  )
}

const SWIPE_OPEN = -140
const SWIPE_THRESHOLD = 50

function OrderCard({ order, query, active, onSwipe, onEdit, onDelete }) {
  const overdue = isOverdue(order.returnDate, order.status)
  const dueSoon = isDueSoon(order.returnDate, order.status)
  const cardRef = useRef(null)
  const touchStartX = useRef(null)
  const touchStartY = useRef(null)
  const dragging = useRef(false)

  // Sync position when active changes externally (e.g. another card opened)
  useEffect(() => {
    if (!cardRef.current) return
    cardRef.current.style.transition = 'transform 0.25s ease'
    cardRef.current.style.transform = `translateX(${active ? SWIPE_OPEN : 0}px)`
  }, [active])

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    dragging.current = false
    if (cardRef.current) cardRef.current.style.transition = 'none'
  }

  const handleTouchMove = (e) => {
    if (touchStartX.current === null) return
    const dx = e.touches[0].clientX - touchStartX.current
    const dy = e.touches[0].clientY - touchStartY.current
    // Ignore predominantly vertical scrolls
    if (!dragging.current && Math.abs(dy) > Math.abs(dx)) return
    if (Math.abs(dx) > 8) {
      dragging.current = true
      e.preventDefault()
    }
    const base = active ? SWIPE_OPEN : 0
    const clamped = Math.max(SWIPE_OPEN, Math.min(0, base + dx))
    if (cardRef.current) {
      cardRef.current.style.transform = `translateX(${clamped}px)`
    }
  }

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (cardRef.current) cardRef.current.style.transition = 'transform 0.25s ease'

    let shouldOpen = active
    if (dx < -SWIPE_THRESHOLD) shouldOpen = true
    if (dx > SWIPE_THRESHOLD) shouldOpen = false

    if (shouldOpen !== active) {
      onSwipe(order.id) // useEffect will animate to final position
    } else {
      // Snap back to committed state
      if (cardRef.current) {
        cardRef.current.style.transform = `translateX(${active ? SWIPE_OPEN : 0}px)`
      }
    }
    touchStartX.current = null
    touchStartY.current = null
  }

  const handleClick = () => {
    // Tap on open card closes it; tap on closed card does nothing (use swipe)
    if (!dragging.current && active) onSwipe(order.id)
    dragging.current = false
  }

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 14 }}>
      {/* Action buttons revealed by swipe */}
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0,
        display: 'flex', alignItems: 'center', gap: 8, paddingRight: 8,
        background: 'var(--gray-100)'
      }}>
        <button onClick={onEdit} style={{
          width: 60, height: 60, borderRadius: 12,
          background: 'var(--primary)', color: '#fff',
          fontSize: 13, fontWeight: 600, display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2
        }}>
          <span>✏️</span>Sửa
        </button>
        <button onClick={onDelete} style={{
          width: 60, height: 60, borderRadius: 12,
          background: 'var(--danger)', color: '#fff',
          fontSize: 13, fontWeight: 600, display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2
        }}>
          <span>🗑</span>Xoá
        </button>
      </div>

      {/* Card */}
      <div
        ref={cardRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
        style={{
          background: '#fff',
          borderRadius: 14,
          padding: '14px 16px',
          border: `1.5px solid ${overdue ? '#fca5a5' : dueSoon ? '#fcd34d' : 'var(--gray-200)'}`,
          transform: active ? `translateX(${SWIPE_OPEN}px)` : 'translateX(0)',
          transition: 'transform 0.25s ease',
          cursor: 'default',
          position: 'relative',
          zIndex: 1,
          userSelect: 'none',
          WebkitUserSelect: 'none'
        }}
      >
        {(overdue || dueSoon) && (
          <div style={{
            padding: '5px 10px', borderRadius: 8,
            background: overdue ? '#fee2e2' : '#fef3c7',
            color: overdue ? 'var(--danger)' : 'var(--warning)',
            fontSize: 12, fontWeight: 600, marginBottom: 10
          }}>
            {overdue ? '⚠️ Quá hạn trả!' : '⏰ Sắp đến hạn trả (trong 24h)'}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--gray-900)' }}>{highlightText(order.customerName, query)}</span>
              <StatusBadge status={order.status} />
            </div>
            <a href={`tel:${order.phone}`} onClick={e => e.stopPropagation()} style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 600 }}>
              📞 {highlightText(order.phone, query)}
            </a>
            <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
              {formatDate(order.rentDate)} → {formatDate(order.returnDate)}
            </div>
            {order.notes && (
              <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4, lineHeight: 1.5 }}>
                📝 {highlightText(order.notes, query)}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--primary)' }}>
              {formatCurrency(order.totalAmount)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>
              #{order.orderId}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
