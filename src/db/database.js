import Dexie from 'dexie'

export const db = new Dexie('ChicCheapDB')

db.version(1).stores({
  orders: '++id, customerName, phone, rentDate, returnDate, status, totalAmount, createdAt, deletedAt',
  transactions: '++id, type, category, amount, date, orderId, createdAt, deletedAt'
})

// Order status constants
export const ORDER_STATUS = {
  NEW: 'Mới tạo',
  PREPARED: 'Đã soạn',
  TAKEN: 'Đã lấy',
  RETURNED: 'Đã trả'
}

export const ORDER_STATUS_LIST = [
  ORDER_STATUS.NEW,
  ORDER_STATUS.PREPARED,
  ORDER_STATUS.TAKEN,
  ORDER_STATUS.RETURNED
]

export const STATUS_COLORS = {
  [ORDER_STATUS.NEW]: { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' },
  [ORDER_STATUS.PREPARED]: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  [ORDER_STATUS.TAKEN]: { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
  [ORDER_STATUS.RETURNED]: { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' }
}

// Transaction types
export const TRANSACTION_TYPE = {
  INCOME: 'Thu',
  EXPENSE: 'Chi'
}

export const INCOME_CATEGORIES = ['Tiền thuê đồ', 'Tiền đặt cọc', 'Tiền phụ thu hư hỏng', 'Khác']
export const EXPENSE_CATEGORIES = ['Mua đồ mới', 'Giặt ủi', 'Sửa chữa', 'Vận chuyển', 'Mặt bằng', 'Khác']

// Generate order ID: format ORD-YYYYMMDD-HHMMSS-XXX (timestamp + random suffix = unique across devices)
export function generateOrderId() {
  const now = new Date()
  const pad = (n, l = 2) => String(n).padStart(l, '0')
  const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0')
  return `ORD-${dateStr}-${timeStr}-${rand}`
}
