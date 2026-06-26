import { GoogleGenerativeAI } from '@google/generative-ai'

export const getApiKey = () => localStorage.getItem('gemini_api_key') || ''
export const saveApiKey = (key) => localStorage.setItem('gemini_api_key', key.trim())

export async function extractInvoiceData(imageBase64, mediaType) {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('Chưa có API key. Vào ⚙️ Cài đặt để nhập Gemini API key.')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

  const result = await model.generateContent([
    {
      inlineData: { data: imageBase64, mimeType: mediaType }
    },
    `Đây là ảnh hóa đơn cho thuê trang phục. Trích xuất thông tin và trả về JSON thuần (không markdown, không giải thích):
{"customerName":"","phone":"","rentDate":"YYYY-MM-DD","returnDate":"YYYY-MM-DD","totalAmount":0,"notes":""}

- phone: 10 số bắt đầu bằng 0
- totalAmount: số nguyên (VND), không có ký hiệu tiền tệ
- notes: ghi chú, mã đồ, số đo, đặt cọc...
- Nếu không tìm thấy trường nào: để chuỗi rỗng hoặc 0`
  ])

  let text
  try {
    text = result.response.text().trim()
  } catch (e) {
    const msg = e?.message || ''
    if (msg.includes('429') || msg.includes('quota') || msg.includes('Quota'))
      throw new Error('Vượt giới hạn miễn phí. Thử lại sau vài phút.')
    if (msg.includes('API key') || msg.includes('401') || msg.includes('403'))
      throw new Error('API key không hợp lệ. Kiểm tra lại trong ⚙️ Cài đặt.')
    throw new Error('Lỗi kết nối Gemini. Kiểm tra mạng và thử lại.')
  }

  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
    throw new Error('Không đọc được dữ liệu từ ảnh. Hãy thử ảnh rõ hơn.')
  }
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
