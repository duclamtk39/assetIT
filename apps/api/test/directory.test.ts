import assert from 'node:assert/strict'
import test from 'node:test'
import { DirectoryCryptoService } from '../src/modules/directory/directory-crypto.service'
import { DirectoryService } from '../src/modules/directory/directory.service'

test('directory secret encryption is authenticated and reversible', () => {
  const previous = process.env.DIRECTORY_ENCRYPTION_KEY
  process.env.DIRECTORY_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
  try {
    const crypto = new DirectoryCryptoService()
    const encrypted = crypto.encrypt('not-a-real-secret')
    assert.notEqual(encrypted, 'not-a-real-secret')
    assert.equal(crypto.decrypt(encrypted), 'not-a-real-secret')
    const parts = encrypted.split('.')
    const tampered = Buffer.from(parts[3], 'base64url')
    tampered[0] ^= 1
    parts[3] = tampered.toString('base64url')
    assert.throws(() => crypto.decrypt(parts.join('.')))
  } finally {
    if (previous === undefined) delete process.env.DIRECTORY_ENCRYPTION_KEY
    else process.env.DIRECTORY_ENCRYPTION_KEY = previous
  }
})

test('LDAP configuration blocks clear-text bind by default', () => {
  const service = new DirectoryService({} as any, {} as any)
  delete process.env.ALLOW_INSECURE_LDAP
  assert.throws(
    () =>
      (service as any).validateConfiguration('LDAP', {
        ldapUrl: 'ldap://ad.example.test:389',
        baseDn: 'dc=example,dc=test',
        bindDn: 'cn=reader,dc=example,dc=test',
        userFilter: '(objectClass=user)',
        useTls: false,
      }),
    /mã hóa bị chặn/,
  )
})

test('Microsoft Graph adapter reads users and mapped group membership', async () => {
  const service = new DirectoryService({} as any, {} as any)
  const original = globalThis.fetch
  globalThis.fetch = async (input: any) => {
    const url = String(input)
    if (url.includes('oauth2/v2.0/token'))
      return new Response(JSON.stringify({ access_token: 'test-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    if (url.includes('/users?'))
      return new Response(
        JSON.stringify({
          value: [
            {
              id: 'user-1',
              displayName: 'Test User',
              userPrincipalName: 'test@example.com',
              mail: 'test@example.com',
              employeeId: 'NV-1',
              department: 'IT',
              accountEnabled: true,
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    if (url.includes('/groups?'))
      return new Response(JSON.stringify({ value: [{ id: 'group-1', displayName: 'IT-Asset-Admins' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    if (url.includes('/groups/group-1/members'))
      return new Response(JSON.stringify({ value: [{ id: 'user-1' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } })
  }
  try {
    const users = await (service as any).graphUsers(
      {
        tenantId: '11111111-1111-1111-1111-111111111111',
        clientId: '22222222-2222-2222-2222-222222222222',
        groupMapping: { 'IT-Asset-Admins': 'ADMIN' },
      },
      'secret',
    )
    assert.equal(users.length, 1)
    assert.deepEqual(users[0].groups, ['IT-Asset-Admins'])
    assert.equal(users[0].email, 'test@example.com')
  } finally {
    globalThis.fetch = original
  }
})
