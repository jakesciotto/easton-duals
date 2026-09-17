import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, initDb, migrateDb } from '../src/db/client.js'

const DRIZZLE = path.join(import.meta.dirname, '../drizzle')

// Migrated to 0013 first, so the new column lands on a real event row.
async function dbAt0013() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duals-mig-'))
  const folder = path.join(dir, 'drizzle')
  fs.cpSync(DRIZZLE, folder, { recursive: true })
  const journal = JSON.parse(fs.readFileSync(path.join(DRIZZLE, 'meta/_journal.json'), 'utf8'))
  fs.writeFileSync(path.join(folder, 'meta/_journal.json'), JSON.stringify({ ...journal, entries: journal.entries.filter((e: { idx: number }) => e.idx <= 13) }))
  const url = `file:${path.join(dir, `${randomUUID()}.db`)}`
  const db = createDb({ url })
  await initDb(db, { url })
  await migrateDb(db, folder)
  const to0014 = async () => {
    fs.writeFileSync(path.join(folder, 'meta/_journal.json'), JSON.stringify(journal))
    await migrateDb(db, folder)
  }
  return { db, to0014, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) }
}

describe('migration 0014 adds the Smoothcomp URL', () => {
  it('reads null for an event that existed before it, and takes a URL after', async () => {
    const { db, to0014, cleanup } = await dbAt0013()
    try {
      await db.run(sql`insert into events (id, name, date, mat_count, mat_code, status, mode, same_gender, created_at)
        values (1, 'Fall Duals', '2026-10-03', 1, '0420', 'setup', 'live', 0, '2026-10-03T15:00:00.000Z')`)
      await to0014()
      expect(await db.get<Record<string, unknown>>(sql`select id, smoothcomp_url from events where id = 1`)).toEqual({ id: 1, smoothcomp_url: null })
      await db.run(sql`update events set smoothcomp_url = 'https://smoothcomp.com/en/event/29499' where id = 1`)
      expect((await db.get<{ smoothcomp_url: string }>(sql`select smoothcomp_url from events where id = 1`))?.smoothcomp_url)
        .toBe('https://smoothcomp.com/en/event/29499')
    } finally {
      cleanup()
    }
  })
})
