import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source=fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8')

test('vendor workflow separates lifecycle from calculated evaluation result',()=>{
  assert.match(source,/Trạng thái sử dụng/)
  assert.match(source,/Kết quả đánh giá/)
  assert.match(source,/Lưu & đánh giá/)
  assert.match(source,/lifecycleStatus/)
  assert.match(source,/Kết quả được tính từ phiếu chấm điểm, không nhập thủ công/)
})

test('vendor scorecard exposes six risk-based ISO criteria',()=>{
  for(const criterion of ['Chất lượng & đúng đặc tả','Giao hàng & hỗ trợ','An toàn thông tin','Pháp lý & tuân thủ','Rủi ro & liên tục cung ứng','Đạo đức & bền vững'])assert.ok(source.includes(criterion),`missing criterion: ${criterion}`)
})
