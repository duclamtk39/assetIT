import assert from 'node:assert/strict'
import test from 'node:test'
import { PeopleService } from '../src/modules/people/people.service'

test('only Admin and IT may manage asset recipients', () => {
  const service = new PeopleService({} as any)
  assert.doesNotThrow(() => service.assertManager({ id: 'admin', role: 'ADMIN' }))
  assert.doesNotThrow(() => service.assertManager({ id: 'it', role: 'IT' }))
  assert.throws(() => service.assertManager({ id: 'user', role: 'USER' }), /Admin hoặc IT/)
})

test('HCNS recipient lookup is constrained to its department', async () => {
  let capturedWhere: any
  const db = {
    person: {
      findMany: ({ where }: any) => {
        capturedWhere = where
        return Promise.resolve([])
      },
      count: () => Promise.resolve(0),
    },
    $transaction: (values: Promise<unknown>[]) => Promise.all(values),
  }
  const service = new PeopleService(db as any)
  await service.list({ page: 1, limit: 100 } as any, true, { id: 'hr', role: 'HCNS', departmentId: 'department-hr' })
  assert.equal(capturedWhere.departmentId, 'department-hr')
  assert.equal(capturedWhere.status, 'ACTIVE')
})

const personWithCounts = (counts: Record<string, number> = {}) => ({
  id: 'p1',
  employeeCode: '001470',
  fullName: 'Abe Satoshi',
  email: 'satoshi_abe@tinhvan.com',
  jobTitle: 'Cố vấn cao cấp',
  departmentId: 'd1',
  source: 'LOCAL',
  status: 'ACTIVE',
  _count: {
    currentAssets: 0,
    assignments: 0,
    inventoryExpectedItems: 0,
    inventoryObservedItems: 0,
    digitalAssignments: 0,
    managedDepartments: 0,
    ...counts,
  },
})

test('a profile nothing points at is deleted with an audit snapshot', async () => {
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
    person: {
      delete: async () => {
        order.push('delete')
        return {}
      },
    },
  }
  const db = { person: { findUnique: async () => personWithCounts() }, $transaction: (work: any) => work(tx) }
  const service = new PeopleService(db as any)
  assert.deepEqual(await service.remove('p1', { id: 'admin', role: 'ADMIN' }), { success: true })
  assert.deepEqual(order, ['audit', 'delete'])
  assert.equal(audited.action, 'PERSON_DELETED')
  assert.equal(audited.oldValues.employeeCode, '001470')
})

test('a profile an asset handover still names is refused, and the reply says what holds it', async () => {
  // The foreign keys are Restrict because deleting the row would leave a handover recorded against
  // nobody. The message has to name the holder, or the reader has no way to know that deactivating
  // is the answer.
  const db = {
    person: { findUnique: async () => personWithCounts({ assignments: 3, currentAssets: 1 }) },
    $transaction: async () => assert.fail('must not reach the transaction'),
  }
  const service = new PeopleService(db as any)
  await assert.rejects(
    () => service.remove('p1', { id: 'admin', role: 'ADMIN' }),
    (error: Error) => {
      assert.match(error.message, /1 tài sản đang giữ/)
      assert.match(error.message, /3 phiếu cấp phát/)
      assert.match(error.message, /Vô hiệu hóa/)
      return true
    },
  )
})

test('inventory lines and licence allocations block a delete just as assignments do', async () => {
  for (const counts of [
    { inventoryExpectedItems: 2 },
    { inventoryObservedItems: 1 },
    { digitalAssignments: 4 },
    { managedDepartments: 1 },
  ]) {
    const db = {
      person: { findUnique: async () => personWithCounts(counts) },
      $transaction: async () => assert.fail('must not reach the transaction'),
    }
    await assert.rejects(
      () => new PeopleService(db as any).remove('p1', { id: 'admin', role: 'ADMIN' }),
      /Vô hiệu hóa/,
      JSON.stringify(counts),
    )
  }
})

test('only an administrator can delete a profile', async () => {
  const db = { person: { findUnique: async () => assert.fail('role is checked first') } }
  await assert.rejects(() => new PeopleService(db as any).remove('p1', { id: 'it', role: 'IT' }), /Chỉ Admin/)
})
