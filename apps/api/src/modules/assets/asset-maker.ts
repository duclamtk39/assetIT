import { BadRequestException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'

/**
 * Manufacturer and model are typed as free text in the asset form, but the register stores them as
 * rows in manufacturers and asset_models. The form's two fields were never sent at all, so whatever
 * was typed into them was dropped on save; this is what turns the text into those rows.
 */

/** Collapses whitespace so "HP", " HP " and "H P"-with-a-double-space are not three manufacturers. */
export function cleanName(value?: string | null) {
  return (value || '').replace(/\s+/g, ' ').trim()
}

export type MakerIntent = { kind: 'keep' } | { kind: 'clear' } | { kind: 'set'; manufacturer: string; model?: string }

/**
 * What the request asks for. A field that is absent leaves the record alone; one sent empty clears it.
 * That distinction is what lets a metadata edit that never touched these fields avoid wiping them.
 */
export function makerIntent(body: { manufacturerName?: string | null; modelName?: string | null }): MakerIntent {
  const manufacturerSent = body.manufacturerName !== undefined
  const modelSent = body.modelName !== undefined
  if (!manufacturerSent && !modelSent) return { kind: 'keep' }
  const manufacturer = cleanName(body.manufacturerName)
  const model = cleanName(body.modelName)
  // A model belongs to a manufacturer - asset_models.manufacturerId is required - so a model on its
  // own has nowhere to be stored. Saying so beats silently dropping it a second time.
  if (model && !manufacturer) throw new BadRequestException('Nhập hãng sản xuất trước khi nhập model')
  if (!manufacturer) return { kind: 'clear' }
  return { kind: 'set', manufacturer, model: model || undefined }
}

type Tx = Prisma.TransactionClient

/**
 * Finds a manufacturer by name regardless of case, creating it only when none exists. Matching
 * case-insensitively is what stops "Dell" and "DELL" becoming two manufacturers that split every
 * report by vendor.
 */
async function findOrCreateManufacturer(tx: Tx, name: string) {
  const existing = await tx.manufacturer.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } })
  if (existing) return existing
  return tx.manufacturer.create({ data: { name } })
}

async function findOrCreateModel(tx: Tx, manufacturerId: string, categoryId: string, name: string) {
  const existing = await tx.assetModel.findFirst({
    where: { manufacturerId, name: { equals: name, mode: 'insensitive' } },
  })
  if (existing) return existing
  return tx.assetModel.create({ data: { manufacturerId, categoryId, name } })
}

/** The foreign keys to write, or undefined when the request left manufacturer and model alone. */
export async function resolveMaker(
  tx: Tx,
  intent: MakerIntent,
  categoryId: string,
): Promise<{ manufacturerId: string | null; modelId: string | null } | undefined> {
  if (intent.kind === 'keep') return undefined
  if (intent.kind === 'clear') return { manufacturerId: null, modelId: null }
  const manufacturer = await findOrCreateManufacturer(tx, intent.manufacturer)
  const model = intent.model ? await findOrCreateModel(tx, manufacturer.id, categoryId, intent.model) : undefined
  return { manufacturerId: manufacturer.id, modelId: model?.id ?? null }
}
