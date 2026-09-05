import { Injectable, Logger, NestMiddleware } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { NextFunction, Request, Response } from 'express'
import { MetricsService } from '../observability/metrics.service'
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP')
  constructor(private readonly metrics: MetricsService) {}
  use(req: Request & { authUser?: { id?: string } }, res: Response, next: NextFunction) {
    const started = Date.now(),
      requestId = (req.get('x-request-id') || randomUUID()).slice(0, 100)
    res.setHeader('X-Request-Id', requestId)
    res.on('finish', () => {
      const durationMs = Date.now() - started
      this.metrics.record(req.method, res.statusCode, durationMs)
      this.logger.log(
        JSON.stringify({
          requestId,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs,
          actorId: req.authUser?.id || null,
        }),
      )
    })
    next()
  }
}
