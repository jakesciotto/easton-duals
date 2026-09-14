import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, initDb, migrateDb } from '../src/db/client.js'

const DRIZZLE = path.join(import.meta.dirname, '../drizzle')

// Match progression rebuilds `matches`, and `match_events` cascades from it. Migrated to
// 0011 first so the rebuild runs against real scoring events rather than an empty table.
async function dbAt0011() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duals-mig-'))
  const folder = path.join(dir, 'drizzle')
  fs.cpSync(DRIZZLE, folder, { recursive: true })
  const journal = JSON.parse(fs.readFileSync(path.join(DRIZZLE, 'meta/_journal.json'), 'utf8'))
  fs.writeFileSync(path.join(folder, 'meta/_journal.json'), JSON.stringify({ ...journal, entries: journal.entries.filter((e: { idx: number }) => e.idx <= 11) }))
  const url = `file:${path.join(dir, `${randomUUID()}.db`)}`
  const db = createDb({ url })
  await initDb(db, { url })
  await migrateDb(db, folder)
  const to0012 = async () => {
    fs.writeFileSync(path.join(folder, 'meta/_journal.json'), JSON.stringify(journal))
    await migrateDb(db, folder)
  }
  return { db, to0012, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) }
}

// Two events, so the numbers have to restart. Match 3 is deliberately out of id order at
// order index 1, because the number is backfilled by order index and only then by id.
async function seedAt0011(db: Awaited<ReturnType<typeof dbAt0011>>['db']) {
  await db.run(sql`insert into events (id, name, date, mat_count, mat_code, status, mode, same_gender, created_at)
    values (1, 'Fall Duals', '2026-10-03', 1, '0420', 'live', 'live', 0, '2026-10-03T15:00:00.000Z')`)
  await db.run(sql`insert into events (id, name, date, mat_count, mat_code, status, mode, same_gender, created_at)
    values (2, 'Winter Duals', '2026-12-05', 1, '0421', 'setup', 'live', 0, '2026-12-05T15:00:00.000Z')`)
  await db.run(sql`insert into teams (id, event_id, name, color, position) values (1, 1, 'Ridgeline', 'red', 0)`)
  await db.run(sql`insert into teams (id, event_id, name, color, position) values (2, 1, 'Lakeside', 'blue', 1)`)
  await db.run(sql`insert into athletes (id, event_id, team_id, first_name, last_name, source) values (1, 1, 1, 'Mateo', 'Rivera', 'manual')`)
  await db.run(sql`insert into athletes (id, event_id, team_id, first_name, last_name, source) values (2, 1, 2, 'Olivia', 'Kim', 'manual')`)
  await db.run(sql`insert into athletes (id, event_id, team_id, first_name, last_name, source) values (3, 2, null, 'Noah', 'Tran', 'manual')`)
  await db.run(sql`insert into athletes (id, event_id, team_id, first_name, last_name, source) values (4, 2, null, 'Ava', 'Park', 'manual')`)
  await db.run(sql`insert into rulesets (id, event_id, name, default_length_sec, actions, terminals) values (1, 1, 'Default', 300, '[]', '[]')`)
  await db.run(sql`insert into rulesets (id, event_id, name, default_length_sec, actions, terminals) values (2, 2, 'Default', 300, '[]', '[]')`)
  await db.run(sql`insert into mats (id, event_id, number) values (1, 1, 1)`)
  await db.run(sql`insert into matches (id, event_id, mat_id, order_index, ruleset_id, length_sec, athlete_a_id, athlete_b_id) values (1, 1, 1, 0, 1, 300, 1, 2)`)
  await db.run(sql`insert into matches (id, event_id, mat_id, order_index, ruleset_id, length_sec, athlete_a_id, athlete_b_id) values (3, 1, 1, 1, 1, 300, 2, 1)`)
  await db.run(sql`insert into matches (id, event_id, mat_id, order_index, ruleset_id, length_sec, athlete_a_id, athlete_b_id) values (2, 1, null, 2, 1, 300, 1, 2)`)
  await db.run(sql`insert into matches (id, event_id, mat_id, order_index, ruleset_id, length_sec, athlete_a_id, athlete_b_id) values (9, 2, null, 0, 2, 300, 3, 4)`)
  for (const [seq, matchId] of [[1, 1], [2, 1], [3, 1], [4, 3], [5, 3]]) {
    await db.run(sql`insert into match_events (id, match_id, seq, type, at)
      values (${`e${seq}`}, ${matchId}, ${seq}, 'score', '2026-10-03T15:1${seq}:00.000Z')`)
  }
  await db.run(sql`update mats set current_match_id = 1 where id = 1`)
  await db.run(sql`insert into proposals (id, event_id, athlete_a_id, athlete_b_id, cost, why, created_at)
    values (1, 1, 1, 2, 2.5, 'same class', '2026-10-03T15:30:00.000Z')`)
}

describe('migration 0012 adds divisions, numbers, styles and feeds', () => {
  it('keeps every scoring event through the rebuild of matches', async () => {
    const { db, to0012, cleanup } = await dbAt0011()
    try {
      await seedAt0011(db)
      await to0012()
      expect(await db.get<{ n: number }>(sql`select count(*) as n from match_events`)).toEqual({ n: 5 })
      expect(await db.all<Record<string, unknown>>(sql`select id, match_id, seq from match_events order by seq`)).toEqual([
        { id: 'e1', match_id: 1, seq: 1 },
        { id: 'e2', match_id: 1, seq: 2 },
        { id: 'e3', match_id: 1, seq: 3 },
        { id: 'e4', match_id: 3, seq: 4 },
        { id: 'e5', match_id: 3, seq: 5 },
      ])
    } finally {
      cleanup()
    }
  })

  it('numbers the matches of each event by order index, keeping ids and sides', async () => {
    const { db, to0012, cleanup } = await dbAt0011()
    try {
      await seedAt0011(db)
      await to0012()
      expect(await db.all<Record<string, unknown>>(sql`select id, event_id, number, order_index, athlete_a_id, athlete_b_id, style, source, division_id, round
        from matches order by event_id, number`)).toEqual([
        { id: 1, event_id: 1, number: 1, order_index: 0, athlete_a_id: 1, athlete_b_id: 2, style: 'gi', source: 'designed', division_id: null, round: null },
        { id: 3, event_id: 1, number: 2, order_index: 1, athlete_a_id: 2, athlete_b_id: 1, style: 'gi', source: 'designed', division_id: null, round: null },
        { id: 2, event_id: 1, number: 3, order_index: 2, athlete_a_id: 1, athlete_b_id: 2, style: 'gi', source: 'designed', division_id: null, round: null },
        { id: 9, event_id: 2, number: 1, order_index: 0, athlete_a_id: 3, athlete_b_id: 4, style: 'gi', source: 'designed', division_id: null, round: null },
      ])
    } finally {
      cleanup()
    }
  })

  it('takes a match with an empty side and a feed, and refuses a feed to no match', async () => {
    const { db, to0012, cleanup } = await dbAt0011()
    try {
      await seedAt0011(db)
      await to0012()
      await db.run(sql`insert into matches (id, event_id, number, order_index, ruleset_id, length_sec, athlete_a_id, athlete_b_id, feed_a_match_id, feed_a_take, feed_b_match_id, feed_b_take, style)
        values (20, 1, 4, 3, 1, 300, null, null, 1, 'winner', 3, 'loser', 'nogi')`)
      expect(await db.get<Record<string, unknown>>(sql`select athlete_a_id, feed_a_match_id, feed_a_take, feed_b_take, style from matches where id = 20`))
        .toEqual({ athlete_a_id: null, feed_a_match_id: 1, feed_a_take: 'winner', feed_b_take: 'loser', style: 'nogi' })
      await expect(db.run(sql`insert into matches (id, event_id, number, order_index, ruleset_id, length_sec, feed_a_match_id, feed_a_take)
        values (21, 1, 5, 4, 1, 300, 404, 'winner')`)).rejects.toThrow()
    } finally {
      cleanup()
    }
  })

  it('puts the foreign key back on match_events and leaves the mat pointer alone', async () => {
    const { db, to0012, cleanup } = await dbAt0011()
    try {
      await seedAt0011(db)
      await to0012()
      await expect(db.run(sql`insert into match_events (id, match_id, seq, type, at) values ('orphan', 404, 1, 'score', '2026-10-03T16:00:00.000Z')`))
        .rejects.toThrow()
      expect(await db.get<{ foreign_keys: number }>(sql`pragma foreign_keys`)).toEqual({ foreign_keys: 1 })
      expect(await db.all<Record<string, unknown>>(sql`pragma foreign_key_check`)).toEqual([])
      expect(await db.get<Record<string, unknown>>(sql`select current_match_id from mats where id = 1`)).toEqual({ current_match_id: 1 })
      await db.run(sql`delete from matches where id = 1`)
      expect(await db.get<{ n: number }>(sql`select count(*) as n from match_events`)).toEqual({ n: 2 })
    } finally {
      cleanup()
    }
  })

  it('holds a division with its members and reads gi on an old proposal', async () => {
    const { db, to0012, cleanup } = await dbAt0011()
    try {
      await seedAt0011(db)
      await to0012()
      expect(await db.get<Record<string, unknown>>(sql`select style from proposals where id = 1`)).toEqual({ style: 'gi' })
      await db.run(sql`insert into divisions (id, event_id, name, format, styles, position, created_at)
        values (1, 1, '47 to 53 boys', 'single_elim', 'both', 0, '2026-10-03T15:40:00.000Z')`)
      await db.run(sql`insert into division_members (division_id, athlete_id, seed) values (1, 1, 1), (1, 2, 2)`)
      await db.run(sql`update matches set division_id = 1, round = 1 where id = 1`)
      await db.run(sql`delete from divisions where id = 1`)
      expect(await db.get<{ n: number }>(sql`select count(*) as n from division_members`)).toEqual({ n: 0 })
      expect(await db.get<{ n: number }>(sql`select count(*) as n from matches`)).toEqual({ n: 3 })
    } finally {
      cleanup()
    }
  })
})
