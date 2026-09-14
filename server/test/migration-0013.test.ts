import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, initDb, migrateDb } from '../src/db/client.js'

const DRIZZLE = path.join(import.meta.dirname, '../drizzle')

// Migrated to 0012 first, so the new column lands on a real athlete row.
async function dbAt0012() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duels-mig-'))
  const folder = path.join(dir, 'drizzle')
  fs.cpSync(DRIZZLE, folder, { recursive: true })
  const journal = JSON.parse(fs.readFileSync(path.join(DRIZZLE, 'meta/_journal.json'), 'utf8'))
  fs.writeFileSync(path.join(folder, 'meta/_journal.json'), JSON.stringify({ ...journal, entries: journal.entries.filter((e: { idx: number }) => e.idx <= 12) }))
  const url = `file:${path.join(dir, `${randomUUID()}.db`)}`
  const db = createDb({ url })
  await initDb(db, { url })
  await migrateDb(db, folder)
  const to0013 = async () => {
    fs.writeFileSync(path.join(folder, 'meta/_journal.json'), JSON.stringify(journal))
    await migrateDb(db, folder)
  }
  return { db, to0013, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) }
}

describe('migration 0013 adds the scoring flag', () => {
  it('reads false for a kid that existed before it, and takes true after', async () => {
    const { db, to0013, cleanup } = await dbAt0012()
    try {
      await db.run(sql`insert into events (id, name, date, mat_count, mat_code, status, mode, same_gender, created_at)
        values (1, 'Fall Duels', '2026-10-03', 1, '0420', 'setup', 'live', 0, '2026-10-03T15:00:00.000Z')`)
      await db.run(sql`insert into teams (id, event_id, name, color, position) values (1, 1, 'Ridgeline', 'red', 0)`)
      await db.run(sql`insert into athletes (id, event_id, team_id, first_name, last_name, source) values (1, 1, 1, 'Mateo', 'Rivera', 'manual')`)
      await to0013()
      expect(await db.get<Record<string, unknown>>(sql`select id, scoring from athletes where id = 1`)).toEqual({ id: 1, scoring: 0 })
      await db.run(sql`update athletes set scoring = 1 where id = 1`)
      expect((await db.get<{ scoring: number }>(sql`select scoring from athletes where id = 1`))?.scoring).toBe(1)
    } finally {
      cleanup()
    }
  })
})
