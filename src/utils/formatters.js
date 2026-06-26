export function formatCurrency(amount) {
  if (!amount && amount !== 0) return '0 ₫'
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)
}

export function formatDate(date) {
  if (!date) return ''
  const d = new Date(date)
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatDateInput(date) {
  if (!date) return ''
  const d = new Date(date)
  return d.toISOString().slice(0, 10)
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function isOverdue(returnDate, status) {
  if (status === 'Đã trả') return false
  return new Date(returnDate) < new Date(new Date().setHours(0, 0, 0, 0))
}

export function isDueSoon(returnDate, status, hours = 24) {
  if (status === 'Đã trả') return false
  const now = new Date()
  const due = new Date(returnDate)
  return due >= now && due <= new Date(now.getTime() + hours * 60 * 60 * 1000)
}

export function removeAccents(str) {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

export function getMonthLabel(monthIndex) {
  return `Th${monthIndex + 1}`
}
