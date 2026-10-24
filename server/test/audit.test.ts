import { describe, it, expect, vi, afterEach } from 'vitest'
import { asc, eq } from 'drizzle-orm'
import { createTestApp, call, matToken } from './helpers.js'
import { freshDb, seedEvent, failingWrites } from './fixtures.js'
import { startEvent } from '../src/match/mats.js'
import { athletes, auditLog, events, matchEvents, matches, mats, rosterCandidates } from '../src/db/schema.js'
import { actorOfMatchEventId } from '../src/audit/log.js'
import type { Db } from '../src/db/client.js'
import { BOUND_WINDOW_MS } from '../src/live/bound.js'
import { DEFAULT_LENGTH_SEC } from '../src/shared/types.js'

const T0 = Date.parse('2026-08-27T18:00:00.000Z')

afterEach(() => vi.useRealTimers())

async function rows(db: Db, eventId: number) {
  return db.select().from(auditLog).where(eq(auditLog.eventId, eventId)).orderBy(asc(auditLog.id)).all()
}

async function actions(db: Db, eventId: number) {
  return (await rows(db, eventId)).map(r => `${r.actor} ${r.action}`)
}

async function last(db: Db, eventId: number) {
  const all = await rows(db, eventId)
  return all[all.length - 1]
}

describe('every write records an audit row', () => {
  it('names the mat that scored, and carries the seq and the action', async () => {
    const { app, db } = await createTestApp()
    const s = await seedEvent(db, { live: true })
    const token = matToken(s.eventId, s.matIds[0])
    const r = await call(app, 'POST', `/api/matches/${s.matchIds[0]}/events`, { id: 'score-0001', type: 'score', athleteId: s.a1, actionKey: 'mount', lastSeq: 0 }, token)
    expect(r.status).toBe(200)
    const row = await last(db, s.eventId)
    expect(row.actor).toBe('mat:1')
    expect(row.action).toBe('score')
    expect(row.matchId).toBe(s.matchIds[0])
    expect(row.detail).toEqual({ seq: 1, athleteId: s.a1, actionKey: 'mount', points: 4, label: 'Mount' })
  })

  it('keeps what the press was worth, so editing the ruleset later cannot rewrite it', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { live: true })
    const token = matToken(s.eventId, s.matIds[0])
    await call(app, 'POST', `/api/matches/${s.matchIds[0]}/events`, { id: 'score-0001', type: 'score', athleteId: s.a1, actionKey: 'mount', lastSeq: 0 }, token)
    const edited = await call(app, 'PATCH', `/api/rulesets/${s.rulesetId}`, {
      actions: [{ key: 'mount', label: 'Mount position', points: 9 }],
    }, adminToken)
    expect(edited.status).toBe(200)
    const score = (await rows(db, s.eventId)).find(r => r.action === 'score')
    expect(score?.detail).toMatchObject({ actionKey: 'mount', points: 4, label: 'Mount' })
  })

  it('records nothing extra when the same press arrives twice', async () => {
    const { app, db } = await createTestApp()
    const s = await seedEvent(db, { live: true })
    const token = matToken(s.eventId, s.matIds[0])
    const body = { id: 'score-0001', type: 'score', athleteId: s.a1, actionKey: 'mount', lastSeq: 0 }
    await call(app, 'POST', `/api/matches/${s.matchIds[0]}/events`, body, token)
    await call(app, 'POST', `/api/matches/${s.matchIds[0]}/events`, body, token)
    expect((await actions(db, s.eventId)).filter(a => a.endsWith('score'))).toEqual(['mat:1 score'])
  })

  it('carries the deleted row inside the undo, because the match log no longer has it', async () => {
    const { app, db } = await createTestApp()
    const s = await seedEvent(db, { live: true })
    const token = matToken(s.eventId, s.matIds[0])
    const url = `/api/matches/${s.matchIds[0]}`
    await call(app, 'POST', `${url}/events`, { id: 'score-0001', type: 'score', athleteId: s.a1, actionKey: 'mount', lastSeq: 0 }, token)
    const undone = await call(app, 'DELETE', `${url}/events/last`, { lastSeq: 1 }, token)
    expect(undone.status).toBe(200)
    const row = await last(db, s.eventId)
    expect(row.actor).toBe('mat:1')
    expect(row.action).toBe('undo')
    expect(row.detail).toMatchObject({ seq: 1, type: 'score', actor: 'mat:1', athleteId: s.a1, actionKey: 'mount', points: 4 })
  })

  it('reads a row\'s own actor off its id, so an undone desk write would still say desk', () => {
    expect(actorOfMatchEventId('entry:abc-0002', 'mat:1')).toBe('desk')
    expect(actorOfMatchEventId('admin:12:3', 'mat:1')).toBe('admin')
    expect(actorOfMatchEventId('expiry:12:3', 'mat:1')).toBe('system')
    expect(actorOfMatchEventId('tablet-0001', 'mat:1')).toBe('mat:1')
  })

  it('records the end with its result, the added time with its length, and the reopen and skip', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { matCount: 1, live: true })
    const [first, second] = s.matchIds
    const token = matToken(s.eventId, s.matIds[0])
    await call(app, 'POST', `/api/matches/${first}/clock/extend`, { id: 'add-0001', lastSeq: 0, addMs: 60_000 }, token)
    expect((await last(db, s.eventId)).detail).toEqual({ seq: 1, addMs: 60_000 })
    await call(app, 'POST', `/api/matches/${first}/end`, { id: 'end-0001', lastSeq: 1, winnerAthleteId: s.a1 }, token)
    const all = await rows(db, s.eventId)
    const [ended, advanced] = all.slice(-2)
    expect(ended.actor).toBe('mat:1')
    expect(ended.action).toBe('end')
    expect(ended.detail).toEqual({ seq: 2, winnerAthleteId: s.a1, winType: 'decision' })
    expect(advanced).toMatchObject({ actor: 'mat:1', action: 'advance', matchId: second })
    await call(app, 'POST', `/api/matches/${first}/reopen`, undefined, adminToken)
    expect(await last(db, s.eventId)).toMatchObject({ actor: 'admin', action: 'reopen', matchId: first })
    await call(app, 'POST', `/api/matches/${second}/skip`, { id: 'skip-0001' }, adminToken)
    expect(await last(db, s.eventId)).toMatchObject({ actor: 'admin', action: 'skip', matchId: second })
  })

  it('records a typed result as an entry and a retyped one as a correction with both sides', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { live: true, mode: 'entry' })
    const url = `/api/matches/${s.matchIds[0]}/entry`
    await call(app, 'POST', url, { entryId: 'entry-0001', pointsA: 4, pointsB: 2, winnerAthleteId: s.a1, winType: 'points' }, adminToken)
    const entry = await last(db, s.eventId)
    expect(entry.actor).toBe('desk')
    expect(entry.action).toBe('entry')
    expect(entry.detail).toEqual({ pointsA: 4, pointsB: 2, winnerAthleteId: s.a1, winType: 'points' })

    await call(app, 'POST', url, { entryId: 'entry-0002', pointsA: 1, pointsB: 6, winnerAthleteId: s.b1, winType: 'points' }, adminToken)
    const fixed = await last(db, s.eventId)
    expect(fixed.action).toBe('correction')
    expect(fixed.detail).toEqual({
      before: { pointsA: 4, pointsB: 2, winnerAthleteId: s.a1, winType: 'points' },
      after: { pointsA: 1, pointsB: 6, winnerAthleteId: s.b1, winType: 'points' },
    })
  })

  it('keeps the reason a correction was given, in the match log and in the audit row', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { live: true, mode: 'entry' })
    const url = `/api/matches/${s.matchIds[0]}/entry`
    await call(app, 'POST', url, { entryId: 'entry-0001', pointsA: 4, pointsB: 2, winnerAthleteId: s.a1, winType: 'points' }, adminToken)
    const fixed = await call(app, 'POST', url, {
      entryId: 'entry-0002', pointsA: 1, pointsB: 6, winnerAthleteId: s.b1, winType: 'points',
      reason: 'the mat called the wrong colour',
    }, adminToken)
    expect(fixed.status).toBe(200)
    expect((await last(db, s.eventId)).detail).toMatchObject({ reason: 'the mat called the wrong colour' })
    const log = await db.select().from(matchEvents).where(eq(matchEvents.matchId, s.matchIds[0])).all()
    expect(log.at(-1)?.payload).toEqual({ kind: 'edit_result', winnerAthleteId: s.b1, winType: 'points', reason: 'the mat called the wrong colour' })

    const tooLong = await call(app, 'POST', url, {
      entryId: 'entry-0003', pointsA: 1, pointsB: 6, winnerAthleteId: s.b1, winType: 'points', reason: 'x'.repeat(121),
    }, adminToken)
    expect(tooLong.status).toBe(422)
    const blank = await call(app, 'POST', url, {
      entryId: 'entry-0004', pointsA: 2, pointsB: 2, winnerAthleteId: s.a1, winType: 'decision', reason: '',
    }, adminToken)
    expect(blank.status).toBe(200)
    expect((await last(db, s.eventId)).detail).not.toHaveProperty('reason')
  })

  it('says whether the desk made a match for the pair it typed', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { live: true, mode: 'entry' })
    const onDesigned = await call(app, 'POST', `/api/events/${s.eventId}/entries`, {
      entryId: 'entry-0001', athleteAId: s.a1, athleteBId: s.b1, pointsA: 2, pointsB: 0, winnerAthleteId: s.a1, winType: 'points',
    }, adminToken)
    expect(onDesigned.status).toBe(201)
    expect(await last(db, s.eventId)).toMatchObject({ actor: 'desk', action: 'entry', detail: { created: false } })

    const adHoc = await call(app, 'POST', `/api/events/${s.eventId}/entries`, {
      entryId: 'entry-0002', athleteAId: s.a1, athleteBId: s.b2, pointsA: 5, pointsB: 0, winnerAthleteId: s.a1, winType: 'submission',
    }, adminToken)
    expect(adHoc.status).toBe(201)
    expect(await last(db, s.eventId)).toMatchObject({ action: 'entry', detail: { created: true, winType: 'submission' } })
  })

  it('records the create, and one row per concern a patch changes', async () => {
    const { app, db, adminToken } = await createTestApp()
    const created = await call(app, 'POST', '/api/events', {
      name: 'Fall Duals', date: '2026-10-03', matCount: 2,
      teams: [{ name: 'Ridgeline', color: 'red' }, { name: 'Lakeside', color: 'blue' }],
    }, adminToken)
    expect(created.status).toBe(201)
    const eventId = created.body.event.id
    expect(await last(db, eventId)).toMatchObject({
      actor: 'admin', action: 'create',
      detail: { name: 'Fall Duals', date: '2026-10-03', matCount: 2, mode: 'live', teams: ['Ridgeline', 'Lakeside'] },
    })

    await call(app, 'PATCH', `/api/events/${eventId}`, {
      name: 'Fall Duals 2026', mode: 'entry', matCount: 3, contactName: 'Dana Vale', contactPhone: '555 0147',
    }, adminToken)
    expect(await actions(db, eventId)).toEqual([
      'admin create', 'admin mat_count', 'admin event_edit', 'admin mode', 'admin contact',
    ])
    const all = await rows(db, eventId)
    expect(all[1].detail).toEqual({ from: 2, to: 3 })
    expect(all[2].detail).toEqual({ name: 'Fall Duals 2026' })
    expect(all[3].detail).toEqual({ from: 'live', to: 'entry' })
    expect(all[4].detail).toEqual({ name: 'Dana Vale', phone: '555 0147' })
  })

  it('records only the fields a patch moved, and nothing when the form comes back unchanged', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db)
    const url = `/api/events/${s.eventId}`
    await call(app, 'PATCH', url, { name: 'Fall Duals 2026', date: '2026-10-03' }, adminToken)
    const edits = (await rows(db, s.eventId)).filter(r => r.action === 'event_edit')
    expect(edits.map(r => r.detail)).toEqual([{ name: 'Fall Duals 2026' }])

    await call(app, 'PATCH', url, { name: 'Fall Duals 2026', date: '2026-10-03', sameGender: false }, adminToken)
    expect((await rows(db, s.eventId)).filter(r => r.action === 'event_edit')).toHaveLength(1)
  })

  it('records the far correction as its own row, not as event_edit, and only when it moves', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db)
    const url = `/api/events/${s.eventId}`

    await call(app, 'PATCH', url, { far: 1.1 }, adminToken)
    expect(await actions(db, s.eventId)).toEqual(['admin far'])
    expect((await last(db, s.eventId)).detail).toEqual({ far: 1.1 })

    await call(app, 'PATCH', url, { far: 1.1 }, adminToken)
    expect((await rows(db, s.eventId)).filter(r => r.action === 'far')).toHaveLength(1)

    await call(app, 'PATCH', url, { far: null }, adminToken)
    expect(await last(db, s.eventId)).toMatchObject({ action: 'far', detail: { far: null } })
  })

  it('records start, finish, a team edit, and a delete that outlives its event', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db)
    await call(app, 'PATCH', `/api/events/${s.eventId}/teams/${s.teamA}`, { name: 'Ridgeline BJJ' }, adminToken)
    expect(await last(db, s.eventId)).toMatchObject({
      actor: 'admin', action: 'team_edit',
      detail: { teamId: s.teamA, before: { name: 'Ridgeline', color: 'red' }, after: { name: 'Ridgeline BJJ', color: 'red' } },
    })
    await call(app, 'PATCH', `/api/events/${s.eventId}`, { status: 'live' }, adminToken)
    expect(await last(db, s.eventId)).toMatchObject({ action: 'start', detail: { mode: 'live' } })
    await call(app, 'PATCH', `/api/events/${s.eventId}`, { status: 'done' }, adminToken)
    expect(await last(db, s.eventId)).toMatchObject({ action: 'finish' })

    const other = await seedEvent(db)
    expect((await call(app, 'DELETE', `/api/events/${other.eventId}`, undefined, adminToken)).status).toBe(204)
    expect(await db.select().from(events).where(eq(events.id, other.eventId)).get()).toBeUndefined()
    expect(await last(db, other.eventId)).toMatchObject({ action: 'delete', detail: { name: 'Fall Duals', date: '2026-10-03' } })
  })

  it('records every roster write with its count and its athlete', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { matches: 0 })
    const url = `/api/events/${s.eventId}/athletes`
    await call(app, 'POST', url, { manual: { firstName: 'Rowan', lastName: 'Vale', teamId: s.teamA } }, adminToken)
    expect(await last(db, s.eventId)).toMatchObject({ actor: 'admin', action: 'roster_add', detail: { kind: 'manual', count: 1, name: 'Rowan Vale' } })
    await call(app, 'POST', url, { bulk: [{ firstName: 'Iris', lastName: 'Nakamura' }, { firstName: 'Theo', lastName: 'Bell' }] }, adminToken)
    expect(await last(db, s.eventId)).toMatchObject({ action: 'roster_add', detail: { kind: 'bulk', count: 2 } })
    await call(app, 'PATCH', `/api/athletes/${s.a1}`, { weightLbs: 64 }, adminToken)
    expect(await last(db, s.eventId)).toMatchObject({ action: 'roster_edit', detail: { athleteId: s.a1, name: 'Mateo Rivera' } })
    await call(app, 'POST', `${url}/assign`, { ids: [s.a1, s.a2], teamId: s.teamB }, adminToken)
    expect(await last(db, s.eventId)).toMatchObject({ action: 'roster_assign', detail: { count: 2, teamId: s.teamB } })
    expect((await call(app, 'DELETE', `/api/athletes/${s.a1}`, undefined, adminToken)).status).toBe(204)
    expect(await last(db, s.eventId)).toMatchObject({ action: 'roster_remove', detail: { athleteId: s.a1, name: 'Mateo Rivera' } })
  })

  it('records the matches created, edited, reordered, and deleted', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { matches: 0 })
    const created = await call(app, 'POST', `/api/events/${s.eventId}/matches`, { athleteAId: s.a1, athleteBId: s.b1 }, adminToken)
    expect(created.status).toBe(201)
    const matchId = created.body.id
    expect(await last(db, s.eventId)).toMatchObject({ action: 'match_create', matchId, detail: { athleteAId: s.a1, athleteBId: s.b1 } })
    await call(app, 'PATCH', `/api/matches/${matchId}`, { lengthSec: 240 }, adminToken)
    expect(await last(db, s.eventId)).toMatchObject({ action: 'match_edit', matchId, detail: { lengthSec: 240, fields: ['lengthSec'] } })
    await call(app, 'POST', `/api/events/${s.eventId}/matches/reorder`, { ids: [matchId] }, adminToken)
    expect(await last(db, s.eventId)).toMatchObject({ action: 'reorder', detail: { count: 1, ids: [matchId] } })
    expect((await call(app, 'DELETE', `/api/matches/${matchId}`, undefined, adminToken)).status).toBe(204)
    expect(await last(db, s.eventId)).toMatchObject({ action: 'match_delete', matchId })
  })

  it('records a ruleset created, edited, and deleted', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { matches: 0 })
    const body = { name: 'Short', defaultLengthSec: 120, actions: [{ key: 'takedown', label: 'Takedown', points: 2 }], terminals: [] }
    const created = await call(app, 'POST', `/api/events/${s.eventId}/rulesets`, body, adminToken)
    expect(created.status).toBe(201)
    expect(await last(db, s.eventId)).toMatchObject({ action: 'ruleset_create', detail: { rulesetId: created.body.id, name: 'Short' } })
    await call(app, 'PATCH', `/api/rulesets/${created.body.id}`, { name: 'Shorter' }, adminToken)
    expect(await last(db, s.eventId)).toMatchObject({ action: 'ruleset_edit', detail: { name: 'Shorter', fields: ['name'] } })
    expect((await call(app, 'DELETE', `/api/rulesets/${created.body.id}`, undefined, adminToken)).status).toBe(204)
    expect(await last(db, s.eventId)).toMatchObject({ action: 'ruleset_delete', detail: { name: 'Shorter' } })
  })

  it('records a bind, a takeover, an advance, and an unbind by whoever asked for it', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { matCount: 1, live: true })
    const url = `/api/events/${s.eventId}/mats/${s.matIds[0]}/bind`
    const first = await call(app, 'POST', url, { code: '0420' })
    expect(first.status).toBe(200)
    expect(await last(db, s.eventId)).toMatchObject({ actor: 'mat:1', action: 'bind', detail: { matNumber: 1, epoch: 1 } })
    const over = await call(app, 'POST', url, { code: '0420', takeOver: true })
    expect(over.status).toBe(200)
    expect(await last(db, s.eventId)).toMatchObject({ actor: 'mat:1', action: 'takeover', detail: { epoch: 2 } })
    expect((await call(app, 'POST', `/api/mats/${s.matIds[0]}/unbind`, {}, over.body.token)).status).toBe(200)
    expect(await last(db, s.eventId)).toMatchObject({ actor: 'mat:1', action: 'unbind' })
    expect((await call(app, 'POST', `/api/mats/${s.matIds[0]}/unbind`, {}, adminToken)).status).toBe(200)
    expect(await last(db, s.eventId)).toMatchObject({ actor: 'admin', action: 'unbind' })
  })

  it('records an advance the Live panel asked for', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { matCount: 1, live: true })
    await db.update(matches).set({ status: 'pending' }).where(eq(matches.id, s.matchIds[0])).run()
    await db.update(mats).set({ currentMatchId: null }).where(eq(mats.id, s.matIds[0])).run()
    const advanced = await call(app, 'POST', `/api/mats/${s.matIds[0]}/advance`, undefined, adminToken)
    expect(advanced.status).toBe(200)
    expect(await last(db, s.eventId)).toMatchObject({ actor: 'admin', action: 'advance', detail: { matNumber: 1 } })
  })

  it('signs a clock the server expired, and a tablet it stopped hearing from, as system', async () => {
    const { app, db } = await createTestApp()
    const s = await seedEvent(db, { matCount: 1, live: true })
    const token = matToken(s.eventId, s.matIds[0])
    vi.useFakeTimers({ now: T0 })
    await call(app, 'POST', `/api/mats/${s.matIds[0]}/heartbeat`, {}, token)
    await call(app, 'POST', `/api/matches/${s.matchIds[0]}/events`, { id: 'clk-0001', type: 'clock_start', lastSeq: 0 }, token)
    vi.setSystemTime(T0 + DEFAULT_LENGTH_SEC * 1000 + BOUND_WINDOW_MS + 1_000)
    await call(app, 'GET', `/api/events/${s.eventId}/snapshot`)
    const sweeps = (await rows(db, s.eventId)).filter(r => r.actor === 'system')
    expect(sweeps.map(r => r.action)).toEqual(['clock_pause', 'unbind'])
    expect(sweeps[0].detail).toMatchObject({ expiry: true, seq: 2 })
    expect(sweeps[1].detail).toEqual({ reaped: true, mats: [1] })
  })

  it('writes one roster_edit row per kid, each carrying the scoring value', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { matches: 0 })
    await call(app, 'POST', `/api/events/${s.eventId}/athletes/scoring`, { ids: [s.a1, s.a2], scoring: true }, adminToken)
    const rows = await db.select().from(auditLog).where(eq(auditLog.eventId, s.eventId)).all()
    const edits = rows.filter(r => r.action === 'roster_edit' && [s.a1, s.a2].includes((r.detail as { athleteId?: number }).athleteId ?? -1))
    expect(edits).toHaveLength(2)
    expect(edits.every(r => (r.detail as { scoring?: boolean }).scoring === true)).toBe(true)
  })

  it('writes an advance row per mat a start loads, attributed to system', async () => {
    const db = await freshDb()
    const s = await seedEvent(db, { matCount: 2 })
    await startEvent(db, s.eventId)
    const rows = await db.select().from(auditLog).where(eq(auditLog.eventId, s.eventId)).orderBy(auditLog.id).all()
    expect(rows.map(r => [r.actor, r.action, r.matchId])).toEqual([
      ['system', 'advance', s.matchIds[0]],
      ['system', 'advance', s.matchIds[1]],
    ])
  })

  it('records the proposals, the divisions, a schedule apply, a link, a dismiss, a certify and an uncertify, and the standings', async () => {
    const smoothcompFetch = (async () => new Response('{"brackets":[]}', { status: 200 })) as typeof fetch
    const { app, db, adminToken } = await createTestApp({ adminPin: '123456', smoothcomp: { fetchFn: smoothcompFetch, backoffMs: 0 } })
    const s = await seedEvent(db, { matches: 0 })
    const added = async (send: () => Promise<{ status: number }>) => {
      const before = (await rows(db, s.eventId)).length
      const r = await send()
      expect(r.status).toBeLessThan(300)
      return (await rows(db, s.eventId)).slice(before).map(row => row.action)
    }

    expect(await added(() => call(app, 'POST', `/api/events/${s.eventId}/proposals`, { style: 'gi' }, adminToken))).toEqual(['propose'])
    const [draft] = (await call(app, 'GET', `/api/events/${s.eventId}/proposals`, undefined, adminToken)).body
    expect(await added(() => call(app, 'POST', `/api/proposals/${draft.id}/confirm`, undefined, adminToken))).toContain('match_create')

    let divisionId = 0
    expect(await added(async () => {
      const r = await call(app, 'POST', `/api/events/${s.eventId}/divisions`, { name: 'Novice', format: 'round_robin', styles: 'gi', athleteIds: [s.a2, s.b2] }, adminToken)
      divisionId = r.body.division.id
      return r
    })).toContain('division_create')
    expect(await added(() => call(app, 'PATCH', `/api/divisions/${divisionId}`, { name: 'Novice gi' }, adminToken))).toContain('division_edit')
    expect(await added(() => call(app, 'DELETE', `/api/divisions/${divisionId}`, undefined, adminToken))).toContain('division_delete')

    expect(await added(() => call(app, 'POST', `/api/events/${s.eventId}/schedule`, { apply: true }, adminToken))).toEqual(['schedule'])

    await db.insert(rosterCandidates).values([
      { eventId: s.eventId, wlUid: 'wl-1', firstName: 'Mateo', lastName: 'Rivera' },
      { eventId: s.eventId, wlUid: 'wl-2', firstName: 'Matteo', lastName: 'Rivero' },
    ]).run()
    expect(await added(() => call(app, 'POST', `/api/athletes/${s.a1}/link`, { wlUid: 'wl-1' }, adminToken))).toEqual(['roster_link'])
    expect(await added(() => call(app, 'POST', `/api/athletes/${s.a2}/dismiss`, { wlUid: 'wl-2' }, adminToken))).toEqual(['roster_edit'])

    await db.update(events).set({ status: 'done', smoothcompUrl: 'https://smoothcomp.com/en/event/29499' }).where(eq(events.id, s.eventId)).run()
    expect(await added(() => call(app, 'POST', `/api/events/${s.eventId}/smoothcomp/standings`, undefined, adminToken))).toEqual(['smoothcomp_standings'])
    expect(await added(() => call(app, 'POST', `/api/events/${s.eventId}/certify`, { pin: '123456' }, adminToken))).toEqual(['certify'])
    expect(await added(() => call(app, 'POST', `/api/events/${s.eventId}/uncertify`, { pin: '123456', reason: 'a result was typed on the wrong match' }, adminToken))).toEqual(['uncertify'])
  })

  it('leaves no audit row behind when a later write in the same transaction fails', async () => {
    const { db } = await createTestApp()
    const s = await seedEvent(db, { live: true })
    const broken = failingWrites(db, w => w.op === 'update' && w.table === events && 'version' in (w.payload as object))
    const { app, adminToken } = await createTestApp({ db: broken })
    const token = matToken(s.eventId, s.matIds[0])
    await db.insert(rosterCandidates).values({ eventId: s.eventId, wlUid: 'wl-1', firstName: 'Mateo', lastName: 'Rivera' }).run()
    const before = await rows(db, s.eventId)
    const writes: [string, string, unknown, string][] = [
      ['POST', `/api/matches/${s.matchIds[0]}/events`, { id: 'score-0001', type: 'score', athleteId: s.a1, actionKey: 'mount', lastSeq: 0 }, token],
      ['POST', `/api/events/${s.eventId}/schedule`, { apply: true }, adminToken],
      ['POST', `/api/athletes/${s.a1}/link`, { wlUid: 'wl-1' }, adminToken],
      ['PATCH', `/api/athletes/${s.a2}`, { age: 11 }, adminToken],
    ]
    for (const [method, path, body, bearer] of writes) {
      const r = await call(app, method, path, body, bearer)
      expect([path, r.status]).toEqual([path, 500])
    }
    expect(await rows(db, s.eventId)).toEqual(before)
    expect(await db.select().from(matchEvents).where(eq(matchEvents.matchId, s.matchIds[0])).all()).toEqual([])
    expect((await db.select().from(athletes).where(eq(athletes.id, s.a2)).get())?.age).toBe(9)
  })
})
