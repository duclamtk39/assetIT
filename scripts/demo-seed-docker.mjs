#!/usr/bin/env node
// Runs the demo seed against the database of the running Docker stack.
//
// compose.yaml keeps PostgreSQL on an `internal` network with no published port, which is
// the right production posture but means the host cannot reach it directly. This script
// bridges that gap with a throwaway forwarder container and removes it again afterwards.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const FORWARDER = `assetflow-seed-forwarder-${randomUUID().slice(0, 8)}`
const PORT = Number(process.env.DEMO_SEED_PORT || 55432)
const POSTGRES_CONTAINER = process.env.DEMO_SEED_DB_CONTAINER || 'assetflow-postgres-1'
const NETWORK = process.env.DEMO_SEED_NETWORK || 'assetflow_data'

const run = (command, args, options = {}) => spawnSync(command, args, { stdio: 'inherit', ...options })
const quiet = (command, args) => spawnSync(command, args, { encoding: 'utf8' })

function readEnvFile() {
  if (!existsSync('.env')) throw new Error('.env not found. Copy .env.example to .env first.')
  const values = {}
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match) values[match[1]] = match[2]
  }
  return values
}

function assertStackIsRunning() {
  const probe = quiet('docker', ['inspect', '-f', '{{.State.Running}}', POSTGRES_CONTAINER])
  if (probe.status !== 0 || probe.stdout.trim() !== 'true')
    throw new Error(
      `Container ${POSTGRES_CONTAINER} is not running. Start the stack first:\n` +
        '  docker compose -f compose.yaml -f compose.dev.yaml up -d',
    )
}

function startForwarder() {
  const created = quiet('docker', [
    'run',
    '--detach',
    '--name',
    FORWARDER,
    '--publish',
    `127.0.0.1:${PORT}:5432`,
    'alpine/socat',
    'tcp-listen:5432,fork,reuseaddr',
    `tcp-connect:${POSTGRES_CONTAINER}:5432`,
  ])
  if (created.status !== 0) throw new Error(`Could not start the forwarder: ${created.stderr.trim()}`)
  const attached = quiet('docker', ['network', 'connect', NETWORK, FORWARDER])
  if (attached.status !== 0) throw new Error(`Could not attach the forwarder to ${NETWORK}: ${attached.stderr.trim()}`)
}

const removeForwarder = () => quiet('docker', ['rm', '-f', FORWARDER])

let exitCode = 1
try {
  const env = readEnvFile()
  const user = env.POSTGRES_USER || 'assetflow'
  const database = env.POSTGRES_DB || 'assetflow'
  if (!env.POSTGRES_PASSWORD) throw new Error('POSTGRES_PASSWORD is not set in .env')

  assertStackIsRunning()
  removeForwarder()
  startForwarder()

  const result = run('npx', ['tsx', 'apps/api/prisma/seed.ts'], {
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      ASSETFLOW_DEMO_SEED: 'true',
      DATABASE_URL: `postgresql://${user}:${encodeURIComponent(env.POSTGRES_PASSWORD)}@127.0.0.1:${PORT}/${database}`,
    },
  })
  exitCode = result.status ?? 1
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
} finally {
  removeForwarder()
}
process.exit(exitCode)
