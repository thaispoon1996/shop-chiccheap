import React, { useState, useEffect, useCallback } from 'react'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Tooltip, Legend
} from 'chart.js'
import { Bar, Pie } from 'react-chartjs-2'
import { db, TRANSACTION_TYPE, INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '../db/database'
import { formatCurrency, formatDate, todayISO } from '../utils/formatters'
import { Modal, ConfirmDialog } from '../components/common/Modal'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend)

const TAB_LIST = ['Ngày', 'Tháng', 'Năm', 'Giai đoạn', 'Theo loại']

export function FinancePage({ toast }) {
  const [transactions, setTransactions] = useState([])
  const [tab, setTab] = useState('Tháng')
  const [showForm, setShowForm] = useState(false)
  const [editTx, setEditTx] = useState(null)
  const [deleteTx, setDeleteTx] = useState(null)
  const [swipeId, setSwipeId] = useState(null)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  const loadTx = useCallback(async () => {
    const all = await db.transactions.filter(t => !t.deletedAt).toArray()
    setTransactions(all.sort((a, b) => b.createdAt - a.createdAt))
  }, [])

  useEffect(() => { loadTx() }, [loadTx])
  useEffect(() => {
    window.addEventListener('chiccheap:sync', loadTx)
    return () => window.removeEventListener('chiccheap:sync', loadTx)
  }, [loadTx])

  const years = [...new Set(transactions.map(t => new Date(t.date).getFullYear()))]
  if (!years.includes(new Date().getFullYear())) years.push(new Date().getFullYear())
  years.sort((a, b) => b - a)

  const filteredTx = transactions.filter(t => {
    if (typeFilter && t.type !== typeFilter) return false
    return true
  })

  // Compute monthly data for selected year
  const monthlyData = Array.from({ length: 12 }, (_, m) => {
    const month = `${selectedYear}-${String(m + 1).padStart(2, '0')}`
    const inc = transactions.filter(t => t.type === 'Thu' && t.date.startsWith(month)).reduce((s, t) => s + t.amount, 0)
    const exp = transactions.filter(t => t.type === 'Chi' && t.date.startsWith(month)).reduce((s, t) => s + t.amount, 0)
    return { inc, exp, net: inc - exp }
  })

  // Daily data for selected month
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate()
  const dailyData = Array.from({ length: daysInMonth }, (_, d) => {
    const day = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(d + 1).padStart(2, '0')}`
    const inc = transactions.filter(t => t.type === 'Thu' && t.date === day).reduce((s, t) => s + t.amount, 0)
    const exp = transactions.filter(t => t.type === 'Chi' && t.date === day).reduce((s, t) => s + t.amount, 0)
    return { day: d + 1, inc, exp }
  }).filter(d => d.inc > 0 || d.exp > 0)

  // Range data
  const rangeTx = transactions.filter(t => {
    if (!rangeFrom && !rangeTo) return true
    if (rangeFrom && t.date < rangeFrom) return false
    if (rangeTo && t.date > rangeTo) return false
    return true
  })
  const rangeInc = rangeTx.filter(t => t.type === 'Thu').reduce((s, t) => s + t.amount, 0)
  const rangeExp = rangeTx.filter(t => t.type === 'Chi').reduce((s, t) => s + t.amount, 0)

  // Category breakdown
  const catData = {}
  filteredTx.forEach(t => {
    catData[t.category] = (catData[t.category] || 0) + t.amount
  })
  const catLabels = Object.keys(catData)
  const catAmounts = catLabels.map(k => catData[k])
  const catColors = ['#7c3aed', '#059669', '#d97706', '#dc2626', '#0284c7', '#c026d3', '#16a34a', '#ea580c']

  const handleSave = () => {
    setShowForm(false)
    setEditTx(null)
    toast.show(editTx ? 'Cập nhật thành công' : 'Thêm giao dịch thành công')
    loadTx()
    window.dispatchEvent(new CustomEvent('chiccheap:push'))
  }

  const handleDelete = async () => {
    await db.transactions.update(deleteTx.id, { deletedAt: Date.now() })
    toast.show('Đã xoá giao dịch')
    setDeleteTx(null)
    loadTx()
    window.dispatchEvent(new CustomEvent('chiccheap:push'))
  }

  const totalInc = filteredTx.filter(t => t.type === 'Thu').reduce((s, t) => s + t.amount, 0)
  const totalExp = filteredTx.filter(t => t.type === 'Chi').reduce((s, t) => s + t.amount, 0)

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: {
      label: ctx => formatCurrency(ctx.raw)
    }}},
    scales: {
      y: { ticks: { callback: v => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${(v / 1e3).toFixed(0)}K` } }
    }
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--gray-50)' }}>
      {/* Tab bar */}
      <div style={{
        background: '#fff',
        borderBottom: '1px solid var(--gray-200)',
        display: 'flex',
        overflowX: 'auto',
        position: 'sticky', top: 0, zIndex: 10
      }}>
        {TAB_LIST.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '12px 16px',
            fontSize: 13, fontWeight: 600,
            color: tab === t ? 'var(--primary)' : 'var(--gray-500)',
            borderBottom: `2px solid ${tab === t ? 'var(--primary)' : 'transparent'}`,
            whiteSpace: 'nowrap',
            flexShrink: 0
          }}>{t}</button>
        ))}
      </div>

      <div style={{ padding: '16px', paddingBottom: 80 }}>
        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
          <SummaryCard label="Tổng thu" value={tab === 'Giai đoạn' ? rangeInc : totalInc} color="var(--success)" icon="↑" />
          <SummaryCard label="Tổng chi" value={tab === 'Giai đoạn' ? rangeExp : totalExp} color="var(--danger)" icon="↓" />
          <SummaryCard
            label="Doanh thu thuần"
            value={(tab === 'Giai đoạn' ? rangeInc - rangeExp : totalInc - totalExp)}
            color="var(--primary)" icon="="
          />
        </div>

        {/* Chart area */}
        {tab === 'Tháng' && (
          <div style={chartCard}>
            <div style={chartHeader}>
              <span style={chartTitle}>Doanh thu theo tháng {selectedYear}</span>
              <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} style={selectStyle}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div style={{ height: 200 }}>
              <Bar
                data={{
                  labels: Array.from({ length: 12 }, (_, i) => `Th${i + 1}`),
                  datasets: [
                    { label: 'Thu', data: monthlyData.map(d => d.inc), backgroundColor: '#059669aa', borderRadius: 4 },
                    { label: 'Chi', data: monthlyData.map(d => d.exp), backgroundColor: '#dc2626aa', borderRadius: 4 }
                  ]
                }}
                options={{ ...chartOptions, plugins: { ...chartOptions.plugins, legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 11 } } } } }}
              />
            </div>
          </div>
        )}

        {tab === 'Ngày' && (
          <div style={chartCard}>
            <div style={chartHeader}>
              <span style={chartTitle}>Doanh thu theo ngày</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} style={selectStyle}>
                  {Array.from({ length: 12 }, (_, i) => <option key={i} value={i}>Tháng {i + 1}</option>)}
                </select>
                <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} style={selectStyle}>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
            {dailyData.length > 0 ? (
              <div style={{ height: 200 }}>
                <Bar
                  data={{
                    labels: dailyData.map(d => `${d.day}/${selectedMonth + 1}`),
                    datasets: [
                      { label: 'Thu', data: dailyData.map(d => d.inc), backgroundColor: '#059669aa', borderRadius: 4 },
                      { label: 'Chi', data: dailyData.map(d => d.exp), backgroundColor: '#dc2626aa', borderRadius: 4 }
                    ]
                  }}
                  options={{ ...chartOptions, plugins: { ...chartOptions.plugins, legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 11 } } } } }}
                />
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--gray-400)', fontSize: 13 }}>Không có dữ liệu</div>
            )}
          </div>
        )}

        {tab === 'Năm' && (
          <div style={chartCard}>
            <div style={chartHeader}><span style={chartTitle}>So sánh doanh thu theo năm</span></div>
            <div style={{ height: 200 }}>
              <Bar
                data={{
                  labels: years.slice().reverse(),
                  datasets: [
                    {
                      label: 'Thu',
                      data: years.slice().reverse().map(y =>
                        transactions.filter(t => t.type === 'Thu' && t.date.startsWith(String(y))).reduce((s, t) => s + t.amount, 0)
                      ),
                      backgroundColor: '#059669aa', borderRadius: 4
                    },
                    {
                      label: 'Chi',
                      data: years.slice().reverse().map(y =>
                        transactions.filter(t => t.type === 'Chi' && t.date.startsWith(String(y))).reduce((s, t) => s + t.amount, 0)
                      ),
                      backgroundColor: '#dc2626aa', borderRadius: 4
                    }
                  ]
                }}
                options={{ ...chartOptions, plugins: { ...chartOptions.plugins, legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 11 } } } } }}
              />
            </div>
          </div>
        )}

        {tab === 'Giai đoạn' && (
          <div style={chartCard}>
            <div style={chartHeader}><span style={chartTitle}>Tuỳ chọn khoảng thời gian</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Từ ngày</label>
                <input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Đến ngày</label>
                <input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <SummaryCard label="Thu" value={rangeInc} color="var(--success)" icon="↑" />
              <SummaryCard label="Chi" value={rangeExp} color="var(--danger)" icon="↓" />
              <SummaryCard label="Thuần" value={rangeInc - rangeExp} color="var(--primary)" icon="=" />
            </div>
          </div>
        )}

        {tab === 'Theo loại' && (
          <div style={chartCard}>
            <div style={chartHeader}>
              <span style={chartTitle}>Phân tích theo hạng mục</span>
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={selectStyle}>
                <option value="">Tất cả</option>
                <option value="Thu">Thu</option>
                <option value="Chi">Chi</option>
              </select>
            </div>
            {catLabels.length > 0 ? (
              <div style={{ height: 200 }}>
                <Pie
                  data={{
                    labels: catLabels,
                    datasets: [{
                      data: catAmounts,
                      backgroundColor: catColors.slice(0, catLabels.length),
                      borderWidth: 2
                    }]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                      tooltip: { callbacks: { label: ctx => `${ctx.label}: ${formatCurrency(ctx.raw)}` } }
                    }
                  }}
                />
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--gray-400)', fontSize: 13 }}>Không có dữ liệu</div>
            )}
          </div>
        )}

        {/* Transaction list */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--gray-700)' }}>Danh sách giao dịch</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {['', 'Thu', 'Chi'].map(t => (
                <button key={t} onClick={() => setTypeFilter(t)} style={{
                  padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                  border: '1px solid var(--gray-200)',
                  background: typeFilter === t ? 'var(--primary)' : 'var(--gray-100)',
                  color: typeFilter === t ? '#fff' : 'var(--gray-600)'
                }}>{t || 'Tất cả'}</button>
              ))}
            </div>
          </div>

          {filteredTx.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--gray-400)', fontSize: 13 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>💰</div>
              Chưa có giao dịch nào
            </div>
          ) : filteredTx.map(tx => (
            <TxCard
              key={tx.id}
              tx={tx}
              active={swipeId === tx.id}
              onSwipe={id => setSwipeId(swipeId === id ? null : id)}
              onEdit={() => { setEditTx(tx); setShowForm(true) }}
              onDelete={() => setDeleteTx(tx)}
            />
          ))}
        </div>
      </div>

      {/* FAB */}
      <button
        onClick={() => { setEditTx(null); setShowForm(true) }}
        style={{
          position: 'fixed',
          bottom: `calc(72px + env(safe-area-inset-bottom, 0px))`,
          right: 20,
          width: 56, height: 56, borderRadius: '50%',
          background: 'var(--success)',
          color: '#fff', fontSize: 28,
          boxShadow: '0 4px 16px rgba(5,150,105,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 20
        }}
      >+</button>

      {showForm && (
        <Modal title={editTx ? 'Chỉnh sửa giao dịch' : 'Thêm giao dịch'} onClose={() => { setShowForm(false); setEditTx(null) }}>
          <TransactionForm tx={editTx} onSave={handleSave} onCancel={() => { setShowForm(false); setEditTx(null) }} />
        </Modal>
      )}

      {deleteTx && (
        <ConfirmDialog
          message={`Xoá giao dịch "${deleteTx.category}" - ${formatCurrency(deleteTx.amount)}?`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTx(null)}
        />
      )}
    </div>
  )
}

function TxCard({ tx, active, onSwipe, onEdit, onDelete }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 12, marginBottom: 8 }}>
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0,
        display: 'flex', alignItems: 'center', gap: 8, paddingRight: 8,
        background: 'var(--gray-100)'
      }}>
        <button onClick={onEdit} style={{ width: 52, height: 52, borderRadius: 10, background: 'var(--primary)', color: '#fff', fontSize: 12, fontWeight: 600, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>✏️<span>Sửa</span></button>
        <button onClick={onDelete} style={{ width: 52, height: 52, borderRadius: 10, background: 'var(--danger)', color: '#fff', fontSize: 12, fontWeight: 600, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>🗑<span>Xoá</span></button>
      </div>
      <div
        onClick={() => onSwipe(tx.id)}
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: '12px 14px',
          border: '1px solid var(--gray-200)',
          transform: active ? 'translateX(-120px)' : 'translateX(0)',
          transition: 'transform 0.25s',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          position: 'relative',
          zIndex: 1
        }}
      >
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: tx.type === 'Thu' ? '#d1fae5' : '#fee2e2',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18
        }}>
          {tx.type === 'Thu' ? '↑' : '↓'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--gray-800)' }}>{tx.category}</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>
            {formatDate(tx.date)}
            {tx.notes && ` · ${tx.notes}`}
          </div>
        </div>
        <div style={{
          fontWeight: 700, fontSize: 15,
          color: tx.type === 'Thu' ? 'var(--success)' : 'var(--danger)',
          flexShrink: 0
        }}>
          {tx.type === 'Thu' ? '+' : '-'}{formatCurrency(tx.amount)}
        </div>
      </div>
    </div>
  )
}

function TransactionForm({ tx, onSave, onCancel }) {
  const [form, setForm] = useState(tx ? { ...tx, amount: String(tx.amount) } : {
    type: 'Thu', category: INCOME_CATEGORIES[0], amount: '', date: todayISO(), notes: ''
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }))

  const categories = form.type === 'Thu' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  const validate = () => {
    const e = {}
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0)
      e.amount = 'Số tiền phải là số dương'
    if (!form.date) e.date = 'Vui lòng chọn ngày'
    return e
  }

  const handleSave = async () => {
    const e = validate()
    if (Object.keys(e).length > 0) { setErrors(e); return }
    setSaving(true)
    try {
      const data = { ...form, amount: Number(form.amount), updatedAt: Date.now() }
      if (tx) await db.transactions.update(tx.id, data)
      else { data.createdAt = Date.now(); await db.transactions.add(data) }
      onSave()
    } finally { setSaving(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {['Thu', 'Chi'].map(t => (
          <button key={t} onClick={() => { set('type', t); set('category', t === 'Thu' ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]) }} style={{
            flex: 1, padding: '12px 0', borderRadius: 10, fontWeight: 700, fontSize: 15,
            border: `2px solid ${form.type === t ? (t === 'Thu' ? 'var(--success)' : 'var(--danger)') : 'var(--gray-200)'}`,
            background: form.type === t ? (t === 'Thu' ? '#d1fae5' : '#fee2e2') : '#fff',
            color: form.type === t ? (t === 'Thu' ? 'var(--success)' : 'var(--danger)') : 'var(--gray-500)'
          }}>{t === 'Thu' ? '↑ Thu' : '↓ Chi'}</button>
        ))}
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Hạng mục *</label>
        <select value={form.category} onChange={e => set('category', e.target.value)} style={{ ...inputStyle, padding: '12px 14px' }}>
          {categories.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Số tiền (₫) *</label>
        <input
          type="text"
          inputMode="numeric"
          value={form.amount ? Number(form.amount).toLocaleString('vi-VN') : ''}
          onChange={e => set('amount', e.target.value.replace(/\D/g, ''))}
          placeholder="500.000"
          style={{ ...inputStyle, border: `1.5px solid ${errors.amount ? 'var(--danger)' : 'var(--gray-200)'}`, padding: '12px 14px' }}
        />
        {errors.amount && <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{errors.amount}</p>}
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Ngày giao dịch *</label>
        <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
          style={{ ...inputStyle, border: `1.5px solid ${errors.date ? 'var(--danger)' : 'var(--gray-200)'}`, padding: '12px 14px' }} />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Ghi chú</label>
        <input type="text" value={form.notes} onChange={e => set('notes', e.target.value)}
          placeholder="Mô tả thêm..." style={{ ...inputStyle, padding: '12px 14px' }} />
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '13px 0', borderRadius: 10, background: 'var(--gray-100)', color: 'var(--gray-700)', fontWeight: 600 }}>Huỷ</button>
        <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: '13px 0', borderRadius: 10, background: saving ? 'var(--gray-300)' : (form.type === 'Thu' ? 'var(--success)' : 'var(--danger)'), color: '#fff', fontWeight: 700 }}>
          {saving ? 'Đang lưu...' : tx ? 'Cập nhật' : 'Thêm giao dịch'}
        </button>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, color, icon }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '10px 10px',
      border: '1px solid var(--gray-200)', textAlign: 'center'
    }}>
      <div style={{ fontSize: 18, marginBottom: 2, color }}>{icon}</div>
      <div style={{ fontWeight: 800, fontSize: 13, color, marginBottom: 2 }}>
        {formatCurrency(Math.abs(value))}
      </div>
      <div style={{ fontSize: 10, color: 'var(--gray-400)', fontWeight: 600 }}>{label}</div>
    </div>
  )
}

const chartCard = {
  background: '#fff', borderRadius: 14, padding: '14px',
  border: '1px solid var(--gray-200)', marginBottom: 16
}
const chartHeader = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12
}
const chartTitle = { fontWeight: 700, fontSize: 14, color: 'var(--gray-700)' }
const selectStyle = {
  padding: '5px 10px', borderRadius: 8, border: '1px solid var(--gray-200)',
  background: 'var(--gray-50)', fontSize: 12, color: 'var(--gray-700)'
}
const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--gray-600)', marginBottom: 6 }
const inputStyle = {
  width: '100%', borderRadius: 10, border: '1.5px solid var(--gray-200)',
  background: '#fff', fontSize: 15, color: 'var(--gray-800)'
}
