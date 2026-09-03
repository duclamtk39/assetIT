import assert from 'node:assert/strict'
import test from 'node:test'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { VendorDto } from '../src/modules/vendors/vendors.dto'
import { VendorsController } from '../src/modules/vendors/vendors.controller'

const vendorBody = {
  code: 'ncc-5501',
  name: 'Hà Nội Computer',
  taxCode: '',
  category: 'Máy tính & máy chủ',
  contact: 'Anh Long',
  email: 'longnv2@tinhvan.com',
  phone: '098999789',
  address: 'Hà Nội',
  certifications: 'ISO 9001:2015',
  status: 'Chưa đánh giá',
  lastEvaluation: '',
  score: 0,
  scores: {},
  notes: '',
}

test('new vendor accepts an empty optional evaluation date', async () => {
  const dto = plainToInstance(VendorDto, vendorBody)
  const errors = await validate(dto)

  assert.equal(errors.length, 0)
  assert.equal(dto.lastEvaluation, undefined)
})

test('new vendor cannot be approved before an ISO evaluation exists', async () => {
  let saved: any
  const db = { vendor: { create: async ({ data }: any) => { saved = data; return data } } }
  const controller = new VendorsController(db as any)

  await controller.create({ ...vendorBody, status: 'Đã phê duyệt', lastEvaluation: undefined } as VendorDto, { authUser: { id: 'admin', role: 'ADMIN' } } as any)

  assert.equal(saved.code, 'NCC-5501')
  assert.equal(saved.status, 'Chưa đánh giá')
  assert.equal(saved.lastEvaluation, null)
  assert.equal(saved.score, 0)
  assert.deepEqual(saved.scores, {})
})

test('evaluated vendor score and approval are calculated on the server', async () => {
  let saved: any
  const db = { vendor: { create: async ({ data }: any) => { saved = data; return data } } }
  const controller = new VendorsController(db as any)

  await controller.create({ ...vendorBody, status: 'Cần cải thiện', lastEvaluation: '2026-09-03', score: 1, scores: { quality: 90, delivery: 85, security: 90, compliance: 90, continuity: 80, sustainability: 80 } } as VendorDto, { authUser: { id: 'admin', role: 'ADMIN' } } as any)

  assert.equal(saved.status, 'Đã phê duyệt')
  assert.equal(saved.score, 87)
  assert.equal(saved.lastEvaluation.toISOString().slice(0, 10), '2026-09-03')
})

test('evaluated vendor requires a complete zero-to-one-hundred scorecard', async () => {
  const db = { vendor: { create: async ({ data }: any) => data } }
  const controller = new VendorsController(db as any)

  await assert.rejects(
    () => controller.create({ ...vendorBody, lastEvaluation: '2026-09-03', scores: { quality: 90 } } as VendorDto, { authUser: { id: 'admin', role: 'ADMIN' } } as any),
    /đầy đủ.*0–100/,
  )
})
