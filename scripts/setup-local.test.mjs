import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseEnv } from 'node:util'
import { createLocalEnv, assertLocalDatabase, root } from './setup-local.mjs'

test('instalación nueva genera secretos propios y conserva los archivos al repetirla', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'auleka-setup-'))
  try {
    for (const app of ['api', 'web', 'landing']) {
      mkdirSync(path.join(folder, 'apps', app), { recursive: true })
      writeFileSync(path.join(folder, 'apps', app, '.env.example'),
        readFileSync(path.join(root, 'apps', app, '.env.example')))
    }
    createLocalEnv(folder)
    const first = readFileSync(path.join(folder, 'apps/api/.env'), 'utf8')
    const env = assertLocalDatabase(first)
    assert.match(env.JWT_SECRET, /^[a-f0-9]{64}$/)
    assert.match(env.JWT_REFRESH_SECRET, /^[a-f0-9]{64}$/)
    assert.notEqual(env.JWT_SECRET, env.JWT_REFRESH_SECRET)
    assert.equal(parseEnv(readFileSync(path.join(folder, 'apps/web/.env'), 'utf8')).VITE_API_URL, 'http://localhost:3000')
    createLocalEnv(folder)
    assert.equal(readFileSync(path.join(folder, 'apps/api/.env'), 'utf8'), first)
    const custom = 'DATABASE_URL=postgresql://custom:secret@localhost:5433/other\n'
    writeFileSync(path.join(folder, 'apps/api/.env'), custom)
    createLocalEnv(folder)
    assert.equal(readFileSync(path.join(folder, 'apps/api/.env'), 'utf8'), custom)
  } finally { rmSync(folder, { recursive: true, force: true }) }
})

test('setup rechaza migrar producción, la base anterior y una conexión directa diferente', () => {
  const local = 'postgresql://maoedu:maoedu_dev@localhost:5434/maoeducation'
  const config = (url, direct = url) => `NODE_ENV=development\nDATABASE_URL=${url}\nDIRECT_URL=${direct}\n`
  assert.doesNotThrow(() => assertLocalDatabase(config(local)))
  for (const url of [local.replace('localhost', 'production.example'), local.replace('5434', '5433'), local.replace('/maoeducation', '/other')]) {
    assert.throws(() => assertLocalDatabase(config(url)))
    assert.throws(() => assertLocalDatabase(config(local, url)))
  }
  assert.throws(() => assertLocalDatabase(config(local).replace('development', 'production')))
})
