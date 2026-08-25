import assert from 'node:assert/strict'
import test from 'node:test'
import {featureTranslations} from '../src/i18n/feature-catalog'
import {translateUiText} from '../src/i18n/runtime'

test('VI/EN catalog covers every primary business module',()=>{
  const expected:Record<string,string>={
    'Quản lý cấp phát tài sản':'Asset issue management',
    'Quản lý nhà cung cấp':'Supplier management',
    'License, SSL & Domain':'Licenses, SSL & Domains',
    'Quản lý sự cố':'Incident management',
    'Khám phá thiết bị & Endpoint Agent':'Device discovery & Endpoint Agent',
    'Kiểm kê tài sản':'Asset inventory audit',
    'Danh bạ người nhận tài sản':'Asset recipient directory',
    'Người dùng hệ thống':'System users',
    'Đánh giá rủi ro CNTT':'IT Risk Assessment',
  }
  for(const [source,target] of Object.entries(expected))assert.equal(translateUiText(source,'en-US'),target)
})

test('Vietnamese remains the canonical source and unknown business data is not changed',()=>{
  assert.equal(translateUiText('Quản lý nhà cung cấp','vi-VN'),'Quản lý nhà cung cấp')
  assert.equal(translateUiText('MacBook Pro 14” M3','en-US'),'MacBook Pro 14” M3')
  assert.equal(translateUiText('Nguyễn Văn A','en-US'),'Nguyễn Văn A')
})

test('default installation placeholders and report route labels are localized',()=>{
  assert.equal(translateUiText('Công ty của bạn','en-US'),'Your company')
  assert.equal(translateUiText('Quản trị viên','en-US'),'Administrator')
  assert.equal(translateUiText('Báo cáo','en-US'),'Reports')
})

test('dynamic inventory and duration labels are localized without changing business values',()=>{
  assert.equal(translateUiText('Đợt KK-2026-08 · Văn phòng Hà Nội · 18/08/2026 đến 31/08/2026','en-US'),'Inventory session KK-2026-08 · Văn phòng Hà Nội · 18/08/2026 to 31/08/2026')
  assert.equal(translateUiText('5 giờ 11 phút','en-US'),'5h 11m')
})

test('feature translation sources are unique',()=>{
  const sources=featureTranslations.map(([source])=>source)
  assert.equal(new Set(sources).size,sources.length)
})
