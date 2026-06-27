import React, { useState } from 'react'
import { db, ORDER_STATUS_LIST, generateOrderId } from '../db/database'
import { todayISO, formatDateInput } from '../utils/formatters'
import { InvoiceScanner } from './InvoiceScanner'

const toRaw = (display) => display.replace(/\D/g, '')
const toDisplay = (raw) => raw ? Number(raw).toLocaleString('vi-VN') : ''

const EMPTY_FORM = {
  customerName: '',
  phone: '',
  rentDate: todayISO(),
  returnDate: todayISO(),
  notes: '',
  totalAmount: '',
  status: ORDER_STATUS_LIST[0]
}

export function OrderForm({ order, onSave, onCancel, onNeedApiKey }) {
  const isEdit = !!order
  const [form, setForm] = useState(isEdit ? {
    ...order,
    totalAmount: String(order.totalAmount),
    rentDate: formatDateInput(order.rentDate),
    returnDate: formatDateInput(order.returnDate)
  } : EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const handleFillFromInvoice = (data) => {
    setForm(prev => ({
      ...prev,
      ...(data.customerName && { customerName: data.customerName }),
      ...(data.phone && { phone: data.phone }),
      ...(data.rentDate && { rentDate: data.rentDate }),
      ...(data.returnDate && { returnDate: data.returnDate }),
      ...(data.totalAmount && data.totalAmount !== 0 && { totalAmount: String(data.totalAmount) }),
      ...(data.notes && { notes: data.notes }),
    }))
    setErrors({})
  }

  const set = (field, val) => {
    setForm(p => ({ ...p, [field]: val }))
    if (errors[field]) setErrors(p => ({ ...p, [field]: '' }))
  }

  const validate = () => {
    const e = {}
    if (!form.customerName.trim() || form.customerName.trim().length < 2)
      e.customerName = 'Tên tối thiểu 2 ký tự'
    if (!/^0\d{9}$/.test(form.phone.trim()))
      e.phone = 'SĐT phải là 10 số, bắt đầu bằng 0'
    if (!form.rentDate) e.rentDate = 'Vui lòng chọn ngày thuê'
    if (!form.returnDate) e.returnDate = 'Vui lòng chọn ngày trả'
    if (form.returnDate && form.rentDate && form.returnDate < form.rentDate)
      e.returnDate = 'Ngày trả phải lớn hơn hoặc bằng ngày thuê'
    const amt = Number(form.totalAmount)
    if (!form.totalAmount || isNaN(amt) || amt <= 0)
      e.totalAmount = 'Tổng tiền phải là số dương'
    return e
  }

  const handleSave = async () => {
    const e = validate()
    if (Object.keys(e).length > 0) { setErrors(e); return }
    setSaving(true)
    try {
      const data = {
        customerName: form.customerName.trim(),
        phone: form.phone.trim(),
        rentDate: form.rentDate,
        returnDate: form.returnDate,
        notes: form.notes.trim(),
        totalAmount: Number(form.totalAmount),
        status: form.status,
        updatedAt: Date.now()
      }
      if (isEdit) {
        await db.orders.update(order.id, data)
      } else {
        data.orderId = generateOrderId()
        data.createdAt = Date.now()
        await db.orders.add(data)
        await db.transactions.add({
          type: 'Thu',
          category: 'Tiền thuê đồ',
          amount: Number(form.totalAmount),
          date: form.rentDate,
          notes: `${data.orderId} - ${data.customerName}`,
          orderId: data.orderId,
          createdAt: Date.now(),
          updatedAt: Date.now()
        })
      }
      onSave()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {!isEdit && (
        <InvoiceScanner onFill={handleFillFromInvoice} onNeedApiKey={onNeedApiKey} />
      )}

      <Field label="Tên khách hàng *" error={errors.customerName}>
        <input
          type="text"
          value={form.customerName}
          onChange={e => set('customerName', e.target.value)}
          placeholder="Ví dụ: Nguyễn Thị Hoa"
          style={inputStyle(!!errors.customerName)}
        />
      </Field>

      <Field label="Số điện thoại *" error={errors.phone}>
        <input
          type="tel"
          value={form.phone}
          onChange={e => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
          placeholder="0912 345 678"
          style={inputStyle(!!errors.phone)}
        />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Ngày thuê *" error={errors.rentDate}>
          <input
            type="date"
            value={form.rentDate}
            onChange={e => set('rentDate', e.target.value)}
            style={inputStyle(!!errors.rentDate)}
          />
        </Field>
        <Field label="Ngày trả *" error={errors.returnDate}>
          <input
            type="date"
            value={form.returnDate}
            min={form.rentDate}
            onChange={e => set('returnDate', e.target.value)}
            style={inputStyle(!!errors.returnDate)}
          />
        </Field>
      </div>

      <Field label="Tổng tiền (₫) *" error={errors.totalAmount}>
        <input
          type="text"
          inputMode="numeric"
          value={toDisplay(form.totalAmount)}
          onChange={e => set('totalAmount', toRaw(e.target.value))}
          placeholder="500.000"
          style={inputStyle(!!errors.totalAmount)}
        />
      </Field>

      <Field label="Trạng thái *">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {ORDER_STATUS_LIST.map((s, i) => (
            <button
              key={s}
              onClick={() => set('status', s)}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                border: `2px solid ${form.status === s ? 'var(--primary)' : 'var(--gray-200)'}`,
                background: form.status === s ? 'var(--primary-light)' : '#fff',
                color: form.status === s ? 'var(--primary)' : 'var(--gray-600)',
                fontWeight: 600,
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <span style={{
                width: 18, height: 18, borderRadius: '50%',
                background: form.status === s ? 'var(--primary)' : 'var(--gray-300)',
                color: '#fff', fontSize: 10, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>{i + 1}</span>
              {s}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Ghi chú">
        <textarea
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Số đo, mã trang phục, yêu cầu đặc biệt, đặt cọc..."
          rows={3}
          style={{
            ...inputStyle(false),
            resize: 'none',
            lineHeight: 1.5
          }}
        />
      </Field>

      <div style={{ display: 'flex', gap: 12, paddingTop: 8 }}>
        <button
          onClick={onCancel}
          style={{
            flex: 1, padding: '14px 0', borderRadius: 12,
            background: 'var(--gray-100)', color: 'var(--gray-700)',
            fontWeight: 600, fontSize: 16
          }}
        >Huỷ</button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            flex: 2, padding: '14px 0', borderRadius: 12,
            background: saving ? 'var(--gray-300)' : 'var(--primary)',
            color: '#fff', fontWeight: 700, fontSize: 16
          }}
        >{saving ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Tạo đơn hàng'}</button>
      </div>
    </div>
  )
}

function Field({ label, error, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--gray-600)', marginBottom: 6 }}>
        {label}
      </label>
      {children}
      {error && <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{error}</p>}
    </div>
  )
}

function inputStyle(hasError) {
  return {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 10,
    border: `1.5px solid ${hasError ? 'var(--danger)' : 'var(--gray-200)'}`,
    background: '#fff',
    fontSize: 15,
    color: 'var(--gray-800)',
    transition: 'border-color 0.2s'
  }
}
