import 'reflect-metadata'
import { readFileSync } from 'node:fs'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { PollerModule } from './poller.module'

/**
 * Entry point of the network monitoring image.
 *
 * It boots an application context - no HTTP server, no port, no inbound surface at all - and lets
 * NetmonPoller's timer hold the process open. Shutdown hooks are enabled so a SIGTERM from Docker
 * closes the database connection instead of dropping it.
 */

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

async function bootstrap() {
  configureDatabaseUrlFromSecret()
  // The loop is what this image exists to run, so refusing to start without it is better than a
  // container that looks healthy while probing nothing.
  if (process.env.NETMON_POLLER === 'false') throw new Error('NETMON_POLLER is disabled; the network image has no work')
  process.env.NETMON_POLLER = 'true'
  const context = await NestFactory.createApplicationContext(PollerModule, { bufferLogs: false })
  context.enableShutdownHooks()
  new Logger('Netmon').log(`AssetFlow network monitor started (${process.env.APP_VERSION || 'development'})`)
}

void bootstrap()
