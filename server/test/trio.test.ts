import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { freshDb, seedEvent } from './fixtures.js'
import { createTestApp, call } from './helpers.js'
import type { Db } from '../src/db/client.js'
import { athletes, divisionMembers, divisions, events, matches, proposals } from '../src/db/schema.js'
import { proposeMatches } from '../src/matchmaker/propose.js'

interface Kid { name: string; team: 'A' | 'B' | 'C'; age?: number; lbs?: number; gender?: string | null }

async function pool(db: Db, kids: Kid[]) {
  const s = await seedEvent(db, { matches: 0, thirdTeam: true })
  await db.delete(athletes).where(eq(athletes.eventId, s.eventId)).run()
  const teamOf = { A: s.teamA, B: s.teamB, C: s.teamC! }
  const rows = await db.insert(athletes).values(kids.map(k => ({
    eventId: s.eventId, teamId: teamOf[k.team], firstName: k.name, lastName: 'Vantel',
    age: k.age ?? 8, weightLbs: k.lbs ?? 62, belt: 'grey', gender: k.gender ?? null, source: 'manual' as const,
  }))).returning().all()
  const id = new Map(kids.map((k, i) => [k.name, rows[i].id]))
  return { s, id: (name: string) => id.get(name)! }
}

describe('three kids alone in a class from three teams become a round robin draft', () => {
  it('joins the stranded kid to the pair of the same class as one round robin row', async () => {
    const db = await freshDb()
    const { s, id } = await pool(db, [
      { name: 'Ana', team: 'A' },
      { name: 'Bea', team: 'B' },
      { name: 'Cal', team: 'C' },
    ])
    const out = await proposeMatches(db, s.eventId, 'gi')
    expect(out).toHaveLength(1)
    expect([out[0].a.athleteId, out[0].b.athleteId, out[0].c?.athleteId].sort()).toEqual([id('Ana'), id('Bea'), id('Cal')].sort())
    expect(out[0].why).toBe('round robin of three, 62 to 70 lbs')
  })

  it('leaves a kid out of the round robin when a class, a team, the cost cap, the veto or a rematch stands in the way', async () => {
    const cases: { title: string; kids: Kid[]; veto?: boolean; rows: number; trio: boolean }[] = [
      { title: 'another class', kids: [{ name: 'Ana', team: 'A' }, { name: 'Bea', team: 'B' }, { name: 'Cal', team: 'C', lbs: 75 }], rows: 1, trio: false },
      { title: 'same team as a side', kids: [{ name: 'Ana', team: 'A' }, { name: 'Bea', team: 'B' }, { name: 'Cal', team: 'A' }], rows: 1, trio: false },
      { title: 'past the cost cap', kids: [{ name: 'Ana', team: 'A' }, { name: 'Bea', team: 'B' }, { name: 'Cal', team: 'C', age: 20 }], rows: 1, trio: false },
      { title: 'the gender veto', kids: [{ name: 'Ana', team: 'A', gender: 'F' }, { name: 'Bea', team: 'B', gender: 'F' }, { name: 'Cal', team: 'C', gender: 'M' }], veto: true, rows: 1, trio: false },
      { title: 'four kids in two classes', kids: [{ name: 'Ana', team: 'A' }, { name: 'Bea', team: 'B' }, { name: 'Cal', team: 'C' }, { name: 'Dov', team: 'A', lbs: 120 }], rows: 1, trio: true },
    ]
    for (const c of cases) {
      const db = await freshDb()
      const { s } = await pool(db, c.kids)
      if (c.veto) await db.update(events).set({ sameGender: true }).where(eq(events.id, s.eventId)).run()
      const out = await proposeMatches(db, s.eventId, 'gi')
      expect(out, c.title).toHaveLength(c.rows)
      expect(out.some(p => p.c !== null), c.title).toBe(c.trio)
    }
  })
})

describe('confirming a round robin draft creates a division', () => {
  async function drafted() {
    const { app, db, adminToken } = await createTestApp()
    const { s, id } = await pool(db, [
      { name: 'Ana', team: 'A' },
      { name: 'Bea', team: 'B' },
      { name: 'Cal', team: 'C' },
      { name: 'Dov', team: 'A', lbs: 120 },
    ])
    const made = await call(app, 'POST', `/api/events/${s.eventId}/proposals`, { style: 'gi' }, adminToken)
    expect(made.status).toBe(200)
    expect(made.body).toHaveLength(1)
    expect(made.body[0].c).not.toBeNull()
    return { app, db, adminToken, s, id, draft: made.body[0] }
  }

  it('answers the division, writes three round robin matches and drops the draft', async () => {
    const { app, db, adminToken, s, draft } = await drafted()
    const r = await call(app, 'POST', `/api/proposals/${draft.id}/confirm`, undefined, adminToken)
    expect({ status: r.status, body: r.body }).toMatchObject({ status: 201 })
    expect(r.body.division.format).toBe('round_robin')
    expect(r.body.division.name).toBe('62 to 70 lbs round robin')
    const rows = await db.select().from(divisions).where(eq(divisions.eventId, s.eventId)).all()
    expect(rows).toHaveLength(1)
    expect(await db.select().from(divisionMembers).where(eq(divisionMembers.divisionId, rows[0].id)).all()).toHaveLength(3)
    expect(await db.select().from(matches).where(eq(matches.eventId, s.eventId)).all()).toHaveLength(3)
    expect(await db.select().from(proposals).where(eq(proposals.eventId, s.eventId)).all()).toEqual([])
  })

  it('refuses a swap on the draft and counts it in a confirm all', async () => {
    const { app, adminToken, s, draft, id } = await drafted()
    const swap = await call(app, 'PATCH', `/api/proposals/${draft.id}`, { athleteAId: id('Dov') }, adminToken)
    expect(swap.status).toBe(422)
    const all = await call(app, 'POST', `/api/events/${s.eventId}/proposals/confirm-all`, undefined, adminToken)
    expect(all.status).toBe(201)
    expect(all.body).toEqual({ created: 1, skipped: 0 })
  })
})
