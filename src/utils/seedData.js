import { db, generateOrderId } from '../db/database'

// Raw order data extracted from import screenshots
const RAW_ORDERS = [
  // --- 26/06/2026 batch ---
  { customerName: 'thảo nguyên',  phone: '0907094714', rentDate: '2026-06-26', returnDate: '2026-06-27', notes: 'áo dài kem, cọc 100k',                                                                          totalAmount: 100000, status: 'Mới tạo' },
  { customerName: 'minh thư',     phone: '0333426191', rentDate: '2026-06-26', returnDate: '2026-06-27', notes: 'áo dài voan, nơ cử nhân đỏ, cọc 100k',                                                         totalAmount: 110000, status: 'Mới tạo' },
  { customerName: 'thảo',         phone: '0376515912', rentDate: '2026-06-26', returnDate: '2026-06-27', notes: 'áo dài trắng, cọc 100k',                                                                        totalAmount: 90000,  status: 'Mới tạo' },
  { customerName: 'cùng',         phone: '0862482531', rentDate: '2026-06-26', returnDate: '2026-06-27', notes: 'sash 3 cái, cà vat đen 2 cái, vest 6 cúc S, cọc 200k',                                        totalAmount: 280000, status: 'Mới tạo' },
  { customerName: 'bảo châu',     phone: '0326457349', rentDate: '2026-06-26', returnDate: '2026-06-27', notes: 'áo dài trắng voan, cọc cccd',                                                                  totalAmount: 90000,  status: 'Mới tạo' },
  { customerName: 'ngọc',         phone: '0868071655', rentDate: '2026-06-26', returnDate: '2026-06-28', notes: '2 áo dài voan, cọc cccd',                                                                      totalAmount: 180000, status: 'Mới tạo' },
  { customerName: 'khang',        phone: '0977514810', rentDate: '2026-06-26', returnDate: '2026-06-27', notes: 'áo dài voan, vest 6 cúc M, cà vat đen, cọc 200k',                                             totalAmount: 290000, status: 'Mới tạo' },
  { customerName: 'lương',        phone: '0792252772', rentDate: '2026-06-26', returnDate: '2026-06-27', notes: 'vest 2 cúc, cà vat, sash, cọc 200k',                                                          totalAmount: 190000, status: 'Mới tạo' },
  { customerName: 'minh',         phone: '0842011009', rentDate: '2026-06-26', returnDate: '2026-06-27', notes: 'vest 6 cúc L, quần số 5, sash, cà vat đỏ, cọc 200k',                                         totalAmount: 270000, status: 'Mới tạo' },
  { customerName: 'đào',          phone: '0334939506', rentDate: '2026-06-26', returnDate: '2026-06-27', notes: 'sash, voan L, cọc 150k',                                                                       totalAmount: 120000, status: 'Mới tạo' },
  { customerName: 'ngọc anh',     phone: '0901541466', rentDate: '2026-06-26', returnDate: '2026-06-27', notes: 'áo dài voan, nơ tóc, cọc 100k',                                                               totalAmount: 110000, status: 'Mới tạo' },
  { customerName: 'nhã',          phone: '0797110908', rentDate: '2026-06-26', returnDate: '2026-06-27', notes: 'giày, vest 6 cúc, cài áo',                                                                     totalAmount: 260000, status: 'Mới tạo' },
  { customerName: 'khoa',         phone: '0924339723', rentDate: '2026-06-26', returnDate: '2026-06-27', notes: 'vest 6 cúc, cài áo, giày',                                                                     totalAmount: 260000, status: 'Mới tạo' },
  { customerName: 'trí',          phone: '0349454439', rentDate: '2026-06-26', returnDate: '2026-06-27', notes: 'vest 6 cúc, cài áo dây, cà vat đen',                                                          totalAmount: 220000, status: 'Mới tạo' },
  { customerName: 'hòa',          phone: '0336840093', rentDate: '2026-06-26', returnDate: '2026-06-27', notes: 'vest 6 cúc, cài áo lá',                                                                       totalAmount: 220000, status: 'Mới tạo' },
  { customerName: 'châu',         phone: '0908702501', rentDate: '2026-06-26', returnDate: '2026-06-27', notes: 'áo dài trắng, cọc 100k',                                                                       totalAmount: 90000,  status: 'Mới tạo' },
  { customerName: 'hân',          phone: '0839161184', rentDate: '2026-06-26', returnDate: '2026-06-27', notes: 'áo dài kem',                                                                                   totalAmount: 110000, status: 'Mới tạo' },
  { customerName: 'lê',           phone: '0372137624', rentDate: '2026-06-26', returnDate: '2026-06-27', notes: 'áo dài đỏ, cọc 100k',                                                                         totalAmount: 100000, status: 'Mới tạo' },
  { customerName: 'kiều nhung',   phone: '0359804650', rentDate: '2026-06-26', returnDate: '2026-06-27', notes: 'áo dài trắng ren, chưa cọc',                                                                  totalAmount: 180000, status: 'Mới tạo' },
  { customerName: 'phương linh',  phone: '0933007364', rentDate: '2026-06-26', returnDate: '2026-06-27', notes: '4 cử nhân quốc tế đen, 4 sash, 2 nơ free',                                                   totalAmount: 400000, status: 'Mới tạo' },
  { customerName: 'diệu thảo',   phone: '0375625616', rentDate: '2026-06-26', returnDate: '2026-06-27', notes: 'áo dài voan size M, móng giả màu hồng, cọc 100k',                                             totalAmount: 135000, status: 'Đã lấy' },
  { customerName: 'phương',       phone: '0339920454', rentDate: '2026-06-26', returnDate: '2026-06-27', notes: 'áo dài nâu L',                                                                                totalAmount: 100000, status: 'Mới tạo' },
  { customerName: 'trân',         phone: '0346183290', rentDate: '2026-06-26', returnDate: '2026-06-27', notes: 'áo dài trắng tt, cao gót mwv 39, cọc 200k',                                                  totalAmount: 170000, status: 'Mới tạo' },
  { customerName: 'dự',           phone: '0388324812', rentDate: '2026-06-26', returnDate: '2026-06-27', notes: 'sơ mi trắng XL, boot 41, cà vat đỏ, quần',                                                   totalAmount: 200000, status: 'Mới tạo' },
  { customerName: 'phú',          phone: '0338728408', rentDate: '2026-06-26', returnDate: '2026-06-27', notes: 'sơ mi trắng VVT, cà vat đỏ, giày nam',                                                       totalAmount: 160000, status: 'Mới tạo' },
  { customerName: 'trà',          phone: '0908071205', rentDate: '2026-06-26', returnDate: '2026-06-27', notes: 'áo dài kem, quần bóp eo 2p mb, cao gót da 39',                                               totalAmount: 170000, status: 'Mới tạo' },
  { customerName: 'tuyền',        phone: '0948596293', rentDate: '2026-06-26', returnDate: '2026-06-27', notes: 'áo dài cát 4 tà, cọc 100k',                                                                  totalAmount: 100000, status: 'Đã lấy' },
  { customerName: 'phương vy',    phone: '0908732384', rentDate: '2026-06-26', returnDate: '2026-06-28', notes: '1 áo dài kem, cọc 100k',                                                                      totalAmount: 100000, status: 'Mới tạo' },
  { customerName: 'hằng',         phone: '0866742834', rentDate: '2026-06-26', returnDate: '2026-06-29', notes: '2 áo dài hồng (S, M), 1 áo dài nam đỏ, 1 áo dài nam xanh, cccd, còn 220k',                 totalAmount: 420000, status: 'Mới tạo' },
  { customerName: 'hạnh chuyên', phone: '0784437613', rentDate: '2026-06-26', returnDate: '2026-06-27', notes: '1 áo dài voan, cọc 90k',                                                                       totalAmount: 90000,  status: 'Mới tạo' },
  { customerName: 'Ngọc Bích',    phone: '0352215712', rentDate: '2026-06-26', returnDate: '2026-06-30', notes: '5 áo dài trắng, áo dài trắng thiết kế',                                                      totalAmount: 740000, status: 'Mới tạo' },
  { customerName: 'phương thảo', phone: '0000000000', rentDate: '2026-06-26', returnDate: '2026-06-27', notes: 'áo dài xanh',                                                                                  totalAmount: 100000, status: 'Mới tạo' },
  // --- 27/06/2026 batch ---
  { customerName: 'cô hiến',      phone: '0942849068', rentDate: '2026-06-27', returnDate: '2026-06-29', notes: 'áo dài vàng S, cọc 100k',                                                                     totalAmount: 110000, status: 'Mới tạo' },
  { customerName: 'trường huy',  phone: '0933015843', rentDate: '2026-06-27', returnDate: '2026-06-28', notes: 'vest 6 cúc trắng size 3XL, giày size 43, cà vat đen, 2 phụ kiện lá, phụ kiện dây, còn 100k', totalAmount: 300000, status: 'Mới tạo' },
  { customerName: 'trâm',         phone: '0968095474', rentDate: '2026-06-27', returnDate: '2026-06-29', notes: 'áo dài xanh, bóp éo 0.5p',                                                                   totalAmount: 110000, status: 'Mới tạo' },
  { customerName: 'mũi',          phone: '0939133567', rentDate: '2026-06-27', returnDate: '2026-06-28', notes: 'áo dài hồng vẫn gẫy',                                                                        totalAmount: 100000, status: 'Mới tạo' },
  { customerName: 'khánh lam',   phone: '0974767004', rentDate: '2026-06-27', returnDate: '2026-06-28', notes: 'áo dài bồng tròn, giày cao gót nơ trắng 39',                                                  totalAmount: 160000, status: 'Mới tạo' },
  // --- 28/06/2026 ---
  { customerName: 'thúy vi',     phone: '0786456779', rentDate: '2026-06-28', returnDate: '2026-06-29', notes: 'áo dài đỏ size S',                                                                             totalAmount: 100000, status: 'Mới tạo' },
  // --- 03/07/2026 ---
  { customerName: 'Chị Huyền',   phone: '0962457479', rentDate: '2026-07-03', returnDate: '2026-07-05', notes: '3 áo dài voan',                                                                                totalAmount: 360000, status: 'Mới tạo' },
  // --- 07/07/2026 ---
  { customerName: 'xuân mai',    phone: '0963784816', rentDate: '2026-07-07', returnDate: '2026-07-08', notes: '1 áo dài hồng, 2 áo dài kem',                                                                  totalAmount: 264000, status: 'Mới tạo' },
  // --- Earlier orders (already past) ---
  { customerName: 'phương linh', phone: '0933007364', rentDate: '2026-06-25', returnDate: '2026-06-26', notes: '4 cử nhân quốc tế đen, 4 sash, 2 nơ free',                                                    totalAmount: 400000, status: 'Mới tạo' },
  { customerName: 'lê quốc minh', phone: '0921231816', rentDate: '2026-06-20', returnDate: '2026-06-22', notes: '1 vest 6 cúc, 1 cà vat, 2 phụ kiện',                                                         totalAmount: 230000, status: 'Mới tạo' },
  { customerName: 'hiền',         phone: '0334148043', rentDate: '2026-06-20', returnDate: '2026-06-21', notes: 'vest 6 cúc 2XL, quần 7, sơ mi đen',                                                          totalAmount: 280000, status: 'Mới tạo' },
  { customerName: 'ngọc',         phone: '0764884730', rentDate: '2026-06-19', returnDate: '2026-06-21', notes: 'nơ khổng lồ, nail, 3 nơ cử nhân, 2 nail, 3 áo voan, nơ trắng to, 3 giày búp bê, 2 cao gót', totalAmount: 830000, status: 'Mới tạo' },
  { customerName: 'Nhi',          phone: '0941116745', rentDate: '2026-06-20', returnDate: '2026-06-21', notes: 'áo dài kem, áo dài đỏ',                                                                       totalAmount: 110000, status: 'Mới tạo' },
  { customerName: 'K.Duyên',     phone: '0325361701', rentDate: '2026-06-22', returnDate: '2026-06-23', notes: 'áo dài kem tk, 2 chuỗi, giày 12p 36, bông tay',                                               totalAmount: 200000, status: 'Mới tạo' },
  { customerName: 'nhật huy',    phone: '0941174654', rentDate: '2026-06-22', returnDate: '2026-06-23', notes: 'vest 6 cúc, 2 cài áo lá dây, cà vat đỏ, sơ mi đen, giày nam, quần, cọc cccd',               totalAmount: 390000, status: 'Mới tạo' },
  { customerName: 'chị Hiền',    phone: '0845124980', rentDate: '2026-06-14', returnDate: '2026-06-15', notes: 'áo dài xanh size L',                                                                           totalAmount: 120000, status: 'Mới tạo' },
  { customerName: 'chị phượng', phone: '0931227866', rentDate: '2026-06-20', returnDate: '2026-06-21', notes: '2 áo dài voan size m, đổi mới, ủi sẵn sáng 20/6 lấy quần size s vs l, 2 nơ trắng 1 giày đa size 38, cọc 200k', totalAmount: 180000, status: 'Đã lấy' },
]

export async function seedOrders() {
  const now = Date.now()
  const orders = []
  const transactions = []

  // Counter per date for order IDs
  const dateCounters = {}

  for (let i = 0; i < RAW_ORDERS.length; i++) {
    const raw = RAW_ORDERS[i]
    const dateKey = raw.rentDate.replace(/-/g, '')
    dateCounters[dateKey] = (dateCounters[dateKey] || 0) + 1
    const orderId = `ORD-${dateKey}-${String(dateCounters[dateKey]).padStart(3, '0')}`
    const createdAt = now - (RAW_ORDERS.length - i) * 1000 // stagger by 1s each

    orders.push({
      orderId,
      customerName: raw.customerName,
      phone: raw.phone,
      rentDate: raw.rentDate,
      returnDate: raw.returnDate,
      notes: raw.notes,
      totalAmount: raw.totalAmount,
      status: raw.status,
      createdAt,
      updatedAt: createdAt,
    })

    transactions.push({
      type: 'Thu',
      category: 'Tiền thuê đồ',
      amount: raw.totalAmount,
      date: raw.rentDate,
      notes: `${orderId} - ${raw.customerName}`,
      orderId,
      createdAt,
      updatedAt: createdAt,
    })
  }

  await db.orders.bulkAdd(orders)
  await db.transactions.bulkAdd(transactions)

  return orders.length
}
