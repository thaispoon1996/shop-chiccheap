import React from 'react'
import { STATUS_COLORS, ORDER_STATUS_LIST } from '../../db/database'

export function StatusBadge({ status, size = 'sm' }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS['Mới tạo']
  const index = ORDER_STATUS_LIST.indexOf(status) + 1

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: size === 'sm' ? '3px 8px' : '5px 12px',
      borderRadius: 20,
      background: colors.bg,
      color: colors.text,
      border: `1px solid ${colors.border}`,
      fontSize: size === 'sm' ? 12 : 13,
      fontWeight: 600,
      whiteSpace: 'nowrap'
    }}>
      <span style={{
        width: size === 'sm' ? 16 : 18,
        height: size === 'sm' ? 16 : 18,
        borderRadius: '50%',
        background: colors.text,
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        fontWeight: 700,
        flexShrink: 0
      }}>{index}</span>
      {status}
    </span>
  )
}
