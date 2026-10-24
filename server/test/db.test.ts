import { describe, it, expect } from 'vitest'
import { autoMigrates, createDb, dbUrlFromEnv } from '../src/db/client.js'
import { settings } from '../src/db/schema.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

describe('the database url comes from the environment with a local file default', () => {
  it('prefers an explicit DB_PATH over Turso credentials', () => {
    const r = dbUrlFromEnv({ DB_PATH: '/tmp/x.db', TURSO_DATABASE_URL: 'libsql://example.invalid', TURSO_AUTH_TOKEN: 't' })
    expect(r).toEqual({ url: 'file:/tmp/x.db' })
  })
  it('uses Turso when no DB_PATH is set', () => {
    const r = dbUrlFromEnv({ TURSO_DATABASE_URL: 'libsql://example.invalid', TURSO_AUTH_TOKEN: 't', DATA_DIR: './data' })
    expect(r).toEqual({ url: 'libsql://example.invalid', authToken: 't' })
  })
  it('falls back to the DATA_DIR file', () => {
    expect(dbUrlFromEnv({ DATA_DIR: './d' }).url).toBe('file:d/duals.db')
  })
  it('prefers duals.db, falls back to an existing duels.db, and names duals.db on a fresh box', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duals-name-'))
    try {
      expect(dbUrlFromEnv({ DATA_DIR: dir }).url).toBe(`file:${path.join(dir, 'duals.db')}`)
      fs.writeFileSync(path.join(dir, 'duels.db'), '')
      expect(dbUrlFromEnv({ DATA_DIR: dir }).url).toBe(`file:${path.join(dir, 'duels.db')}`)
      fs.writeFileSync(path.join(dir, 'duals.db'), '')
      expect(dbUrlFromEnv({ DATA_DIR: dir }).url).toBe(`file:${path.join(dir, 'duals.db')}`)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('createDb retry wiring', () => {
  it('retries 401 responses through the injected fetch and stops at the budget', async () => {
    let calls = 0
    const always401 = (async () => {
      calls += 1
      return new Response('unauthorized', { status: 401 })
    }) as unknown as typeof fetch
    const db = createDb({ url: 'libsql://example.invalid', authToken: 't', fetchFn: always401 })
    await expect(db.select().from(settings).all()).rejects.toThrow()
    expect(calls).toBe(3)
  })
})

describe('a boot migrates only a file database', () => {
  it('migrates a file database at boot', () => {
    expect(autoMigrates('file:./data/duals.db')).toBe(true)
    expect(autoMigrates('file::memory:')).toBe(true)
  })
  it('never migrates a remote database at boot', () => {
    expect(autoMigrates('libsql://duals-example.turso.io')).toBe(false)
    expect(autoMigrates('https://duals-example.turso.io')).toBe(false)
  })
})
