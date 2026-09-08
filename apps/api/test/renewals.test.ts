import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertTypeFields,
  availableQuantity,
  daysUntil,
  entitlementStatus,
} from '../src/modules/renewals/renewals.rules'
import { nextNotificationAttempt, notificationRecipients } from '../src/modules/renewals/renewal-notification.rules'
import { RenewalsService } from '../src/modules/renewals/renewals.service'

test('domain and SSL records require an identity that can be renewed', () => {
  assert.throws(() => assertTypeFields('DOMAIN', {}), /DOMAIN_NAME_REQUIRED/)
  assert.throws(() => assertTypeFields('SSL_CERTIFICATE', {}), /CERTIFICATE_NAME_REQUIRED/)
  assert.doesNotThrow(() => assertTypeFields('DOMAIN', { domainName: 'company.vn' }))
  assert.doesNotThrow(() => assertTypeFields('SSL_CERTIFICATE', { commonName: '*.company.vn' }))
})

test('available license quantity never becomes negative', () => {
  assert.equal(availableQuantity(100, 72), 28)
  assert.equal(availableQuantity(10, 12), 0)
})

test('expiry status follows the 30-day renewal window', () => {
  const now = new Date(2026, 7, 25)
  assert.equal(daysUntil(new Date(2026, 7, 25), now), 0)
  assert.equal(entitlementStatus(new Date(2026, 9, 1), now), 'ACTIVE')
  assert.equal(entitlementStatus(new Date(2026, 8, 10), now), 'EXPIRING')
  assert.equal(entitlementStatus(new Date(2026, 7, 24), now), 'EXPIRED')
})

test('renewal email recipients are normalized and deduplicated', () => {
  assert.deepEqual(notificationRecipients(['IT@company.vn', ' it@company.vn '], true, 'owner@company.vn'), [
    'it@company.vn',
    'owner@company.vn',
  ])
  assert.deepEqual(notificationRecipients([], false, 'owner@company.vn'), [])
})

test('failed renewal emails use a bounded exponential retry', () => {
  const now = Date.UTC(2026, 7, 25)
  assert.equal(nextNotificationAttempt(1, now).getTime(), now + 2 * 60_000)
  assert.equal(nextNotificationAttempt(10, now).getTime(), now + 60 * 60_000)
})

const entitlement = (overrides: Record<string, unknown> = {}) => ({
  id: 'ent-1',
  code: 'LIC-001',
  name: 'Microsoft 365 E3',
  type: 'LICENSE',
  status: 'ACTIVE',
  expiryDate: new Date('2026-12-31T00:00:00Z'),
  totalQuantity: 10,
  contractNo: 'HD-01',
  externalProvider: null,
  assignments: [],
  renewals: [],
  ...overrides,
})

test('a licence is deleted even while seats are still allocated', async () => {
  // The register belongs to the administrator. What the allocation rows were there to say - who held
  // what - is written into the audit entry, so the deletion records it rather than losing it.
  let audited: any
  const tx = {
    auditLog: {
      create: async ({ data }: any) => {
        audited = data
        return {}
      },
    },
    digitalRenewal: { deleteMany: async () => ({ count: 0 }) },
    digitalAssignment: { deleteMany: async () => ({ count: 1 }) },
    digitalEntitlement: { delete: async () => ({}) },
  }
  const db = {
    digitalEntitlement: {
      findUnique: async () =>
        entitlement({
          assignments: [{ status: 'ACTIVE', quantity: 2, person: { fullName: 'Nguyễn Đức Lâm' }, revokedAt: null }],
        }),
    },
    $transaction: (work: any) => work(tx),
  }
  const service = new RenewalsService(db as any)
  assert.deepEqual(await service.remove('ent-1', { id: 'admin', role: 'ADMIN' } as any), { success: true })
  assert.equal(audited.oldValues.assignments[0].status, 'ACTIVE')
  assert.equal(audited.oldValues.assignments[0].person, 'Nguyễn Đức Lâm')
})

test('a provider-synced licence can be cleared out too', async () => {
  const tx = {
    auditLog: { create: async () => ({}) },
    digitalRenewal: { deleteMany: async () => ({ count: 0 }) },
    digitalAssignment: { deleteMany: async () => ({ count: 0 }) },
    digitalEntitlement: { delete: async () => ({}) },
  }
  const db = {
    digitalEntitlement: { findUnique: async () => entitlement({ externalProvider: 'MICROSOFT' }) },
    $transaction: (work: any) => work(tx),
  }
  const service = new RenewalsService(db as any)
  assert.deepEqual(await service.remove('ent-1', { id: 'admin', role: 'ADMIN' } as any), { success: true })
})

test('deleting a licence records its renewal history and clears its children first', async () => {
  const order: string[] = []
  let audited: any
  const tx = {
    auditLog: {
      create: async ({ data }: any) => {
        order.push('audit')
        audited = data
        return {}
      },
    },
    digitalRenewal: {
      deleteMany: async () => {
        order.push('renewals')
        return { count: 1 }
      },
    },
    digitalAssignment: {
      deleteMany: async () => {
        order.push('assignments')
        return { count: 1 }
      },
    },
    digitalEntitlement: {
      delete: async () => {
        order.push('entitlement')
        return {}
      },
    },
  }
  const db = {
    digitalEntitlement: {
      findUnique: async () =>
        entitlement({
          assignments: [
            {
              status: 'REVOKED',
              quantity: 1,
              person: { fullName: 'Vũ Tuấn Anh' },
              revokedAt: new Date('2026-08-01T00:00:00Z'),
            },
          ],
          renewals: [
            {
              renewalDate: new Date('2026-01-01T00:00:00Z'),
              previousExpiryDate: new Date('2025-12-31T00:00:00Z'),
              newExpiryDate: new Date('2026-12-31T00:00:00Z'),
              amount: null,
            },
          ],
        }),
    },
    $transaction: (work: any) => work(tx),
  }
  const service = new RenewalsService(db as any)
  assert.deepEqual(await service.remove('ent-1', { id: 'admin', role: 'ADMIN' } as any), { success: true })
  assert.deepEqual(order, ['audit', 'renewals', 'assignments', 'entitlement'])
  assert.equal(audited.action, 'ENTITLEMENT_DELETED')
  assert.equal(audited.oldValues.code, 'LIC-001')
  assert.equal(audited.oldValues.renewals[0].newExpiryDate, '2026-12-31')
  assert.equal(audited.oldValues.assignments[0].person, 'Vũ Tuấn Anh')
})

test('only an administrator can delete a licence', async () => {
  const db = { digitalEntitlement: { findUnique: async () => assert.fail('role is checked first') } }
  await assert.rejects(
    () => new RenewalsService(db as any).remove('ent-1', { id: 'it', role: 'IT' } as any),
    /Chỉ Admin/,
  )
})
