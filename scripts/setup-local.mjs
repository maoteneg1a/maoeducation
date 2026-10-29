import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { spawnSync } from 'node:child_process'

export const root = fileURLToPath(new URL('../', import.meta.url))

export function createLocalEnv(directory = root) {
  for (const app of ['api', 'web', 'landing']) {
    const target = path.join(directory, 'apps', app, '.env')
    if (existsSync(target)) continue
    let text = readFileSync(`${target}.example`, 'utf8')
    text = text.replace('GENERATE_LOCAL_JWT_SECRET', randomBytes(32).toString('hex'))
      .replace('GENERATE_LOCAL_JWT_REFRESH_SECRET', randomBytes(32).toString('hex'))
    writeFileSync(target, text, { flag: 'wx', mode: 0o600 })
    console.log(`Creado apps/${app}/.env`)
  }
}

export function assertLocalDatabase(text) {
  const env = parseEnv(text)
  for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
    let url
    try { url = new URL(env[key]) } catch { throw new Error(`${key} no es una URL válida`) }
    if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !['localhost', '127.0.0.1'].includes(url.hostname)
      || url.port !== '5434' || url.pathname !== '/maoeducation') {
      throw new Error(`${key} debe apuntar a localhost:5434/maoeducation. Se conserva tu configuración existente; revísala antes de ejecutar el setup.`)
    }
  }
  if (env.NODE_ENV !== 'development') throw new Error('El setup local requiere NODE_ENV=development')
  return env
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root, stdio: 'inherit', shell: process.platform === 'win32', ...options,
  })
  if (result.error || result.status !== 0) {
    throw new Error(`Falló ${command} ${args.join(' ')}. Revisa el mensaje anterior y vuelve a ejecutar el comando.`)
  }
}

export async function initializeDatabase(env) {
  const require = createRequire(path.join(root, 'apps/api/package.json'))
  const { PrismaClient } = require('@prisma/client')
  const database = new URL(env.DATABASE_URL)
  if (!['localhost', '127.0.0.1'].includes(database.hostname) || database.port !== '5434'
      || env.DIRECT_URL !== env.DATABASE_URL) throw new Error('El bootstrap solo admite PostgreSQL 18 local y dos URLs idénticas')
  const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } })
  const options = { env: { ...process.env, ...env } }
  const migrationsPath = path.join(root, 'apps/api/prisma/migrations')
  const migrations = readdirSync(migrationsPath).filter(name => existsSync(path.join(migrationsPath, name, 'migration.sql'))).sort()
  const fingerprint = createHash('sha256').update(migrations.map(name =>
    `${name}:${createHash('sha256').update(readFileSync(path.join(migrationsPath, name, 'migration.sql'))).digest('hex')}`).join('\n')).digest('hex')
  const stateDir = path.join(root, '.local-setup')
  const stateId = createHash('sha256').update(`${database.host}${database.pathname}`).digest('hex').slice(0, 16)
  const stateFile = path.join(stateDir, `${stateId}.json`)
  let baseline = false
  try {
    const [result] = await prisma.$queryRaw`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public'`
    if (result.count === 0) {
      mkdirSync(stateDir, { recursive: true, mode: 0o700 })
      writeFileSync(stateFile, JSON.stringify({ fingerprint }), { mode: 0o600 })
      baseline = true
    } else if (existsSync(stateFile)) {
      if (JSON.parse(readFileSync(stateFile, 'utf8')).fingerprint !== fingerprint) {
        throw new Error('El esquema cambió durante un bootstrap incompleto. Revisar .local-setup antes de continuar.')
      }
      baseline = true
    }
    if (baseline) {
      console.log('Base local vacía: crear esquema actual y registrar el historial sin reproducir migraciones antiguas inconsistentes.')
      run('pnpm', ['--filter', 'api', 'exec', 'prisma', 'db', 'push', '--skip-generate'], options)
      run('pnpm', ['--filter', 'api', 'exec', 'prisma', 'db', 'execute', '--file', '../../scripts/sql/dece-history-guards.sql'], options)
      const [history] = await prisma.$queryRaw`SELECT to_regclass('public._prisma_migrations')::text AS name`
      const applied = new Set(history.name
        ? (await prisma.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`).map(row => row.migration_name)
        : [])
      for (const migration of migrations) {
        if (applied.has(migration)) continue
        run('pnpm', ['--filter', 'api', 'exec', 'prisma', 'migrate', 'resolve', '--applied', migration], options)
      }
      unlinkSync(stateFile)
    }
  } finally { await prisma.$disconnect() }
  run('pnpm', ['--filter', 'api', 'db:migrate:prod'], options)
}

async function main() {
  createLocalEnv()
  if (process.argv.includes('--env-only')) return
  const env = assertLocalDatabase(readFileSync(path.join(root, 'apps/api/.env'), 'utf8'))
  // Pass the validated URLs explicitly so inherited shell variables cannot redirect migrations.
  const options = { env: { ...process.env, ...env } }
  run('docker', ['compose', 'up', '-d', '--wait', 'postgres18'])
  run('pnpm', ['--filter', 'api', 'db:generate'], options)
  await initializeDatabase(env)
  run('pnpm', ['--filter', 'api', 'db:seed'], options)
  run('pnpm', ['--filter', 'api', 'db:seed:curriculum'], options)
  console.log('Instalación local lista. Ejecuta pnpm dev:local. App: http://localhost:5173')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main() } catch (error) { console.error(error.message); process.exitCode = 1 }
}
