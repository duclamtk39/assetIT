import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'

@Injectable()
export class DirectoryCryptoService {
  private key() {
    let raw = process.env.DIRECTORY_ENCRYPTION_KEY?.trim()
    const file = process.env.DATA_ENCRYPTION_KEY_FILE
    if (!raw && file) raw = readFileSync(file, 'utf8').trim()
    if (!raw)
      throw new ServiceUnavailableException('Chưa cấu hình DIRECTORY_ENCRYPTION_KEY cho dịch vụ đồng bộ danh tính')
    const key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
    if (key.length !== 32)
      throw new ServiceUnavailableException('DIRECTORY_ENCRYPTION_KEY phải là 32 byte dạng Base64 hoặc 64 ký tự hex')
    return key
  }
  encrypt(value: string) {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.key(), iv)
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`
  }
  decrypt(value: string) {
    const parts = value.split('.')
    const [version, iv, tag, data] = parts
    if (version !== 'v1' || !iv || !tag || !data)
      throw new ServiceUnavailableException('Secret đồng bộ có định dạng không hợp lệ')
    const decodeCanonical = (segment: string) => {
      const decoded = Buffer.from(segment, 'base64url')
      if (decoded.toString('base64url') !== segment)
        throw new ServiceUnavailableException('Directory secret is not canonical Base64URL')
      return decoded
    }
    const ivBytes = decodeCanonical(iv),
      tagBytes = decodeCanonical(tag),
      dataBytes = decodeCanonical(data)
    if (parts.length !== 4 || ivBytes.length !== 12 || tagBytes.length !== 16)
      throw new ServiceUnavailableException('Directory secret has an invalid encrypted payload')
    const decipher = createDecipheriv('aes-256-gcm', this.key(), ivBytes)
    decipher.setAuthTag(tagBytes)
    return Buffer.concat([decipher.update(dataBytes), decipher.final()]).toString('utf8')
  }
}
