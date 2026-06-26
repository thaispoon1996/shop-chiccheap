import React, { useState, useEffect, useCallback } from 'react'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip } from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'
import { db, ORDER_STATUS, STATUS_COLORS } from '../db/database'
import { formatCurrency, formatDate, isOverdue, isDueSoon } from '../utils/formatters'
import { StatusBadge } from '../components/common/StatusBadge'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip)

const RANGE_OPTIONS = [
  { key: 'today', label: 'Hôm nay' },
  { key: '7d', label: '7 ngày' },
  { key: 'month', label: 'Tháng này' },
  { key: 'year', label: 'Năm này' }
]

export function DashboardPage({ setPage }) {
  const [orders, setOrders] = useState([])
  const [transactions, setTransactions] = useState([])
  const [range, setRange] = useState('month')
  const [refreshKey, setRefreshKey] = useState(0)

  const load = useCallback(async () => {
    const [ords, txs] = await Promise.all([
      db.orders.filter(o => !o.deletedAt).toArray(),
      db.transactions.filter(t => !t.deletedAt).toArray()
    ])
    setOrders(ords)
    setTransactions(txs)
  }, [])

  useEffect(() => { load() }, [load, refreshKey])

  // Pull-to-refresh simulation
  const handleRefresh = () => setRefreshKey(k => k + 1)

  const now = new Date()
  const rangeStart = {
    today: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    '7d': new Date(now.getTime() - 7 * 86400000),
    month: new Date(now.getFullYear(), now.getMonth(), 1),
    year: new Date(now.getFullYear(), 0, 1)
  }[range]

  const inRange = (date) => new Date(date) >= rangeStart

  const rangeTx = transactions.filter(t => inRange(t.date))
  const totalInc = rangeTx.filter(t => t.type === 'Thu').reduce((s, t) => s + t.amount, 0)
  const totalExp = rangeTx.filter(t => t.type === 'Chi').reduce((s, t) => s + t.amount, 0)
  const netRevenue = totalInc - totalExp

  const totalOrders = orders.length
  const activeOrders = orders.filter(o => o.status !== ORDER_STATUS.RETURNED).length
  const overdueOrders = orders.filter(o => isOverdue(o.returnDate, o.status))

  // Status distribution
  const statusCounts = Object.fromEntries(
    [ORDER_STATUS.NEW, ORDER_STATUS.PREPARED, ORDER_STATUS.TAKEN, ORDER_STATUS.RETURNED]
      .map(s => [s, orders.filter(o => o.status === s).length])
  )

  // Daily revenue - last 7 days
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getTime() - (6 - i) * 86400000)
    const dateStr = d.toISOString().slice(0, 10)
    const inc = transactions.filter(t => t.type === 'Thu' && t.date === dateStr).reduce((s, t) => s + t.amount, 0)
    const exp = transactions.filter(t => t.type === 'Chi' && t.date === dateStr).reduce((s, t) => s + t.amount, 0)
    return { label: `${d.getDate()}/${d.getMonth() + 1}`, inc, exp }
  })

  // Monthly revenue - last 12 months
  const last12Months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
    const month = d.toISOString().slice(0, 7)
    const inc = transactions.filter(t => t.type === 'Thu' && t.date.startsWith(month)).reduce((s, t) => s + t.amount, 0)
    return { label: `Th${d.getMonth() + 1}`, inc }
  })

  // Due soon and overdue orders (top 5)
  const urgentOrders = orders
    .filter(o => o.status !== ORDER_STATUS.RETURNED && (isOverdue(o.returnDate, o.status) || isDueSoon(o.returnDate, o.status, 48)))
    .sort((a, b) => new Date(a.returnDate) - new Date(b.returnDate))
    .slice(0, 5)

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { tooltip: { callbacks: { label: ctx => formatCurrency(ctx.raw) } } },
    scales: {
      y: { ticks: { callback: v => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${(v / 1e3).toFixed(0)}K`, font: { size: 10 } } },
      x: { ticks: { font: { size: 10 } } }
    }
  }

  return (
    <div style={{ padding: '12px 16px', paddingBottom: 80 }}>
      {/* Header with range selector */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--gray-900)' }}>Tổng quan</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>{new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
        <button onClick={handleRefresh} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--gray-200)', background: '#fff', fontSize: 13, color: 'var(--gray-600)' }}>⟳ Làm mới</button>
      </div>

      {/* Range tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto' }}>
        {RANGE_OPTIONS.map(opt => (
          <button key={opt.key} onClick={() => setRange(opt.key)} style={{
            padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, flexShrink: 0,
            border: `1.5px solid ${range === opt.key ? 'var(--primary)' : 'var(--gray-200)'}`,
            background: range === opt.key ? 'var(--primary-light)' : '#fff',
            color: range === opt.key ? 'var(--primary)' : 'var(--gray-500)'
          }}>{opt.label}</button>
        ))}
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <SummaryCard icon="💰" label="Doanh thu thuần" value={formatCurrency(netRevenue)} sub={`Thu: ${formatCurrency(totalInc)}`} color="var(--primary)" />
        <SummaryCard icon="📋" label="Tổng đơn hàng" value={totalOrders} sub={`Đang hoạt động: ${activeOrders}`} color="var(--success)" />
        <SummaryCard icon="⏰" label="Đơn quá hạn" value={overdueOrders.length} sub="Cần xử lý ngay" color={overdueOrders.length > 0 ? 'var(--danger)' : 'var(--gray-400)'} />
        <SummaryCard icon="📊" label="Tổng chi" value={formatCurrency(totalExp)} sub={`Thu: ${formatCurrency(totalInc)}`} color="var(--warning)" />
      </div>

      {/* Urgent orders */}
      {urgentOrders.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--gray-700)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            🚨 Cần xử lý ngay ({urgentOrders.length})
          </div>
          {urgentOrders.map(o => (
            <div key={o.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 0',
              borderBottom: '1px solid var(--gray-100)'
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--gray-800)' }}>{o.customerName}</div>
                <div style={{ fontSize: 11, color: isOverdue(o.returnDate, o.status) ? 'var(--danger)' : 'var(--warning)', fontWeight: 600 }}>
                  {isOverdue(o.returnDate, o.status) ? '⚠️ Quá hạn' : '⏰ Sắp hạn'} · Trả: {formatDate(o.returnDate)}
                </div>
              </div>
              <StatusBadge status={o.status} />
            </div>
          ))}
          <button
            onClick={() => setPage('orders')}
            style={{ marginTop: 8, width: '100%', padding: '8px 0', borderRadius: 8, background: 'var(--primary-light)', color: 'var(--primary)', fontSize: 13, fontWeight: 600 }}
          >Xem tất cả đơn hàng →</button>
        </div>
      )}

      {/* Daily chart */}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--gray-700)', marginBottom: 12 }}>Doanh thu 7 ngày gần nhất</div>
        <div style={{ height: 160 }}>
          <Bar
            data={{
              labels: last7Days.map(d => d.label),
              datasets: [
                { label: 'Thu', data: last7Days.map(d => d.inc), backgroundColor: '#059669aa', borderRadius: 4 },
                { label: 'Chi', data: last7Days.map(d => d.exp), backgroundColor: '#dc2626aa', borderRadius: 4 }
              ]
            }}
            options={{ ...chartOptions, plugins: { ...chartOptions.plugins, legend: { display: false } } }}
          />
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 8, justifyContent: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>■ Thu</span>
          <span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600 }}>■ Chi</span>
        </div>
      </div>

      {/* Monthly chart */}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--gray-700)', marginBottom: 12 }}>Doanh thu 12 tháng</div>
        <div style={{ height: 160 }}>
          <Bar
            data={{
              labels: last12Months.map(d => d.label),
              datasets: [{
                data: last12Months.map(d => d.inc),
                backgroundColor: last12Months.map((_, i) => i === 11 ? '#7c3aed' : '#7c3aed55'),
                borderRadius: 4
              }]
            }}
            options={{ ...chartOptions, plugins: { ...chartOptions.plugins, legend: { display: false } } }}
          />
        </div>
      </div>

      {/* Status distribution */}
      <div style={cardStyle}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--gray-700)', marginBottom: 12 }}>Phân bố trạng thái đơn hàng</div>
        {totalOrders > 0 ? (
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ width: 130, height: 130, flexShrink: 0 }}>
              <Doughnut
                data={{
                  labels: Object.keys(statusCounts),
                  datasets: [{
                    data: Object.values(statusCounts),
                    backgroundColor: [
                      STATUS_COLORS[ORDER_STATUS.NEW].bg,
                      STATUS_COLORS[ORDER_STATUS.PREPARED].bg,
                      STATUS_COLORS[ORDER_STATUS.TAKEN].bg,
                      STATUS_COLORS[ORDER_STATUS.RETURNED].bg
                    ],
                    borderColor: [
                      STATUS_COLORS[ORDER_STATUS.NEW].border,
                      STATUS_COLORS[ORDER_STATUS.PREPARED].border,
                      STATUS_COLORS[ORDER_STATUS.TAKEN].border,
                      STATUS_COLORS[ORDER_STATUS.RETURNED].border
                    ],
                    borderWidth: 2
                  }]
                }}
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.raw}` } } } }}
              />
            </div>
            <div style={{ flex: 1 }}>
              {Object.entries(statusCounts).map(([status, count], i) => (
                <div key={status} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <StatusBadge status={status} />
                  <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--gray-700)' }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--gray-400)', fontSize: 13 }}>Chưa có đơn hàng nào</div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ icon, label, value, sub, color }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 14, padding: '14px 14px',
      border: '1px solid var(--gray-200)',
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontWeight: 800, fontSize: 20, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>{sub}</div>
    </div>
  )
}

const cardStyle = {
  background: '#fff', borderRadius: 14, padding: '14px',
  border: '1px solid var(--gray-200)',
  boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
}
