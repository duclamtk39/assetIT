const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

export function validateImportPayload(payload: Record<string, unknown>) {
  const errors: string[] = []
  for (const field of ['assetTag', 'name', 'barcode', 'categoryId', 'warehouseId'])
    if (!text(payload[field])) errors.push(`${field} là bắt buộc`)
  for (const field of ['categoryId', 'warehouseId', 'modelId', 'manufacturerId'])
    if (payload[field] && !uuid.test(text(payload[field]))) errors.push(`${field} không đúng định dạng UUID`)
  if (
    payload.purchaseCost !== undefined &&
    (!Number.isFinite(Number(payload.purchaseCost)) || Number(payload.purchaseCost) < 0)
  )
    errors.push('purchaseCost phải là số không âm')
  if (
    payload.warrantyMonths !== undefined &&
    (!Number.isInteger(Number(payload.warrantyMonths)) || Number(payload.warrantyMonths) < 0)
  )
    errors.push('warrantyMonths phải là số nguyên không âm')
  if (payload.purchaseDate && Number.isNaN(Date.parse(text(payload.purchaseDate))))
    errors.push('purchaseDate không hợp lệ')
  return errors
}
export const isUuid = (value: string) => uuid.test(value)
