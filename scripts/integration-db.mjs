#!/usr/bin/env node
// Starts a disposable PostgreSQL container, applies the migrations, runs the API
// integration tests against it and removes the container again.
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const CONTAINER = `assetflow-itest-${randomUUID().slice(0, 8)}`
const PASSWORD = randomUUID()
const PORT = Number(process.env.INTEGRATION_DB_PORT || 55432)
const IMAGE = process.env.INTEGRATION_DB_IMAGE || 'postgres:16-alpine'
const DATABASE_URL = `postgresql://assetflow:${PASSWORD}@127.0.0.1:${PORT}/assetflow`

const run = (command, args, options = {}) => spawnSync(command, args, { stdio: 'inherit', shell: false, ...options })

const runQuiet = (command, args) => spawnSync(command, args, { encoding: 'utf8' })

function removeContainer() {
  runQuiet('docker', ['rm', '-f', CONTAINER])
}

function startContainer() {
  const result = run('docker', [
    'run',
    '--detach',
    '--name',
    CONTAINER,
    '--env',
    'POSTGRES_DB=assetflow',
    '--env',
    'POSTGRES_USER=assetflow',
    '--env',
    `POSTGRES_PASSWORD=${PASSWORD}`,
    '--publish',
    `127.0.0.1:${PORT}:5432`,
    IMAGE,
  ])
  if (result.status !== 0) throw new Error('Could not start the PostgreSQL container. Is Docker running?')
}

async function waitForDatabase() {
  for (let attempt = 0; attempt < 60; attempt++) {
    const probe = runQuiet('docker', ['exec', CONTAINER, 'pg_isready', '-U', 'assetflow', '-d', 'assetflow'])
    if (probe.status === 0) return
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error('PostgreSQL did not become ready in time.')
}

function runTests() {
  const env = { ...process.env, DATABASE_URL }
  const migrate = run('npm', ['run', 'db:migrate'], { env, shell: process.platform === 'win32' })
  if (migrate.status !== 0) throw new Error('Migrations failed.')
  const tests = run('npm', ['run', 'test:integration'], { env, shell: process.platform === 'win32' })
  return tests.status ?? 1
}

let exitCode = 1
try {
  removeContainer()
  startContainer()
  await waitForDatabase()
  exitCode = runTests()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
} finally {
  removeContainer()
}
process.exit(exitCode)
