import { DigitalEntitlementType } from '@prisma/client'
export const daysUntil = (date: Date, now = new Date()) =>
  Math.ceil(
    (new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86400000,
  )
export const entitlementStatus = (expiryDate: Date, now = new Date()) =>
  daysUntil(expiryDate, now) < 0 ? 'EXPIRED' : daysUntil(expiryDate, now) <= 30 ? 'EXPIRING' : 'ACTIVE'
export function assertTypeFields(type: DigitalEntitlementType, input: { domainName?: string; commonName?: string }) {
  if (type === 'DOMAIN' && !input.domainName) throw new Error('DOMAIN_NAME_REQUIRED')
  if (type === 'SSL_CERTIFICATE' && !input.commonName && !input.domainName) throw new Error('CERTIFICATE_NAME_REQUIRED')
}
export const availableQuantity = (total: number, assigned: number) => Math.max(0, total - assigned)
