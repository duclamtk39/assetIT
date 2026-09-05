import { createHash } from 'node:crypto'
import type { AgentInventoryDto } from './discovery.dto'

type Candidate = { id: string; systemUuid: string | null; serialNumber: string | null; macAddress: string | null }
type MatchEvidence = { systemUuid: string | null; serial: string | null; mac: string | null }
export type MatchDecision = {
  status: 'PENDING' | 'MATCHED' | 'CONFLICT'
  suggestedAssetId: string | null
  confidence: number
  reason: string | null
}

const normalize = (value?: string | null) => value?.trim().toLowerCase() || ''
const invalidHardwareIdentifiers = new Set([
  'default string',
  'to be filled by o.e.m.',
  'to be filled by oem',
  'system serial number',
  'unknown',
  'none',
  'not specified',
  'n/a',
  'na',
  '0',
  '00000000-0000-0000-0000-000000000000',
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
])
export const sanitizeHardwareIdentifier = (value?: string | null) => {
  const trimmed = value?.trim() || ''
  return invalidHardwareIdentifiers.has(trimmed.toLowerCase()) ? '' : trimmed
}

export function inventoryFingerprint(body: AgentInventoryDto) {
  const hardware = body.device.hardware
  const parts = [
    normalize(sanitizeHardwareIdentifier(hardware.system_uuid)),
    normalize(sanitizeHardwareIdentifier(hardware.serial_number)),
    normalize(hardware.manufacturer),
    normalize(hardware.model),
  ]
  const macs = body.device.network_interfaces
    .map(value => normalize(value.mac_address))
    .filter(Boolean)
    .sort()
  parts.push(...macs)
  if (parts.join('') === '')
    parts.push(normalize(body.device.hostname), normalize(body.device.os.family), normalize(body.device.os.arch))
  return createHash('sha256').update(parts.join('|')).digest('hex')
}

export function classifyCandidates(candidates: Candidate[], evidence: MatchEvidence): MatchDecision {
  if (candidates.length === 0) return { status: 'PENDING', suggestedAssetId: null, confidence: 0, reason: null }
  if (candidates.length > 1)
    return {
      status: 'CONFLICT',
      suggestedAssetId: null,
      confidence: 0,
      reason: 'System UUID, serial hoặc MAC đang trỏ tới nhiều tài sản; IT phải chọn bản ghi chính xác.',
    }
  const candidate = candidates[0]
  const confidence =
    evidence.systemUuid && normalize(candidate.systemUuid) === normalize(evidence.systemUuid)
      ? 99
      : evidence.serial && normalize(candidate.serialNumber) === normalize(evidence.serial)
        ? 95
        : 80
  return { status: 'MATCHED', suggestedAssetId: candidate.id, confidence, reason: null }
}
