import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import helmet from 'helmet'
import type { NextFunction, Request, Response } from 'express'
import { json, urlencoded } from 'express'
import { AppModule } from './app.module'
import { HttpErrorFilter } from './common/http-exception.filter'
function configureDatabaseUrlFromSecret() {
  if (process.env.DATABASE_URL) return
  const passwordFile = process.env.DATABASE_PASSWORD_FILE
  if (!passwordFile) return
  const password = encodeURIComponent(readFileSync(passwordFile, 'utf8').trim()),
    user = encodeURIComponent(process.env.DATABASE_USER || 'assetflow_app'),
    host = process.env.DATABASE_HOST || 'db',
    port = process.env.DATABASE_PORT || '5432',
    database = encodeURIComponent(process.env.DATABASE_NAME || 'assetflow')
  process.env.DATABASE_URL = `postgresql://${user}:${password}@${host}:${port}/${database}`
}
function configureRuntimeSecrets() {
  if (!process.env.METRICS_TOKEN && process.env.METRICS_TOKEN_FILE)
    process.env.METRICS_TOKEN = readFileSync(process.env.METRICS_TOKEN_FILE, 'utf8').trim()
}
async function bootstrap() {
  configureDatabaseUrlFromSecret()
  configureRuntimeSecrets()
  const origins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
  if (process.env.NODE_ENV === 'production' && origins.includes('*'))
    throw new Error('CORS_ORIGIN cannot contain * in production')
  const app = await NestFactory.create(AppModule, { cors: false, bodyParser: false })
  const bodyLimit = process.env.MAX_JSON_BODY || '5mb'
  app.use(json({ limit: bodyLimit }), urlencoded({ extended: false, limit: bodyLimit }))
  if (process.env.TRUST_PROXY === 'true') app.getHttpAdapter().getInstance().set('trust proxy', 1)
  app.setGlobalPrefix('api/v1', { exclude: ['api/docs'] })
  app.enableCors({ origin: origins, credentials: true })
  app.use(helmet({ contentSecurityPolicy: false }))
  app.use((request: Request, response: Response, next: NextFunction) => {
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(request.method),
      hasSession = Boolean(request.headers.cookie?.includes('assetflow_session=')),
      origin = request.get('origin')
    if (unsafe && hasSession && (!origin || !origins.includes(origin)))
      return response.status(403).json({
        statusCode: 403,
        code: 'CSRF_ORIGIN_REJECTED',
        message: 'Nguồn yêu cầu không hợp lệ',
        timestamp: new Date().toISOString(),
      })
    next()
  })
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  app.useGlobalFilters(new HttpErrorFilter())
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
    const config = new DocumentBuilder()
      .setTitle('AssetFlow API')
      .setVersion(process.env.APP_VERSION || 'development')
      .addCookieAuth('assetflow_session')
      .build()
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config))
  }
  await app.listen(Number(process.env.PORT || 3000), '0.0.0.0')
}
void bootstrap()
