export const getApiKey = () => localStorage.getItem('gemini_api_key') || ''
export const saveApiKey = (key) => localStorage.setItem('gemini_api_key', key.trim())

export async function extractInvoiceData(imageBase64, mediaType) {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('Chưa có API key. Vào ⚙️ Cài đặt để nhập Gemini API key.')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-8b:generateContent?key=${apiKey}`

  const body = {
    contents: [{
      parts: [
        { inline_data: { mime_type: mediaType, data: imageBase64 } },
        {
          text: `Đây là ảnh hóa đơn cho thuê trang phục. Trích xuất thông tin và trả về JSON thuần (không markdown, không giải thích):
{"customerName":"","phone":"","rentDate":"YYYY-MM-DD","returnDate":"YYYY-MM-DD","totalAmount":0,"notes":""}

- phone: 10 số bắt đầu bằng 0
- totalAmount: số nguyên (VND), không có ký hiệu tiền tệ
- notes: ghi chú, mã đồ, số đo, đặt cọc...
- Nếu không tìm thấy trường nào: để chuỗi rỗng hoặc 0`
        }
      ]
    }]
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const status = res.status
    if (status === 429) throw new Error('Vượt giới hạn miễn phí. Thử lại sau vài phút.')
    if (status === 401 || status === 403) throw new Error('API key không hợp lệ. Kiểm tra lại trong ⚙️ Cài đặt.')
    if (status === 404) throw new Error('Model không tìm thấy. Kiểm tra lại API key có quyền truy cập Gemini không.')
    throw new Error(err?.error?.message || `Lỗi ${status}. Thử lại sau.`)
  }

  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
  if (!text) throw new Error('Gemini không trả về dữ liệu. Thử lại.')

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
