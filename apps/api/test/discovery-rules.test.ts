import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyCandidates,
  inventoryFingerprint,
  sanitizeHardwareIdentifier,
} from '../src/modules/discovery/discovery.rules'

test('fingerprint matches the Agent normalization contract', () => {
  const payload: any = {
    device: {
      hostname: 'PC-01',
      os: { family: 'windows', arch: 'amd64' },
      hardware: { system_uuid: ' ABC ', serial_number: 'SN-01', manufacturer: 'Dell', model: 'Latitude' },
      network_interfaces: [{ mac_address: 'BB' }, { mac_address: 'AA' }],
    },
  }
  const reordered: any = {
    device: { ...payload.device, network_interfaces: [{ mac_address: 'aa' }, { mac_address: 'bb' }] },
  }
  assert.equal(inventoryFingerprint(payload), inventoryFingerprint(reordered))
  assert.equal(inventoryFingerprint(payload).length, 64)
})

test('matching never resolves ambiguous candidates automatically', () => {
  assert.equal(classifyCandidates([], { systemUuid: null, serial: null, mac: null }).status, 'PENDING')
  assert.deepEqual(
    classifyCandidates([{ id: 'asset-1', systemUuid: null, serialNumber: 'SN-01', macAddress: null }], {
      systemUuid: null,
      serial: 'sn-01',
      mac: null,
    }),
    { status: 'MATCHED', suggestedAssetId: 'asset-1', confidence: 95, reason: null },
  )
  assert.equal(
    classifyCandidates(
      [
        { id: 'a', systemUuid: null, serialNumber: null, macAddress: 'AA' },
        { id: 'b', systemUuid: null, serialNumber: null, macAddress: 'AA' },
      ],
      { systemUuid: null, serial: null, mac: 'AA' },
    ).status,
    'CONFLICT',
  )
})

test('system UUID is the strongest discovery evidence', () => {
  const result = classifyCandidates([{ id: 'asset-1', systemUuid: 'UUID-01', serialNumber: null, macAddress: null }], {
    systemUuid: 'uuid-01',
    serial: null,
    mac: null,
  })
  assert.equal(result.confidence, 99)
})

test('OEM placeholder identifiers are not used for matching', () => {
  assert.equal(sanitizeHardwareIdentifier(' Default string '), '')
  assert.equal(sanitizeHardwareIdentifier('To Be Filled By O.E.M.'), '')
  assert.equal(sanitizeHardwareIdentifier('SN-123'), 'SN-123')
})
