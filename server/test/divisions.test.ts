import { describe, it, expect } from 'vitest'
import { asc, eq } from 'drizzle-orm'
import { freshDb, seedEvent } from './fixtures.js'
import { athletes, auditLog, divisionMembers, matches } from '../src/db/schema.js'
import { createDivision, deleteDivision, loadDivisions, regenerateDivision } from '../src/formats/divisions.js'
import { seedByRating } from '../src/formats/generate.js'
import { createMatch } from '../src/match/create.js'

const shape = (m: { number: number; athleteAId: number | null; athleteBId: number | null; feedAMatchId: number | null; feedBMatchId: number | null }) =>
  ({ number: m.number, a: m.athleteAId, b: m.athleteBId, feedA: m.feedAMatchId, feedB: m.feedBMatchId })

describe('createDivision', () => {
  it('generates a single elimination of four, the final fed by both semifinals', async () => {
    const db = await freshDb()
    const s = await seedEvent(db, { matches: 0 })
    const { division, warnings } = await createDivision(db, s.eventId, {
      name: '47 to 53 boys', format: 'single_elim', styles: 'gi', athleteIds: [s.a1, s.a2, s.b1, s.b2],
    })
    expect(warnings).toEqual([])
    expect(division).toMatchObject({
      eventId: s.eventId, name: '47 to 53 boys', format: 'single_elim', styles: 'gi', position: 0, running: false,
    })
    expect(division.members.map(m => [m.seed, m.athleteId])).toEqual([[1, s.a1], [2, s.a2], [3, s.b1], [4, s.b2]])
    expect(division.members[0]).toMatchObject({ firstName: 'Mateo', lastName: 'Rivera', teamId: s.teamA, erp: 6.1 })

    const rows = await db.select().from(matches).where(eq(matches.eventId, s.eventId)).orderBy(asc(matches.number)).all()
    expect(division.matchIds).toEqual(rows.map(m => m.id))
    expect(rows.map(shape)).toEqual([
      { number: 1, a: s.a1, b: s.b2, feedA: null, feedB: null },
      { number: 2, a: s.a2, b: s.b1, feedA: null, feedB: null },
      { number: 3, a: null, b: null, feedA: rows[0].id, feedB: rows[1].id },
    ])
    expect(rows.map(m => [m.round, m.why, m.style, m.source, m.matId, m.divisionId])).toEqual([
      [1, '47 to 53 boys, semifinal', 'gi', 'generated', null, division.id],
      [1, '47 to 53 boys, semifinal', 'gi', 'generated', null, division.id],
      [2, '47 to 53 boys, final', 'gi', 'generated', null, division.id],
    ])
    expect([rows[2].feedATake, rows[2].feedBTake]).toEqual(['winner', 'winner'])
  })

  it('records one division_create row naming what it made', async () => {
    const db = await freshDb()
    const s = await seedEvent(db, { matches: 0 })
    const { division } = await createDivision(db, s.eventId, {
      name: 'Novice', format: 'round_robin', styles: 'both', athleteIds: [s.a1, s.b1, s.b2],
    })
    const row = await db.select().from(auditLog).where(eq(auditLog.action, 'division_create')).get()
    expect(row?.detail).toEqual({ divisionId: division.id, name: 'Novice', format: 'round_robin', styles: 'both', members: 3, matches: 4 })
  })

  it('refuses a kid off a team, a kid off the event, a kid twice, and a count out of range', async () => {
    const db = await freshDb()
    const s = await seedEvent(db, { matches: 0, thirdTeam: true })
    const other = await seedEvent(db, { matches: 0 })
    const loose = await db.insert(athletes).values({
      eventId: s.eventId, teamId: null, firstName: 'Ines', lastName: 'Baptista', source: 'manual',
    }).returning().get()
    const input = { name: 'Novice', format: 'single_elim' as const, styles: 'gi' as const }
    await expect(createDivision(db, s.eventId, { ...input, athleteIds: [s.a1, loose.id] })).rejects.toThrow('every kid must be on a team')
    await expect(createDivision(db, s.eventId, { ...input, athleteIds: [s.a1, other.b1] })).rejects.toThrow('every kid must be on this event')
    await expect(createDivision(db, s.eventId, { ...input, athleteIds: [s.a1, s.a1] })).rejects.toThrow('a kid can only be in a division once')
    await expect(createDivision(db, s.eventId, { ...input, athleteIds: [s.a1] })).rejects.toThrow('a single elimination takes 2 to 16 kids')
    await expect(createDivision(db, s.eventId, { ...input, format: 'double_elim', athleteIds: [s.a1, s.b1] }))
      .rejects.toThrow('a double elimination takes 3 to 16 kids')
    expect(await loadDivisions(db, s.eventId)).toEqual([])
    expect(await db.select().from(matches).where(eq(matches.eventId, s.eventId)).all()).toEqual([])
  })
})

describe('regenerateDivision', () => {
  it('rebuilds the matches with new numbers when a member is swapped out', async () => {
    const db = await freshDb()
    const s = await seedEvent(db, { matches: 0, thirdTeam: true })
    const spare = await db.insert(athletes).values({
      eventId: s.eventId, teamId: s.teamC, firstName: 'Ines', lastName: 'Baptista', source: 'manual', erp: 8.4,
    }).returning().get()
    // A pair made by hand holds M1, so the division's own numbers start after it and are
    // minted again from the event's maximum once the old ones are gone.
    await createMatch(db, { eventId: s.eventId, athleteAId: s.a1, athleteBId: s.b1, source: 'designed' })
    const made = await createDivision(db, s.eventId, {
      name: 'Novice', format: 'single_elim', styles: 'gi', athleteIds: [s.a1, s.a2, s.b1, s.b2],
    })
    expect(made.division.matchIds).toHaveLength(3)
    const { division } = await regenerateDivision(db, made.division.id, { name: 'Novice A', athleteIds: [s.a1, s.a2, s.b1, spare.id] })
    expect(division.name).toBe('Novice A')
    expect(division.members.map(m => m.athleteId)).toEqual([s.a1, s.a2, s.b1, spare.id])
    const rows = await db.select().from(matches).where(eq(matches.divisionId, division.id)).orderBy(asc(matches.number)).all()
    expect(rows.map(m => m.number)).toEqual([2, 3, 4])
    expect(rows.map(shape).map(r => [r.a, r.b])).toEqual([[s.a1, spare.id], [s.a2, s.b1], [null, null]])
    expect((await db.select().from(auditLog).where(eq(auditLog.action, 'match_delete')).all())).toHaveLength(3)
    expect((await db.select().from(auditLog).where(eq(auditLog.action, 'division_edit')).get())?.detail)
      .toMatchObject({ divisionId: division.id, name: 'Novice A', matches: 3 })
  })

  it('reseeds by rating and keeps unrated kids in the listed order', async () => {
    const db = await freshDb()
    const s = await seedEvent(db, { matches: 0 })
    const made = await createDivision(db, s.eventId, {
      name: 'Novice', format: 'single_elim', styles: 'gi', athleteIds: [s.a2, s.b2, s.a1, s.b1],
    })
    const { division } = await regenerateDivision(db, made.division.id, { athleteIds: seedByRating(made.division.members) })
    expect(division.members.map(m => m.athleteId)).toEqual([s.a1, s.b1, s.a2, s.b2])
  })

  it('refuses once a match of the division is live, and changes nothing', async () => {
    const db = await freshDb()
    const s = await seedEvent(db, { matches: 0 })
    const made = await createDivision(db, s.eventId, {
      name: 'Novice', format: 'single_elim', styles: 'gi', athleteIds: [s.a1, s.a2, s.b1, s.b2],
    })
    await db.update(matches).set({ status: 'live' }).where(eq(matches.id, made.division.matchIds[0])).run()
    await expect(regenerateDivision(db, made.division.id, { name: 'Novice A' })).rejects.toThrow('division is running')
    await expect(deleteDivision(db, made.division.id)).rejects.toThrow('division is running')
    const after = await loadDivisions(db, s.eventId)
    expect(after[0]).toMatchObject({ name: 'Novice', running: true })
    expect(after[0].matchIds).toEqual(made.division.matchIds)
  })
})

describe('deleteDivision', () => {
  it('takes the division, its members and its matches with it', async () => {
    const db = await freshDb()
    const s = await seedEvent(db, { matches: 0 })
    const made = await createDivision(db, s.eventId, {
      name: 'Novice', format: 'single_elim', styles: 'gi', athleteIds: [s.a1, s.a2, s.b1, s.b2],
    })
    await deleteDivision(db, made.division.id)
    expect(await loadDivisions(db, s.eventId)).toEqual([])
    expect(await db.select().from(matches).where(eq(matches.eventId, s.eventId)).all()).toEqual([])
    expect(await db.select().from(divisionMembers).all()).toEqual([])
    expect((await db.select().from(auditLog).where(eq(auditLog.action, 'match_delete')).all())).toHaveLength(3)
    expect((await db.select().from(auditLog).where(eq(auditLog.action, 'division_delete')).get())?.detail)
      .toMatchObject({ divisionId: made.division.id, name: 'Novice' })
  })
})

describe('loadDivisions', () => {
  it('reads the divisions in position order with their warnings recomputed', async () => {
    const db = await freshDb()
    const s = await seedEvent(db, { matches: 0 })
    await createDivision(db, s.eventId, { name: 'First', format: 'round_robin', styles: 'gi', athleteIds: [s.a1, s.b1] })
    await createDivision(db, s.eventId, { name: 'Second', format: 'single_elim', styles: 'gi', athleteIds: [s.a1, s.a2, s.b1, s.b2] })
    const [first, second] = await loadDivisions(db, s.eventId)
    expect([first.name, first.position, second.name, second.position]).toEqual(['First', 0, 'Second', 1])
    expect(second.matchIds).toHaveLength(3)

    // A reload recomputes the warnings from the members it finds, so the two always agree.
    const { division } = await regenerateDivision(db, second.id, { athleteIds: [s.a1, s.a2, s.b1, s.b2].reverse() })
    expect(division.warnings).toEqual([])
    const reloaded = await loadDivisions(db, s.eventId)
    expect(reloaded[1].warnings).toEqual(division.warnings)
  })
})
