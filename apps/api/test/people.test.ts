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
