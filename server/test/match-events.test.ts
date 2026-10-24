import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { freshDb, seedEvent, failingWrites } from './fixtures.js'
import { appendMatchEvent, endMatch, extendClock, undoLastMatchEvent, loadEvents, loadMatch, bumpVersion, SeqConflict, MatchStateError } from '../src/match/events.js'
import { events, mats, matches } from '../src/db/schema.js'
import { heartbeatMat, reapBound, BOUND_WINDOW_MS } from '../src/live/bound.js'

const T = (s: number) => new Date(Date.parse('2026-08-27T18:00:00.000Z') + s * 1000).toISOString()

async function liveMatch() {
  const db = await freshDb()
  const s = await seedEvent(db, { live: true })
  return { db, s, matchId: s.matchIds[0] }
}

describe('match events are the source of truth and the caches follow in the same transaction', () => {
  it('scores from the ruleset and advances lastSeq', async () => {
    const { db, s, matchId } = await liveMatch()
    const r = await appendMatchEvent(db, { id: 'e1', matchId, type: 'score', athleteId: s.a1, actionKey: 'takedown', lastSeq: 0 })
    expect(r.duplicate).toBe(false)
    expect(r.match.pointsA).toBe(2)
    expect(r.match.pointsB).toBe(0)
    expect(r.match.lastSeq).toBe(1)
  })

  it('treats a duplicate id as success without writing', async () => {
    const { db, s, matchId } = await liveMatch()
    await appendMatchEvent(db, { id: 'e1', matchId, type: 'score', athleteId: s.a1, actionKey: 'takedown', lastSeq: 0 })
    const r = await appendMatchEvent(db, { id: 'e1', matchId, type: 'score', athleteId: s.a1, actionKey: 'takedown', lastSeq: 0 })
    expect(r.duplicate).toBe(true)
    expect(r.match.pointsA).toBe(2)
    expect(await loadEvents(db, matchId)).toHaveLength(1)
  })

  it('rejects a stale lastSeq with the current seq', async () => {
    const { db, s, matchId } = await liveMatch()
    await appendMatchEvent(db, { id: 'e1', matchId, type: 'score', athleteId: s.a1, actionKey: 'takedown', lastSeq: 0 })
    await expect(appendMatchEvent(db, { id: 'e2', matchId, type: 'score', athleteId: s.a1, actionKey: 'sweep', lastSeq: 0 }))
      .rejects.toThrow(SeqConflict)
    try { await appendMatchEvent(db, { id: 'e3', matchId, type: 'score', athleteId: s.a1, actionKey: 'sweep', lastSeq: 0 }) } catch (e) {
      expect((e as SeqConflict).currentSeq).toBe(1)
    }
  })

  it('rejects unknown actions and outside athletes', async () => {
    const { db, s, matchId } = await liveMatch()
    await expect(appendMatchEvent(db, { id: 'e1', matchId, type: 'score', athleteId: s.a1, actionKey: 'nope', lastSeq: 0 })).rejects.toThrow(MatchStateError)
    await expect(appendMatchEvent(db, { id: 'e2', matchId, type: 'score', athleteId: s.a2, actionKey: 'takedown', lastSeq: 0 })).rejects.toThrow(MatchStateError)
  })

  it('refuses writes on a pending match', async () => {
    const db = await freshDb()
    const s = await seedEvent(db, { live: true, matCount: 1 })
    await expect(appendMatchEvent(db, { id: 'e1', matchId: s.matchIds[1], type: 'clock_start', lastSeq: 0 })).rejects.toThrow(/pending/)
  })

  it('runs and pauses the clock', async () => {
    const { db, matchId } = await liveMatch()
    let r = await appendMatchEvent(db, { id: 'c1', matchId, type: 'clock_start', lastSeq: 0, at: T(0) })
    expect(r.match.clockStartedAt).toBe(T(0))
    await expect(appendMatchEvent(db, { id: 'c2', matchId, type: 'clock_start', lastSeq: 1, at: T(1) })).rejects.toThrow(/running/)
    r = await appendMatchEvent(db, { id: 'c3', matchId, type: 'clock_pause', lastSeq: 1, at: T(45) })
    expect(r.match.clockStartedAt).toBeNull()
    expect(r.match.clockElapsedMs).toBe(45_000)
    await expect(appendMatchEvent(db, { id: 'c4', matchId, type: 'clock_pause', lastSeq: 2, at: T(46) })).rejects.toThrow(/not running/)
  })

  it('refuses to score while the event is in setup', async () => {
    const db = await freshDb()
    const s = await seedEvent(db)
    await expect(appendMatchEvent(db, { id: 'e1', matchId: s.matchIds[0], type: 'clock_start', lastSeq: 0 })).rejects.toThrow(/setup/)
  })

  it('pauses the clock before a terminal and blocks restart while pending', async () => {
    const { db, s, matchId } = await liveMatch()
    await appendMatchEvent(db, { id: 'c1', matchId, type: 'clock_start', lastSeq: 0, at: T(0) })
    const r = await appendMatchEvent(db, { id: 't1', matchId, type: 'terminal', athleteId: s.b1, actionKey: 'pin', lastSeq: 1, at: T(20) })
    expect(r.match.lastSeq).toBe(3)
    expect(r.match.clockStartedAt).toBeNull()
    expect(r.match.clockElapsedMs).toBe(20_000)
    expect(r.match.pendingTerminalAthleteId).toBe(s.b1)
    expect(r.match.pendingTerminalKey).toBe('pin')
    expect((await loadEvents(db, matchId)).map(e => e.type)).toEqual(['clock_start', 'clock_pause', 'terminal'])
    await expect(appendMatchEvent(db, { id: 'c2', matchId, type: 'clock_start', lastSeq: 3 })).rejects.toThrow(/pending/)
  })

  it('pauses a running clock before the end event', async () => {
    const { db, s, matchId } = await liveMatch()
    await appendMatchEvent(db, { id: 'c1', matchId, type: 'clock_start', lastSeq: 0, at: T(0) })
    await appendMatchEvent(db, { id: 'e1', matchId, type: 'score', athleteId: s.a1, actionKey: 'pass', lastSeq: 1, at: T(10) })
    const r = await endMatch(db, { id: 'end1', matchId, lastSeq: 2, at: T(90) })
    expect(r.match.clockStartedAt).toBeNull()
    expect(r.match.clockElapsedMs).toBe(90_000)
    expect((await loadEvents(db, matchId)).map(e => e.type)).toEqual(['clock_start', 'score', 'clock_pause', 'end'])
  })

  it('gives the added time back on undo', async () => {
    const { db, matchId } = await liveMatch()
    await appendMatchEvent(db, { id: 'c1', matchId, type: 'clock_start', lastSeq: 0, at: T(0) })
    await appendMatchEvent(db, { id: 'c2', matchId, type: 'clock_pause', lastSeq: 1, at: T(30) })
    await extendClock(db, { id: 'add-0001', matchId, lastSeq: 2, addMs: 90_000 })
    await extendClock(db, { id: 'add-0002', matchId, lastSeq: 3, addMs: 30_000 })
    expect((await loadMatch(db, matchId)).extensionMs).toBe(120_000)
    expect((await undoLastMatchEvent(db, { matchId, lastSeq: 4 })).match.extensionMs).toBe(90_000)
    expect((await undoLastMatchEvent(db, { matchId, lastSeq: 3 })).match.extensionMs).toBe(0)
  })

  it('leaves no event row and no cache change when a write inside the transaction fails', async () => {
    const { db, s, matchId } = await liveMatch()
    await appendMatchEvent(db, { id: 'e1', matchId, type: 'score', athleteId: s.a1, actionKey: 'takedown', lastSeq: 0 })
    const broken = failingWrites(db, w => w.op === 'update' && w.table === matches)
    await expect(appendMatchEvent(broken, { id: 'e2', matchId, type: 'score', athleteId: s.a1, actionKey: 'mount', lastSeq: 1 })).rejects.toThrow('staged write failure')
    await expect(endMatch(broken, { id: 'end1', matchId, lastSeq: 1 })).rejects.toThrow('staged write failure')
    await expect(undoLastMatchEvent(broken, { matchId, lastSeq: 1 })).rejects.toThrow('staged write failure')
    expect((await loadEvents(db, matchId)).map(e => e.id)).toEqual(['e1'])
    expect(await loadMatch(db, matchId)).toMatchObject({ pointsA: 2, pointsB: 0, lastSeq: 1, status: 'live', winnerAthleteId: null })
  })
})

describe('every write bumps the event version in its transaction', () => {
  it('increments the event version by one, starting from zero', async () => {
    const db = await freshDb()
    const s = await seedEvent(db)
    const read = () => db.select({ version: events.version }).from(events).where(eq(events.id, s.eventId)).get()
    expect((await read())?.version).toBe(0)
    await bumpVersion(db, s.eventId)
    expect((await read())?.version).toBe(1)
    await bumpVersion(db, s.eventId)
    expect((await read())?.version).toBe(2)
  })

  it('binds on the first heartbeat and bumps the version once', async () => {
    const db = await freshDb()
    const s = await seedEvent(db)
    const matId = s.matIds[0]

    await heartbeatMat(db, matId, s.eventId, 10_000)
    let ev = await db.select().from(events).where(eq(events.id, s.eventId)).get()
    let mat = await db.select().from(mats).where(eq(mats.id, matId)).get()
    expect(ev?.version).toBe(1)
    expect(mat?.bound).toBe(true)
    expect(mat?.lastHeartbeatAt).toBe(new Date(10_000).toISOString())

    await heartbeatMat(db, matId, s.eventId, 20_000)
    ev = await db.select().from(events).where(eq(events.id, s.eventId)).get()
    mat = await db.select().from(mats).where(eq(mats.id, matId)).get()
    expect(ev?.version).toBe(1)
    expect(mat?.bound).toBe(true)
    expect(mat?.lastHeartbeatAt).toBe(new Date(20_000).toISOString())
  })

  it('reaps a mat 60s after its last heartbeat and bumps the version', async () => {
    const db = await freshDb()
    const s = await seedEvent(db)
    const matId = s.matIds[0]
    const t0 = 10_000

    await heartbeatMat(db, matId, s.eventId, t0)
    let ev = await db.select().from(events).where(eq(events.id, s.eventId)).get()
    expect(ev?.version).toBe(1)

    await reapBound(db, s.eventId, t0 + BOUND_WINDOW_MS + 1_000)
    ev = await db.select().from(events).where(eq(events.id, s.eventId)).get()
    let mat = await db.select().from(mats).where(eq(mats.id, matId)).get()
    expect(mat?.bound).toBe(false)
    expect(ev?.version).toBe(2)

    await reapBound(db, s.eventId, t0 + BOUND_WINDOW_MS + 2_000)
    ev = await db.select().from(events).where(eq(events.id, s.eventId)).get()
    mat = await db.select().from(mats).where(eq(mats.id, matId)).get()
    expect(mat?.bound).toBe(false)
    expect(ev?.version).toBe(2)
  })

  it('does not double-reap under two concurrent polls for the same stale mat', async () => {
    const db = await freshDb()
    const s = await seedEvent(db)
    const matId = s.matIds[0]
    const t0 = 10_000

    await heartbeatMat(db, matId, s.eventId, t0)
    const staleAt = t0 + BOUND_WINDOW_MS + 1_000

    // Same SQLITE_BUSY tolerance as expireOverdue: the loser is refused the write lock
    // and drops out rather than throwing out of the route as a 500.
    await Promise.all([
      reapBound(db, s.eventId, staleAt),
      reapBound(db, s.eventId, staleAt),
    ])

    const mat = await db.select().from(mats).where(eq(mats.id, matId)).get()
    const ev = await db.select().from(events).where(eq(events.id, s.eventId)).get()
    expect(mat?.bound).toBe(false)
    expect(ev?.version).toBe(2)
  })
})

describe('undoLastMatchEvent', () => {
  it('removes the last event and recomputes', async () => {
    const { db, s, matchId } = await liveMatch()
    await appendMatchEvent(db, { id: 'e1', matchId, type: 'score', athleteId: s.a1, actionKey: 'takedown', lastSeq: 0 })
    await appendMatchEvent(db, { id: 'e2', matchId, type: 'score', athleteId: s.a1, actionKey: 'mount', lastSeq: 1 })
    const { match: m } = await undoLastMatchEvent(db, { matchId, lastSeq: 2 })
    expect(m.pointsA).toBe(2)
    expect(m.lastSeq).toBe(1)
  })

  it('leaves the clock paused when undoing a terminal', async () => {
    const { db, s, matchId } = await liveMatch()
    await appendMatchEvent(db, { id: 'c1', matchId, type: 'clock_start', lastSeq: 0, at: T(0) })
    await appendMatchEvent(db, { id: 't1', matchId, type: 'terminal', athleteId: s.a1, actionKey: 'pin', lastSeq: 1, at: T(20) })
    const { match: m } = await undoLastMatchEvent(db, { matchId, lastSeq: 3 })
    expect(m.pendingTerminalKey).toBeNull()
    expect(m.clockStartedAt).toBeNull()
    expect(m.clockElapsedMs).toBe(20_000)
  })

  it('refuses to undo a clock pause but still undoes a clock start', async () => {
    const { db, matchId } = await liveMatch()
    await appendMatchEvent(db, { id: 'c1', matchId, type: 'clock_start', lastSeq: 0, at: T(0) })
    await appendMatchEvent(db, { id: 'c2', matchId, type: 'clock_pause', lastSeq: 1, at: T(30) })
    await expect(undoLastMatchEvent(db, { matchId, lastSeq: 2 })).rejects.toThrow(/press Start to resume the clock/)
    const other = await liveMatch()
    await appendMatchEvent(other.db, { id: 'c1', matchId: other.matchId, type: 'clock_start', lastSeq: 0, at: T(0) })
    const { match: m } = await undoLastMatchEvent(other.db, { matchId: other.matchId, lastSeq: 1 })
    expect(m.clockStartedAt).toBeNull()
    expect(m.lastSeq).toBe(0)
  })

  it('refuses on a done match, on a stale seq, and on an empty log', async () => {
    const { db, s, matchId } = await liveMatch()
    await expect(undoLastMatchEvent(db, { matchId, lastSeq: 0 })).rejects.toThrow(/nothing/)
    await appendMatchEvent(db, { id: 'e1', matchId, type: 'score', athleteId: s.a1, actionKey: 'takedown', lastSeq: 0 })
    await expect(undoLastMatchEvent(db, { matchId, lastSeq: 0 })).rejects.toThrow(SeqConflict)
    await endMatch(db, { id: 'end1', matchId, lastSeq: 1 })
    await expect(undoLastMatchEvent(db, { matchId, lastSeq: 2 })).rejects.toThrow(/done/)
  })
})
