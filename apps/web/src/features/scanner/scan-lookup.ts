import type { Asset } from '../../types'

export const normalizeScannedValue = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9@.]+/g, ' ')
    .trim()

const searchableValues = (asset: Asset) => [
  asset.code,
  asset.barcode || asset.code,
  asset.qrCode || asset.code,
  asset.serial,
]

export function findAssetByScannedValue(assets: Asset[], rawValue: string) {
  const value = normalizeScannedValue(rawValue)
  if (!value) return null
  return assets.find(asset => searchableValues(asset).some(field => normalizeScannedValue(field) === value)) || null
}
