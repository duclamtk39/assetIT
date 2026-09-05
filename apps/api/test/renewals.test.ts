import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertTypeFields,
  availableQuantity,
  daysUntil,
  entitlementStatus,
} from '../src/modules/renewals/renewals.rules'
import { nextNotificationAttempt, notificationRecipients } from '../src/modules/renewals/renewal-notification.rules'

test('domain and SSL records require an identity that can be renewed', () => {
  assert.throws(() => assertTypeFields('DOMAIN', {}), /DOMAIN_NAME_REQUIRED/)
  assert.throws(() => assertTypeFields('SSL_CERTIFICATE', {}), /CERTIFICATE_NAME_REQUIRED/)
  assert.doesNotThrow(() => assertTypeFields('DOMAIN', { domainName: 'company.vn' }))
  assert.doesNotThrow(() => assertTypeFields('SSL_CERTIFICATE', { commonName: '*.company.vn' }))
})

test('available license quantity never becomes negative', () => {
  assert.equal(availableQuantity(100, 72), 28)
  assert.equal(availableQuantity(10, 12), 0)
})

test('expiry status follows the 30-day renewal window', () => {
  const now = new Date(2026, 7, 25)
  assert.equal(daysUntil(new Date(2026, 7, 25), now), 0)
  assert.equal(entitlementStatus(new Date(2026, 9, 1), now), 'ACTIVE')
  assert.equal(entitlementStatus(new Date(2026, 8, 10), now), 'EXPIRING')
  assert.equal(entitlementStatus(new Date(2026, 7, 24), now), 'EXPIRED')
})

test('renewal email recipients are normalized and deduplicated', () => {
  assert.deepEqual(notificationRecipients(['IT@company.vn', ' it@company.vn '], true, 'owner@company.vn'), [
    'it@company.vn',
    'owner@company.vn',
  ])
  assert.deepEqual(notificationRecipients([], false, 'owner@company.vn'), [])
})

test('failed renewal emails use a bounded exponential retry', () => {
  const now = Date.UTC(2026, 7, 25)
  assert.equal(nextNotificationAttempt(1, now).getTime(), now + 2 * 60_000)
  assert.equal(nextNotificationAttempt(10, now).getTime(), now + 60 * 60_000)
})
