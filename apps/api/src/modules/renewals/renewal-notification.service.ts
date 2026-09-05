import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import * as nodemailer from 'nodemailer'
import { PrismaService } from '../../database/prisma.service'
import { DirectoryCryptoService } from '../directory/directory-crypto.service'
import { RenewalEmailConfigurationDto } from './renewals.dto'
import { nextNotificationAttempt, notificationRecipients } from './renewal-notification.rules'

@Injectable()
export class RenewalNotificationService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout
  private readonly logger = new Logger(RenewalNotificationService.name)
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: DirectoryCryptoService,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => void this.process().catch(error => this.logger.error(this.safe(error))), 60000)
    this.timer.unref()
    setTimeout(() => void this.process().catch(() => undefined), 10000).unref()
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }
  private admin(actor: { role: string }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Chỉ Admin được cấu hình kênh email')
  }
  private safe(error: unknown) {
    return (error instanceof Error ? error.message : 'Lỗi SMTP không xác định')
      .replace(/(pass(word)?|secret)=([^\s&]+)/gi, '$1=[REDACTED]')
      .slice(0, 1000)
  }
  private response(config: any) {
    return { ...config, passwordEncrypted: undefined, hasPassword: Boolean(config?.passwordEncrypted) }
  }
  async get(actor: { role: string }) {
    this.admin(actor)
    const config = await this.db.renewalNotificationConfiguration.findFirst({ orderBy: { createdAt: 'asc' } })
    return config
      ? this.response(config)
      : {
          enabled: false,
          smtpHost: '',
          smtpPort: 587,
          secure: false,
          username: '',
          fromName: 'AssetFlow',
          fromAddress: '',
          replyTo: '',
          hasPassword: false,
        }
  }
  async save(body: RenewalEmailConfigurationDto, actor: { role: string }) {
    this.admin(actor)
    const current = await this.db.renewalNotificationConfiguration.findFirst({ orderBy: { createdAt: 'asc' } }),
      passwordEncrypted = body.password?.trim() ? this.crypto.encrypt(body.password.trim()) : current?.passwordEncrypted
    if (body.enabled && body.username && !passwordEncrypted)
      throw new BadRequestException('Phải nhập mật khẩu SMTP trước khi bật email')
    const data = {
      enabled: body.enabled,
      smtpHost: body.smtpHost.trim(),
      smtpPort: body.smtpPort,
      secure: body.secure,
      username: body.username?.trim() || null,
      passwordEncrypted,
      fromName: body.fromName.trim(),
      fromAddress: body.fromAddress.toLowerCase(),
      replyTo: body.replyTo?.toLowerCase() || null,
    }
    const saved = current
      ? await this.db.renewalNotificationConfiguration.update({ where: { id: current.id }, data })
      : await this.db.renewalNotificationConfiguration.create({ data })
    return this.response(saved)
  }
  private transport(config: any) {
    return nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.secure,
      requireTLS: !config.secure,
      auth: config.username
        ? { user: config.username, pass: this.crypto.decrypt(config.passwordEncrypted) }
        : undefined,
      tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    })
  }
  async test(recipient: string, actor: { role: string }) {
    this.admin(actor)
    const config = await this.db.renewalNotificationConfiguration.findFirst()
    if (!config) throw new BadRequestException('Chưa lưu cấu hình SMTP')
    try {
      const transporter = this.transport(config)
      await transporter.verify()
      await transporter.sendMail({
        from: { name: config.fromName || 'AssetFlow', address: config.fromAddress! },
        to: recipient,
        replyTo: config.replyTo || undefined,
        subject: 'AssetFlow - Kiểm tra cảnh báo gia hạn',
        text: 'Kết nối SMTP thành công. AssetFlow có thể gửi cảnh báo gia hạn License, SSL và Domain.',
      })
      await this.db.renewalNotificationConfiguration.update({
        where: { id: config.id },
        data: { lastTestAt: new Date(), lastTestOk: true, lastTestMessage: 'SMTP và gửi thư kiểm tra thành công' },
      })
      return { ok: true, message: `Đã gửi thư kiểm tra tới ${recipient}` }
    } catch (error) {
      const message = this.safe(error)
      await this.db.renewalNotificationConfiguration.update({
        where: { id: config.id },
        data: { lastTestAt: new Date(), lastTestOk: false, lastTestMessage: message },
      })
      throw new BadRequestException(`Kiểm tra SMTP thất bại: ${message}`)
    }
  }
  async process() {
    const config = await this.db.renewalNotificationConfiguration.findFirst()
    if (!config?.enabled) return { queued: 0, sent: 0 }
    const alerts = await this.db.renewalAlert.findMany({
      where: { status: 'OPEN' },
      include: { policy: true, entitlement: { include: { owner: { select: { email: true } } } } },
    })
    let queued = 0,
      sent = 0
    for (const alert of alerts) {
      const recipients = notificationRecipients(
        alert.policy.recipients,
        alert.policy.notifyOwner,
        alert.entitlement.owner?.email,
      )
      for (const recipient of recipients) {
        await this.db.renewalNotificationDelivery.upsert({
          where: { alertId_channel_recipient: { alertId: alert.id, channel: 'EMAIL', recipient } },
          create: { alertId: alert.id, recipient },
          update: {},
        })
        queued++
      }
    }
    const jobs = await this.db.renewalNotificationDelivery.findMany({
        where: { status: { in: ['PENDING', 'FAILED'] }, attempts: { lt: 5 }, nextAttemptAt: { lte: new Date() } },
        include: { alert: { include: { entitlement: true } } },
        take: 50,
        orderBy: { createdAt: 'asc' },
      }),
      transporter = this.transport(config)
    for (const job of jobs) {
      try {
        const item = job.alert.entitlement,
          expiry = item.expiryDate ? item.expiryDate.toLocaleDateString('vi-VN') : 'Chưa khai báo'
        await transporter.sendMail({
          from: { name: config.fromName || 'AssetFlow', address: config.fromAddress! },
          to: job.recipient,
          replyTo: config.replyTo || undefined,
          subject: `[AssetFlow] ${item.name} cần gia hạn`,
          text: `Mã: ${item.code}\nLoại: ${item.type}\nNgày hết hạn: ${expiry}\nNgưỡng cảnh báo: ${job.alert.thresholdDays} ngày\n\nVui lòng truy cập AssetFlow để kiểm tra và xử lý.`,
        })
        await this.db.renewalNotificationDelivery.update({
          where: { id: job.id },
          data: { status: 'SENT', sentAt: new Date(), attempts: { increment: 1 }, lastError: null },
        })
        sent++
      } catch (error) {
        const attempts = job.attempts + 1
        await this.db.renewalNotificationDelivery.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            attempts,
            nextAttemptAt: nextNotificationAttempt(attempts),
            lastError: this.safe(error),
          },
        })
      }
    }
    return { queued, sent }
  }
  async status(actor: { role: string }) {
    this.admin(actor)
    const [config, pending, failed, sent] = await Promise.all([
      this.db.renewalNotificationConfiguration.findFirst(),
      this.db.renewalNotificationDelivery.count({ where: { status: 'PENDING' } }),
      this.db.renewalNotificationDelivery.count({ where: { status: 'FAILED' } }),
      this.db.renewalNotificationDelivery.count({ where: { status: 'SENT' } }),
    ])
    return {
      configured: Boolean(config),
      enabled: Boolean(config?.enabled),
      lastTestAt: config?.lastTestAt,
      lastTestOk: config?.lastTestOk,
      pending,
      failed,
      sent,
    }
  }
}
