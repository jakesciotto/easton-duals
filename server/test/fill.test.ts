import { describe, it, expect } from 'vitest'
import { asc, eq } from 'drizzle-orm'
import { freshDb, seedEvent } from './fixtures.js'
import { createTestApp, call } from './helpers.js'
import { auditLog, matches, type MatchRow } from '../src/db/schema.js'
import { createDivision } from '../src/formats/divisions.js'
import { createMatch } from '../src/match/create.js'
import { enterResult } from '../src/match/entry.js'
import { reopenMatch } from '../src/match/mats.js'
import type { Db } from '../src/db/client.js'
import type { DivisionFormat } from '../src/shared/types.js'

let entries = 0
const entryId = () => `entry-${String(++entries).padStart(4, '0')}`

async function bracket(format: DivisionFormat, opts: { live?: boolean } = {}) {
  const db = await freshDb()
  const s = await seedEvent(db, { matches: 0, matCount: 1, live: opts.live })
  const { division } = await createDivision(db, s.eventId, {
    name: 'Novice', format, styles: 'gi', athleteIds: [s.a1, s.a2, s.b1, s.b2],
  })
  return { db, s, division, rows: await bracketRows(db, division.id) }
}

const bracketRows = (db: Db, divisionId: number) =>
  db.select().from(matches).where(eq(matches.divisionId, divisionId)).orderBy(asc(matches.number)).all()

const win = (db: Db, match: MatchRow, winnerAthleteId: number, reason?: string) =>
  enterResult(db, match.id, { entryId: entryId(), pointsA: 2, pointsB: 0, winnerAthleteId, winType: 'points', reason })

const sides = (m: MatchRow) => [m.athleteAId, m.athleteBId]
const reload = async (db: Db, id: number) => (await db.select().from(matches).where(eq(matches.id, id)).get())!

describe('fillDependents', () => {
  it('writes the winner and the loser into the sides that wait on them', async () => {
    const { db, s, rows } = await bracket('double_elim')
    // Slot order 1, 4, 2, 3: M1 is the first semifinal, M3 the winners final and M4 the
    // first losers round, which takes the losers of both semifinals.
    expect(sides(rows[0])).toEqual([s.a1, s.b2])
    await win(db, rows[0], s.a1)
    expect(sides(await reload(db, rows[2].id))).toEqual([s.a1, null])
    expect(sides(await reload(db, rows[3].id))).toEqual([s.b2, null])
  })

  it('fills a chain of two rounds, one end at a time', async () => {
    const { db, s, rows } = await bracket('single_elim')
    await win(db, rows[0], s.b2)
    await win(db, rows[1], s.a2)
    const final = await reload(db, rows[2].id)
    expect(sides(final)).toEqual([s.b2, s.a2])
    await win(db, final, s.a2)
    expect((await reload(db, rows[2].id)).status).toBe('done')
  })

  it('records one fill row per feeder end, naming every side it filled', async () => {
    const { db, s, rows } = await bracket('single_elim')
    await win(db, rows[0], s.a1)
    const row = await db.select().from(auditLog).where(eq(auditLog.action, 'fill')).get()
    expect(row).toMatchObject({ matchId: rows[0].id, actor: 'desk' })
    expect(row?.detail).toEqual({ fromMatchId: rows[0].id, filled: [{ matchId: rows[2].id, side: 'a', athleteId: s.a1 }] })
    expect(await db.select().from(auditLog).where(eq(auditLog.action, 'fill')).all()).toHaveLength(1)
  })

  it('writes no fill row for a match nothing feeds from', async () => {
    const db = await freshDb()
    const s = await seedEvent(db, { matches: 1 })
    const match = await reload(db, s.matchIds[0])
    await win(db, match, s.a1)
    expect(await db.select().from(auditLog).where(eq(auditLog.action, 'fill')).all()).toEqual([])
  })
})

describe('a correction on a feeder', () => {
  it('writes the new kid into every dependent side while they are all pending', async () => {
    const { db, s, rows } = await bracket('single_elim')
    await win(db, rows[0], s.a1)
    await win(db, rows[0], s.b2, 'the scorer had the sides the wrong way round')
    expect(sides(await reload(db, rows[2].id))).toEqual([s.b2, null])
    expect(await db.select().from(auditLog).where(eq(auditLog.action, 'fill')).all()).toHaveLength(2)
  })

  it('refuses once a dependent has run, and writes nothing', async () => {
    const { db, s, rows } = await bracket('single_elim')
    await win(db, rows[0], s.a1)
    await db.update(matches).set({ status: 'live' }).where(eq(matches.id, rows[2].id)).run()
    await expect(win(db, rows[0], s.b2)).rejects.toThrow(`M${rows[2].number} already ran on this result`)
    expect((await reload(db, rows[0].id)).winnerAthleteId).toBe(s.a1)
    expect(sides(await reload(db, rows[2].id))).toEqual([s.a1, null])
  })

  it('takes a correction that only moves the points', async () => {
    const { db, s, rows } = await bracket('single_elim')
    await win(db, rows[0], s.a1)
    await db.update(matches).set({ status: 'live' }).where(eq(matches.id, rows[2].id)).run()
    const corrected = await enterResult(db, rows[0].id, {
      entryId: entryId(), pointsA: 7, pointsB: 2, winnerAthleteId: s.a1, winType: 'points',
    })
    expect(corrected.match.pointsA).toBe(7)
    expect(await db.select().from(auditLog).where(eq(auditLog.action, 'fill')).all()).toHaveLength(1)
  })
})

describe('reopening a feeder', () => {
  it('empties the sides it filled, and the next end fills them again', async () => {
    const { db, s, rows } = await bracket('single_elim', { live: true })
    await win(db, rows[0], s.a1)
    await reopenMatch(db, rows[0].id)
    expect(sides(await reload(db, rows[2].id))).toEqual([null, null])
    await win(db, await reload(db, rows[0].id), s.b2)
    expect(sides(await reload(db, rows[2].id))).toEqual([s.b2, null])
  })

  it('refuses while a dependent is live', async () => {
    const { db, s, rows } = await bracket('single_elim', { live: true })
    await win(db, rows[0], s.a1)
    await db.update(matches).set({ status: 'live' }).where(eq(matches.id, rows[2].id)).run()
    await expect(reopenMatch(db, rows[0].id)).rejects.toThrow(`M${rows[2].number} already ran on this result`)
    expect((await reload(db, rows[0].id)).status).toBe('done')
  })
})

describe('the delete and patch guards', () => {
  it('refuses to delete a match another one feeds from', async () => {
    const db = await freshDb()
    const s = await seedEvent(db, { matches: 0 })
    const { app, adminToken } = await createTestApp({ db })
    const feeder = await createMatch(db, { eventId: s.eventId, athleteAId: s.a1, athleteBId: s.b1, source: 'designed' })
    if (!feeder.ok) throw new Error(feeder.message)
    const dependent = await createMatch(db, {
      eventId: s.eventId, athleteAId: null, athleteBId: s.a2,
      feedA: { matchId: feeder.match.id, take: 'winner' }, source: 'designed',
    })
    if (!dependent.ok) throw new Error(dependent.message)
    const refused = await call(app, 'DELETE', `/api/matches/${feeder.match.id}`, undefined, adminToken)
    expect(refused.status).toBe(409)
    expect(refused.body.error).toMatchObject({ code: 'match_state', message: `M${dependent.match.number} feeds from this match` })
    expect((await call(app, 'DELETE', `/api/matches/${dependent.match.id}`, undefined, adminToken)).status).toBe(204)
    expect((await call(app, 'DELETE', `/api/matches/${feeder.match.id}`, undefined, adminToken)).status).toBe(204)
  })

  it('sends a delete of a division match to the division', async () => {
    const { db, rows } = await bracket('single_elim')
    const { app, adminToken } = await createTestApp({ db })
    const refused = await call(app, 'DELETE', `/api/matches/${rows[0].id}`, undefined, adminToken)
    expect(refused.status).toBe(409)
    expect(refused.body.error.message).toBe('delete the division')
  })

  it('refuses an athlete change on a division match but takes a length change', async () => {
    const { db, s, rows } = await bracket('single_elim')
    const { app, adminToken } = await createTestApp({ db })
    const refused = await call(app, 'PATCH', `/api/matches/${rows[0].id}`, { athleteAId: s.a2 }, adminToken)
    expect(refused.status).toBe(409)
    expect(refused.body.error).toMatchObject({ code: 'match_state', message: 'edit the division' })
    const patched = await call(app, 'PATCH', `/api/matches/${rows[0].id}`, { lengthSec: 120, matId: s.matIds[0] }, adminToken)
    expect(patched.status).toBe(200)
    expect(patched.body).toMatchObject({ lengthSec: 120, matId: s.matIds[0] })
  })
})

describe('a bracket match with an empty side', () => {
  it('cannot be scored until its feeder ends', async () => {
    const { db, rows } = await bracket('single_elim')
    await expect(win(db, rows[2], rows[2].athleteAId ?? 0)).rejects.toThrow('athlete not in match')
  })
})
