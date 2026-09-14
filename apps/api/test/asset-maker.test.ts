import assert from 'node:assert/strict'
import test from 'node:test'
import { cleanName, makerIntent, resolveMaker } from '../src/modules/assets/asset-maker'

test('names are normalised so spacing does not create a second manufacturer', () => {
  assert.equal(cleanName('  HP  '), 'HP')
  assert.equal(cleanName('Hewlett   Packard'), 'Hewlett Packard')
  assert.equal(cleanName(undefined), '')
  assert.equal(cleanName(null), '')
})

test('an edit that never sent the fields leaves manufacturer and model alone', () => {
  // Other callers of PATCH - the importer, a status correction - do not send these. Treating absence
  // as "clear" would wipe the vendor off every asset they touch.
  assert.deepEqual(makerIntent({}), { kind: 'keep' })
})

test('fields sent empty clear the link', () => {
  assert.deepEqual(makerIntent({ manufacturerName: '', modelName: '' }), { kind: 'clear' })
  assert.deepEqual(makerIntent({ manufacturerName: '   ' }), { kind: 'clear' })
})

test('a manufacturer with or without a model is set', () => {
  assert.deepEqual(makerIntent({ manufacturerName: ' Dell ', modelName: 'OptiPlex 7010' }), {
    kind: 'set',
    manufacturer: 'Dell',
    model: 'OptiPlex 7010',
  })
  assert.deepEqual(makerIntent({ manufacturerName: 'Dell', modelName: '' }), {
    kind: 'set',
    manufacturer: 'Dell',
    model: undefined,
  })
})

test('a model without a manufacturer is refused rather than dropped again', () => {
  // asset_models.manufacturerId is required, so there is nowhere to store it. Silently discarding it
  // is exactly the bug this replaces.
  assert.throws(() => makerIntent({ manufacturerName: '', modelName: 'ProDesk 400' }), /hãng sản xuất trước/)
  assert.throws(() => makerIntent({ modelName: 'ProDesk 400' }), /hãng sản xuất trước/)
})

const fakeTx = (seed: { manufacturers?: any[]; models?: any[] } = {}) => {
  const manufacturers = [...(seed.manufacturers || [])]
  const models = [...(seed.models || [])]
  const created = { manufacturers: 0, models: 0 }
  const matches = (value: string, where: any) => value.toLowerCase() === where.equals.toLowerCase()
  return {
    created,
    manufacturers,
    models,
    tx: {
      manufacturer: {
        findFirst: async ({ where }: any) => manufacturers.find(row => matches(row.name, where.name)) || null,
        create: async ({ data }: any) => {
          created.manufacturers++
          const row = { id: `m${manufacturers.length + 1}`, ...data }
          manufacturers.push(row)
          return row
        },
      },
      assetModel: {
        findFirst: async ({ where }: any) =>
          models.find(row => row.manufacturerId === where.manufacturerId && matches(row.name, where.name)) || null,
        create: async ({ data }: any) => {
          created.models++
          const row = { id: `md${models.length + 1}`, ...data }
          models.push(row)
          return row
        },
      },
    } as any,
  }
}

test('an existing manufacturer is reused regardless of letter case', async () => {
  // Without this, "Dell" and "DELL" become two vendors and every report by manufacturer splits.
  const fake = fakeTx({ manufacturers: [{ id: 'dell', name: 'Dell' }] })
  const result = await resolveMaker(fake.tx, { kind: 'set', manufacturer: 'DELL' }, 'cat-1')
  assert.deepEqual(result, { manufacturerId: 'dell', modelId: null })
  assert.equal(fake.created.manufacturers, 0)
})

test('an unknown manufacturer and model are created and linked', async () => {
  const fake = fakeTx()
  const result = await resolveMaker(fake.tx, { kind: 'set', manufacturer: 'HP', model: 'ProDesk 400 G9' }, 'cat-pc')
  assert.equal(fake.created.manufacturers, 1)
  assert.equal(fake.created.models, 1)
  assert.equal(result?.manufacturerId, fake.manufacturers[0].id)
  assert.equal(result?.modelId, fake.models[0].id)
  assert.equal(fake.models[0].categoryId, 'cat-pc', 'model phải gắn nhóm tài sản của chính tài sản đó')
  assert.equal(fake.models[0].manufacturerId, fake.manufacturers[0].id)
})

test('the same model name under a different manufacturer is a different model', async () => {
  const fake = fakeTx({
    manufacturers: [
      { id: 'hp', name: 'HP' },
      { id: 'dell', name: 'Dell' },
    ],
    models: [{ id: 'hp-400', manufacturerId: 'hp', name: '400', categoryId: 'c' }],
  })
  const result = await resolveMaker(fake.tx, { kind: 'set', manufacturer: 'Dell', model: '400' }, 'c')
  assert.equal(fake.created.models, 1)
  assert.notEqual(result?.modelId, 'hp-400')
})

test('keep writes nothing and clear nulls both links', async () => {
  const fake = fakeTx()
  assert.equal(await resolveMaker(fake.tx, { kind: 'keep' }, 'c'), undefined)
  assert.deepEqual(await resolveMaker(fake.tx, { kind: 'clear' }, 'c'), { manufacturerId: null, modelId: null })
  assert.equal(fake.created.manufacturers + fake.created.models, 0)
})
