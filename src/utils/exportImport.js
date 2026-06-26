import { db } from '../db/database'

export async function exportToCSV() {
  const orders = await db.orders.filter(o => !o.deletedAt).toArray()
  const transactions = await db.transactions.filter(t => !t.deletedAt).toArray()

  const ordersCSV = [
    ['ID', 'Mã đơn', 'Tên khách', 'SĐT', 'Ngày thuê', 'Ngày trả', 'Tổng tiền', 'Trạng thái', 'Ghi chú', 'Ngày tạo'],
    ...orders.map(o => [
      o.id, o.orderId, o.customerName, o.phone,
      o.rentDate, o.returnDate, o.totalAmount, o.status,
      o.notes?.replace(/,/g, ';') || '', new Date(o.createdAt).toISOString()
    ])
  ].map(r => r.join(',')).join('\n')

  const transCSV = [
    ['ID', 'Loại', 'Hạng mục', 'Số tiền', 'Ngày', 'Ghi chú', 'Mã đơn hàng', 'Ngày tạo'],
    ...transactions.map(t => [
      t.id, t.type, t.category, t.amount, t.date,
      t.notes?.replace(/,/g, ';') || '', t.orderId || '', new Date(t.createdAt).toISOString()
    ])
  ].map(r => r.join(',')).join('\n')

  const content = `=== DON HANG ===\n${ordersCSV}\n\n=== GIAO DICH ===\n${transCSV}`
  downloadFile(content, `chiccheap-backup-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv')
}

export async function importFromCSV(file) {
  const text = await file.text()
  const sections = text.split(/=== [A-Z ]+ ===\n/)
  const nonEmpty = sections.filter(s => s.trim())

  if (nonEmpty.length < 2) throw new Error('File không đúng định dạng')

  const parseCSV = (section) => {
    const lines = section.trim().split('\n')
    const headers = lines[0].split(',')
    return lines.slice(1).map(line => {
      const values = line.split(',')
      return Object.fromEntries(headers.map((h, i) => [h.trim(), values[i]?.trim() || '']))
    })
  }

  const ordersData = parseCSV(nonEmpty[0])
  const transData = parseCSV(nonEmpty[1])

  await db.transaction('rw', db.orders, db.transactions, async () => {
    for (const o of ordersData) {
      await db.orders.add({
        orderId: o['Mã đơn'],
        customerName: o['Tên khách'],
        phone: o['SĐT'],
        rentDate: o['Ngày thuê'],
        returnDate: o['Ngày trả'],
        totalAmount: Number(o['Tổng tiền']),
        status: o['Trạng thái'],
        notes: o['Ghi chú'],
        createdAt: new Date(o['Ngày tạo']).getTime()
      })
    }
    for (const t of transData) {
      await db.transactions.add({
        type: t['Loại'],
        category: t['Hạng mục'],
        amount: Number(t['Số tiền']),
        date: t['Ngày'],
        notes: t['Ghi chú'],
        orderId: t['Mã đơn hàng'] || null,
        createdAt: new Date(t['Ngày tạo']).getTime()
      })
    }
  })
}

function downloadFile(content, filename, type) {
  const blob = new Blob(['﻿' + content], { type: `${type};charset=utf-8;` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
