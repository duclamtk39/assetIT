import assert from 'node:assert/strict'
import test from 'node:test'
import { CategoriesService } from '../src/modules/categories/categories.service'

const admin = { id: 'admin-id', role: 'ADMIN' }

test('category deletion is blocked after business data references it', async () => {
  const db = {
    assetCategory: {
      findUnique: async () => ({
        id: 'category-id',
        code: 'LAPTOP',
        name: 'Laptop',
        status: 'ACTIVE',
        _count: { assets: 1, children: 0, models: 0, inventorySessions: 0 },
      }),
    },
  }
  const service = new CategoriesService(db as never)
  await assert.rejects(() => service.remove('category-id', admin), /không thể xóa/)
})

test('unused category can be deleted and the action is audited', async () => {
  const actions: string[] = []
  const tx = {
    assetCategory: {
      delete: async () => {
        actions.push('delete')
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        actions.push(data.action)
      },
    },
  }
  const db = {
    assetCategory: {
      findUnique: async () => ({
        id: 'category-id',
        code: 'CAMERA',
        name: 'Camera',
        status: 'ACTIVE',
        _count: { assets: 0, children: 0, models: 0, inventorySessions: 0 },
      }),
    },
    $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
  }
  const service = new CategoriesService(db as never)
  assert.deepEqual(await service.remove('category-id', admin), { success: true })
  assert.deepEqual(actions, ['delete', 'ASSET_CATEGORY_DELETED'])
})

test('category with active children cannot be deactivated', async () => {
  const db = {
    assetCategory: {
      findUnique: async () => ({ id: 'category-id', code: 'IT', name: 'Thiết bị IT', status: 'ACTIVE' }),
      count: async () => 1,
      findFirst: async () => null,
    },
  }
  const service = new CategoriesService(db as never)
  await assert.rejects(() => service.update('category-id', { status: 'INACTIVE' }, admin), /nhóm con/)
})

test('only administrators can manage asset categories', () => {
  const service = new CategoriesService({} as never)
  assert.throws(() => service.assertAdmin({ id: 'it-user', role: 'IT' }), /Chỉ quản trị viên/)
})
