import React, { useState, useRef } from 'react'
import { extractInvoiceData, fileToBase64, getApiKey } from '../utils/invoiceOCR'

export function InvoiceScanner({ onFill, onNeedApiKey }) {
  const [state, setState] = useState('idle') // idle | scanning | done | error
  const [preview, setPreview] = useState(null)
  const [extracted, setExtracted] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const inputRef = useRef()

  const reset = () => {
    setState('idle')
    setPreview(null)
    setExtracted(null)
    setErrorMsg('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleFile = async (file) => {
    if (!file) return
    if (!getApiKey()) { onNeedApiKey?.(); return }

    // show preview immediately
    const reader = new FileReader()
    reader.onload = (e) => setPreview(e.target.result)
    reader.readAsDataURL(file)

    setState('scanning')
    setExtracted(null)
    setErrorMsg('')

    try {
      const base64 = await fileToBase64(file)
      const mediaType = file.type || 'image/jpeg'
      const data = await extractInvoiceData(base64, mediaType)
      setExtracted(data)
      setState('done')
    } catch (err) {
      setErrorMsg(err.message)
      setState('error')
    }
  }

  const handleApply = () => {
    if (extracted) {
      onFill(extracted)
      reset()
    }
  }

  if (state === 'idle') {
    return (
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        style={{
          width: '100%', padding: '11px 14px', borderRadius: 10, marginBottom: 16,
          border: '1.5px dashed var(--primary)', background: 'var(--primary-light)',
          color: 'var(--primary)', fontWeight: 600, fontSize: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
        }}
      >
        📷 Quét hóa đơn tự động điền
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={e => handleFile(e.target.files?.[0])}
          style={{ display: 'none' }}
        />
      </button>
    )
  }

  return (
    <div style={{
      border: '1.5px solid var(--gray-200)', borderRadius: 12,
      overflow: 'hidden', marginBottom: 16
    }}>
      {/* Image preview */}
      {preview && (
        <div style={{ position: 'relative' }}>
          <img
            src={preview}
            alt="Hóa đơn"
            style={{ width: '100%', maxHeight: 180, objectFit: 'cover', display: 'block' }}
          />
          <button
            onClick={reset}
            style={{
              position: 'absolute', top: 8, right: 8,
              width: 28, height: 28, borderRadius: '50%',
              background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 13,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >✕</button>
        </div>
      )}

      {/* States */}
      {state === 'scanning' && (
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--gray-600)', fontSize: 14 }}>
          <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
          {' '}Đang đọc hóa đơn...
        </div>
      )}

      {state === 'error' && (
        <div style={{ padding: '12px 14px' }}>
          <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>❌ {errorMsg}</p>
          <button onClick={reset} style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 600 }}>
            Thử lại
          </button>
        </div>
      )}

      {state === 'done' && extracted && (
        <div style={{ padding: '12px 14px' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--success)', marginBottom: 8 }}>
            ✅ Đọc được thông tin:
          </p>
          <ExtractedPreview data={extracted} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              onClick={reset}
              style={{
                flex: 1, padding: '9px', borderRadius: 8,
                background: 'var(--gray-100)', color: 'var(--gray-600)',
                fontWeight: 600, fontSize: 13
              }}
            >Huỷ</button>
            <button
              onClick={handleApply}
              style={{
                flex: 2, padding: '9px', borderRadius: 8,
                background: 'var(--primary)', color: '#fff',
                fontWeight: 700, fontSize: 13
              }}
            >✨ Áp dụng vào form</button>
          </div>
        </div>
      )}
    </div>
  )
}

function ExtractedPreview({ data }) {
  const rows = [
    ['Tên KH', data.customerName],
    ['SĐT', data.phone],
    ['Ngày thuê', data.rentDate],
    ['Ngày trả', data.returnDate],
    ['Tổng tiền', data.totalAmount ? `${Number(data.totalAmount).toLocaleString('vi-VN')} ₫` : ''],
    ['Ghi chú', data.notes],
  ].filter(([, v]) => v && v !== '0' && v !== 0)

  if (!rows.length) return (
    <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>Không tìm thấy thông tin nào.</p>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: 'flex', gap: 8, fontSize: 13 }}>
          <span style={{ color: 'var(--gray-500)', minWidth: 72, flexShrink: 0 }}>{label}:</span>
          <span style={{ color: 'var(--gray-800)', fontWeight: 500 }}>{String(value)}</span>
        </div>
      ))}
    </div>
  )
}
