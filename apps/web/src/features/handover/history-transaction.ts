import type { AssetTransaction, TransactionType } from '../../types'

const actionTypes: Record<string, TransactionType> = {
  CREATED: 'Nhập kho',
  ASSIGNED: 'Cấp phát',
  RETURNED: 'Thu hồi',
  TRANSFERRED: 'Điều chuyển',
}

export function historyToTransaction(item: any, toNumericId: (value: string) => number): AssetTransaction | null {
  const baseType = actionTypes[item.action]
  if (!baseType) return null

  const assignment = item.assignment
  const type =
    item.action === 'ASSIGNED' && String(item.description).toLocaleLowerCase('vi').includes('mượn')
      ? 'Cho mượn'
      : baseType

  return {
    id: toNumericId(item.id),
    assetId: toNumericId(item.asset.id),
    assetCode: item.asset.assetTag,
    assetName: item.asset.name,
    type,
    from: item.fromLocation?.name || assignment?.location?.name || 'Hệ thống',
    to: assignment?.assignedTo?.fullName || item.toLocation?.name || item.description,
    performedBy: item.actor?.fullName || 'Hệ thống',
    date: item.createdAt,
    note: item.description,
    condition: assignment?.conditionOut || undefined,
    dueDate: assignment?.expectedReturnDate || undefined,
    recipientEmail: assignment?.assignedTo?.email || undefined,
    recipientDepartment: assignment?.department?.name || assignment?.assignedTo?.department?.name || undefined,
    handoverLocation: assignment?.location?.name || item.toLocation?.name || undefined,
  }
}
