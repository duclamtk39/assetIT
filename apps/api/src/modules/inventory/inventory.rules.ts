import { InventoryResult } from '@prisma/client'

export function inventoryResult(
  expectedLocationId: string | null,
  expectedCustodianId: string | null,
  observedLocationId: string | null,
  observedCustodianId: string | null,
  isExpected = true,
): InventoryResult {
  if (!isExpected) return InventoryResult.UNEXPECTED
  if (expectedCustodianId !== observedCustodianId) return InventoryResult.CUSTODIAN_MISMATCH
  if (expectedLocationId !== observedLocationId) return InventoryResult.LOCATION_MISMATCH
  return InventoryResult.MATCHED
}
