export const getApiKey = () => localStorage.getItem('groq_api_key') || ''
export const saveApiKey = (key) => localStorage.setItem('groq_api_key', key.trim())

export async function extractInvoiceData(imageBase64, mediaType) {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('Chưa có API key. Vào ⚙️ Cài đặt để nhập Groq API key.')

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mediaType};base64,${imageBase64}` }
          },
          {
            type: 'text',
            text: `Đây là ảnh hóa đơn cho thuê trang phục. Trích xuất thông tin và trả về JSON thuần (không markdown, không giải thích):
{"customerName":"","phone":"","rentDate":"YYYY-MM-DD","returnDate":"YYYY-MM-DD","totalAmount":0,"notes":""}

Năm hiện tại là 2026. Nếu chỉ thấy ngày/tháng thì thêm năm 2026.
- phone: 10 số bắt đầu bằng 0
- totalAmount: số nguyên (VND), không ký hiệu tiền tệ
- notes: ghi chú, mã đồ, số đo, đặt cọc...
- Nếu không tìm thấy: để chuỗi rỗng hoặc 0`
          }
        ]
      }]
    })
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const status = res.status
    if (status === 429) throw new Error('Vượt giới hạn. Thử lại sau vài phút.')
    if (status === 401) throw new Error('API key không hợp lệ. Kiểm tra lại trong ⚙️ Cài đặt.')
    throw new Error(err?.error?.message || `Lỗi ${status}. Thử lại sau.`)
  }

  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('Không nhận được phản hồi. Thử lại.')

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
