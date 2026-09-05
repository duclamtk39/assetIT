import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Public } from './auth/public.decorator'
import { PrismaService } from './database/prisma.service'

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly db: PrismaService) {}
  @Get('live') live() {
    return { status: 'ok' }
  }
  @Get('ready') async ready() {
    try {
      await this.db.$queryRaw`SELECT 1`
      return { status: 'ready', database: 'ok' }
    } catch {
      throw new ServiceUnavailableException({ status: 'not_ready', database: 'unavailable' })
    }
  }
  @Get('version') version() {
    return { name: 'AssetFlow', version: process.env.APP_VERSION || 'development' }
  }
}
