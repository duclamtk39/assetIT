import { ForbiddenException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { UpdateSettingDto } from './settings.dto'

@Injectable()
export class SettingsService {
  constructor(private readonly db: PrismaService) {}
  async list() {
    const rows = await this.db.applicationSetting.findMany({
      where: { key: { in: ['branding', 'email', 'regional'] } },
    })
    return Object.fromEntries(rows.map(row => [row.key, row.value]))
  }
  async publicIdentity() {
    const rows = await this.db.applicationSetting.findMany({ where: { key: { in: ['branding', 'regional'] } } })
    const configured = Object.fromEntries(rows.map(row => [row.key, row.value])) as Record<string, unknown>
    return {
      branding: this.pick(configured.branding, ['appName', 'companyName', 'tagline', 'logoDataUrl', 'primaryColor']),
      regional: this.pick(configured.regional, ['language', 'timezone', 'dateFormat', 'timeFormat', 'firstDayOfWeek']),
    }
  }
  private pick(value: unknown, keys: string[]) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    const source = value as Record<string, unknown>
    return Object.fromEntries(keys.filter(key => source[key] !== undefined).map(key => [key, source[key]]))
  }
  async update(body: UpdateSettingDto, actor: { id: string; role: string }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Chỉ Admin được thay đổi cấu hình hệ thống')
    const value = body.value as Prisma.InputJsonValue
    const row = await this.db.applicationSetting.upsert({
      where: { key: body.key },
      create: { key: body.key, value, updatedBy: actor.id },
      update: { value, updatedBy: actor.id },
    })
    await this.db.auditLog.create({
      data: {
        userId: actor.id,
        action: 'APPLICATION_SETTING_UPDATED',
        entityType: 'ApplicationSetting',
        newValues: { key: body.key } as Prisma.InputJsonValue,
      },
    })
    return row.value
  }
}
