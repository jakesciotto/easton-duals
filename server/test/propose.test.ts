import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { freshDb, seedEvent } from './fixtures.js'
import { createTestApp, call } from './helpers.js'
import type { Db } from '../src/db/client.js'
import { athletes, auditLog, divisionMembers, divisions, events, matches, proposals } from '../src/db/schema.js'
import { proposeMatches, pairCost, pairWarnings, pairWhy, MAX_PAIR_COST } from '../src/matchmaker/propose.js'

interface Kid {
  name: string
  team: 'A' | 'B' | 'C'
  age?: number | null
  lbs?: number | null
  belt?: string | null
  gender?: string | null
  erp?: number | null
}

// The proposer reads a whole pool, so these tests write the pool themselves rather than
// working around the fixture's own four kids.
async function pool(db: Db, kids: Kid[]) {
  const s = await seedEvent(db, { matches: 0, thirdTeam: true })
  await db.delete(athletes).where(eq(athletes.eventId, s.eventId)).run()
  const teamOf = { A: s.teamA, B: s.teamB, C: s.teamC! }
  const rows = await db.insert(athletes).values(kids.map(k => ({
    eventId: s.eventId, teamId: teamOf[k.team], firstName: k.name, lastName: 'Vantel',
    age: k.age === undefined ? 8 : k.age,
    weightLbs: k.lbs === undefined ? 62 : k.lbs,
    belt: k.belt === undefined ? 'grey' : k.belt,
    gender: k.gender ?? null, erp: k.erp ?? null, source: 'manual' as const,
  }))).returning().all()
  const id = new Map(kids.map((k, i) => [k.name, rows[i].id]))
  return { s, id: (name: string) => id.get(name)!, names: (p: { a: { firstName: string }; b: { firstName: string } }) => `${p.a.firstName} v ${p.b.firstName}` }
}

describe('pair cost ranks class, then age, then belt, then rating', () => {
  const side = (o: Partial<Parameters<typeof pairCost>[0]> = {}) => ({ id: 1, age: 8, weightLbs: 62, belt: 'grey', erp: null, ...o })

  it('weighs the class ten, the year two, the belt a half, and the rating a tenth', () => {
    expect(pairCost(side(), side({ id: 2 }))).toBe(0)
    expect(pairCost(side(), side({ id: 2, weightLbs: 75 }))).toBe(10)
    expect(pairCost(side(), side({ id: 2, age: 10 }))).toBe(4)
    expect(pairCost(side(), side({ id: 2, belt: 'yellow' }))).toBe(0.5)
    expect(pairCost(side({ erp: 6.1 }), side({ id: 2, erp: 5.8 }))).toBeCloseTo(0.03, 5)
    expect(pairCost(side({ erp: 6.1 }), side({ id: 2, erp: null }))).toBe(0)
    expect(pairCost(side({ belt: 'grey', erp: 6.1 }), side({ id: 2, age: 9, weightLbs: 75, belt: 'yellow', erp: 5.1 })))
      .toBeCloseTo(10 + 2 + 0.5 + 0.1, 5)
  })

  it('counts a missing age or weight as no gap at all', () => {
    expect(pairCost(side({ age: null }), side({ id: 2, age: 12 }))).toBe(0)
    expect(pairCost(side({ weightLbs: null }), side({ id: 2, weightLbs: 130 }))).toBe(0)
    expect(pairCost(side({ belt: null }), side({ id: 2 }))).toBe(1)
  })
})

describe('pairWhy', () => {
  const side = (o: Partial<Parameters<typeof pairWhy>[0]> = {}) => ({ id: 1, age: 8, weightLbs: 62, belt: 'grey', erp: null, ...o })

  it('says the class then the age', () => {
    expect(pairWhy(side(), side({ id: 2 }))).toBe('same class, same age')
    expect(pairWhy(side(), side({ id: 2, age: 9 }))).toBe('same class, 1 year apart')
    expect(pairWhy(side(), side({ id: 2, age: 11 }))).toBe('same class, 3 years apart')
    expect(pairWhy(side(), side({ id: 2, weightLbs: 75 }))).toBe('1 class apart, same age')
    expect(pairWhy(side(), side({ id: 2, weightLbs: 85, age: 9 }))).toBe('2 classes apart, 1 year apart')
  })

  it('says what it can when a kid has no age or weight', () => {
    expect(pairWhy(side({ age: null }), side({ id: 2 }))).toBe('same class')
    expect(pairWhy(side({ weightLbs: null }), side({ id: 2, age: 9 }))).toBe('1 year apart')
    expect(pairWhy(side({ age: null, weightLbs: null }), side({ id: 2 }))).toBe('missing age or weight')
  })
})

describe('a hand-designed pair warns and never refuses', () => {
  it('reports Already met only against a match of the same style', async () => {
    const db = await freshDb()
    const { s, id } = await pool(db, [
      { name: 'Ines', team: 'A' },
      { name: 'Bruno', team: 'B' },
    ])
    await db.insert(matches).values({
      eventId: s.eventId, number: 1, orderIndex: 0, rulesetId: s.rulesetId, lengthSec: 300, status: 'done',
      athleteAId: id('Ines'), athleteBId: id('Bruno'), style: 'gi',
    }).run()
    expect(await pairWarnings(db, s.eventId, id('Ines'), id('Bruno'), { style: 'gi' })).toEqual(['Already met'])
    expect(await pairWarnings(db, s.eventId, id('Ines'), id('Bruno'), { style: 'nogi' })).toEqual([])
  })

  it('defaults to gi, takes nogi on create, changes on patch, and warns per style', async () => {
    const { app, db, adminToken } = await createTestApp()
    const s = await seedEvent(db, { matches: 0 })
    const gi = await call(app, 'POST', `/api/events/${s.eventId}/matches`, { athleteAId: s.a1, athleteBId: s.b1 }, adminToken)
    expect(gi.status).toBe(201)
    expect(gi.body).toMatchObject({ style: 'gi', warnings: [] })
    const nogi = await call(app, 'POST', `/api/events/${s.eventId}/matches`, { athleteAId: s.a1, athleteBId: s.b1, style: 'nogi' }, adminToken)
    expect(nogi.status).toBe(201)
    expect(nogi.body).toMatchObject({ style: 'nogi', warnings: [] })
    const again = await call(app, 'POST', `/api/events/${s.eventId}/matches`, { athleteAId: s.a1, athleteBId: s.b1, style: 'nogi' }, adminToken)
    expect(again.body.warnings).toEqual(['Already met'])
    const patched = await call(app, 'PATCH', `/api/matches/${again.body.id}`, { style: 'gi' }, adminToken)
    expect(patched.status).toBe(200)
    expect(patched.body).toMatchObject({ style: 'gi', warnings: ['Already met'] })
    expect((await db.select().from(matches).where(eq(matches.id, again.body.id)).get())?.style).toBe('gi')
  })

  it('creates every cross-team pair with its class and age warnings, and refuses only a same-team, an off-event and a teamless pair', async () => {
    const { app, db, adminToken } = await createTestApp()
    const { s, id } = await pool(db, [
      { name: 'Ines', team: 'A', lbs: 62, age: 8 },
      { name: 'Bruno', team: 'B', lbs: 85, age: 11 },
      { name: 'Kai', team: 'C', lbs: 95, age: 12 },
      { name: 'Nadia', team: 'B', lbs: 130, age: 14 },
      { name: 'Omar', team: 'A', lbs: 64, age: 9 },
    ])
    const loner = await db.insert(athletes).values({
      eventId: s.eventId, teamId: null, firstName: 'Lio', lastName: 'Vantel', age: 8, weightLbs: 62, belt: 'grey', source: 'manual',
    }).returning().get()
    const other = await seedEvent(db, { matches: 0 })

    const created: [string, string, string[]][] = [
      ['Ines', 'Bruno', []],
      ['Ines', 'Kai', ['3 weight classes apart', '4 years apart']],
      ['Omar', 'Kai', ['3 weight classes apart']],
      ['Ines', 'Nadia', ['6 weight classes apart', '6 years apart']],
      ['Ines', 'Nadia', ['6 weight classes apart', '6 years apart', 'Already met']],
      ['Bruno', 'Omar', []],
    ]
    for (const [a, b, warnings] of created) {
      const r = await call(app, 'POST', `/api/events/${s.eventId}/matches`, { athleteAId: id(a), athleteBId: id(b) }, adminToken)
      expect([a, b, r.status, r.body.warnings]).toEqual([a, b, 201, warnings])
    }

    const refused: [number, number, string][] = [
      [id('Ines'), id('Omar'), 'athletes must be on different teams'],
      [id('Ines'), other.b1, 'both athletes must be on this event'],
      [id('Bruno'), loner.id, 'both athletes must be on a team'],
    ]
    const before = (await db.select().from(matches).where(eq(matches.eventId, s.eventId)).all()).length
    for (const [a, b, message] of refused) {
      const r = await call(app, 'POST', `/api/events/${s.eventId}/matches`, { athleteAId: a, athleteBId: b }, adminToken)
      expect([r.status, r.body.error.message]).toEqual([422, message])
    }
    expect(await db.select().from(matches).where(eq(matches.eventId, s.eventId)).all()).toHaveLength(before)

    const first = (await db.select().from(matches).where(eq(matches.eventId, s.eventId)).all())[0]
    const patched = await call(app, 'PATCH', `/api/matches/${first.id}`, { athleteBId: id('Kai') }, adminToken)
    expect([patched.status, patched.body.warnings]).toEqual([200, ['3 weight classes apart', '4 years apart', 'Already met']])
  })
})

describe('the proposer offers each free kid at most once, across teams only, and never a division kid', () => {
  it('pairs across three teams, closest first, with the lower team first in the row', async () => {
    const db = await freshDb()
    const { s, id } = await pool(db, [
      { name: 'Ines', team: 'A', lbs: 62 },
      { name: 'Bruno', team: 'B', lbs: 64 },
      { name: 'Kai', team: 'C', lbs: 75 },
      { name: 'Nadia', team: 'A', lbs: 78, age: 9 },
    ])
    const out = await proposeMatches(db, s.eventId, 'gi')
    expect(out.map(p => [p.a.firstName, p.b.firstName])).toEqual([['Ines', 'Bruno'], ['Nadia', 'Kai']])
    expect(out.map(p => p.cost)).toEqual([0, 2])
    expect(out.map(p => p.why)).toEqual(['same class, same age', 'same class, 1 year apart'])
    expect(out.every(p => p.style === 'gi')).toBe(true)
    expect(out[0].a).toEqual({
      athleteId: id('Ines'), firstName: 'Ines', lastName: 'Vantel', teamId: s.teamA,
      age: 8, weightLbs: 62, weightClass: '62 to 70 lbs', belt: 'grey', erp: null,
    })
    expect(out.every(p => p.eventId === s.eventId && p.id > 0)).toBe(true)
  })

  it('breaks a tie on the lighter class, then on the athlete ids', async () => {
    const db = await freshDb()
    const { s } = await pool(db, [
      { name: 'Tomas', team: 'A', lbs: 75 },
      { name: 'Vik', team: 'B', lbs: 75 },
      { name: 'Sable', team: 'A', lbs: 50 },
      { name: 'Uma', team: 'B', lbs: 50 },
    ])
    expect((await proposeMatches(db, s.eventId, 'gi')).map(p => [p.a.firstName, p.b.firstName]))
      .toEqual([['Sable', 'Uma'], ['Tomas', 'Vik']])

    const db2 = await freshDb()
    const two = await pool(db2, [
      { name: 'Omar', team: 'A' },
      { name: 'Priya', team: 'A' },
      { name: 'Rafa', team: 'B' },
    ])
    expect((await proposeMatches(db2, two.s.eventId, 'gi')).map(p => [p.a.firstName, p.b.firstName])).toEqual([['Omar', 'Rafa']])
  })

  it('excludes a pair more than two classes apart and keeps one exactly two apart', async () => {
    const db = await freshDb()
    const { s } = await pool(db, [
      { name: 'Wren', team: 'A', lbs: 39 },
      { name: 'Xan', team: 'B', lbs: 62 },
    ])
    expect(await proposeMatches(db, s.eventId, 'gi')).toEqual([])

    const db2 = await freshDb()
    const near = await pool(db2, [
      { name: 'Wren', team: 'A', lbs: 39 },
      { name: 'Xan', team: 'B', lbs: 50 },
    ])
    expect((await proposeMatches(db2, near.s.eventId, 'gi')).map(p => p.why)).toEqual(['2 classes apart, same age'])
  })

  it('keeps the same-gender veto', async () => {
    const db = await freshDb()
    const { s } = await pool(db, [
      { name: 'Yara', team: 'A', gender: 'F' },
      { name: 'Zane', team: 'B', gender: 'M' },
      { name: 'Wilma', team: 'C', gender: 'f' },
    ])
    await db.update(events).set({ sameGender: true }).where(eq(events.id, s.eventId)).run()
    expect((await proposeMatches(db, s.eventId, 'gi')).map(p => [p.a.firstName, p.b.firstName])).toEqual([['Yara', 'Wilma']])
  })

  it('skips a kid who is live on a mat, and keeps skipping once the match is done', async () => {
    const db = await freshDb()
    const { s, id } = await pool(db, [
      { name: 'Ines', team: 'A' },
      { name: 'Bruno', team: 'B' },
      { name: 'Kai', team: 'C' },
    ])
    const match = await db.insert(matches).values({
      eventId: s.eventId, number: 1, orderIndex: 0, rulesetId: s.rulesetId, lengthSec: 300, status: 'live',
      athleteAId: id('Ines'), athleteBId: id('Kai'), style: 'gi',
    }).returning().get()
    expect(await proposeMatches(db, s.eventId, 'gi')).toEqual([])

    // A gi match in any status, done included, keeps its kids out of gi: only Bruno is
    // left over, and nobody is free to pair with him.
    await db.update(matches).set({ status: 'done' }).where(eq(matches.id, match.id)).run()
    expect(await proposeMatches(db, s.eventId, 'gi')).toEqual([])
  })

  it('skips a kid with a pending match of the style, done or not', async () => {
    const db = await freshDb()
    const { s, id } = await pool(db, [
      { name: 'Ines', team: 'A' },
      { name: 'Bruno', team: 'B' },
      { name: 'Kai', team: 'C' },
    ])
    const match = await db.insert(matches).values({
      eventId: s.eventId, number: 1, orderIndex: 0, rulesetId: s.rulesetId, lengthSec: 300,
      athleteAId: id('Ines'), athleteBId: id('Kai'), style: 'gi',
    }).returning().get()
    expect(await proposeMatches(db, s.eventId, 'gi')).toEqual([])

    await db.update(matches).set({ status: 'done' }).where(eq(matches.id, match.id)).run()
    expect(await proposeMatches(db, s.eventId, 'gi')).toEqual([])
  })

  it('is proposed for nogi but not for gi once a gi match is done', async () => {
    const db = await freshDb()
    const { s, id } = await pool(db, [
      { name: 'Ines', team: 'A' },
      { name: 'Bruno', team: 'B' },
      { name: 'Kai', team: 'C' },
    ])
    await db.insert(matches).values({
      eventId: s.eventId, number: 1, orderIndex: 0, rulesetId: s.rulesetId, lengthSec: 300, status: 'done',
      athleteAId: id('Ines'), athleteBId: id('Kai'), style: 'gi',
    }).run()
    // Ines and Kai already hold a gi match, so gi has only Bruno left over.
    expect(await proposeMatches(db, s.eventId, 'gi')).toEqual([])
    // Nogi has not been touched, so all three are free for it.
    const nogi = await proposeMatches(db, s.eventId, 'nogi')
    expect(nogi.map(p => [p.a.firstName, p.b.firstName])).toEqual([['Ines', 'Bruno']])
    expect(nogi.every(p => p.style === 'nogi')).toBe(true)
  })

  it('still proposes a gi pair for nogi, since Already met is per style', async () => {
    const db = await freshDb()
    const { s, id } = await pool(db, [
      { name: 'Ines', team: 'A' },
      { name: 'Bruno', team: 'B' },
    ])
    await db.insert(matches).values({
      eventId: s.eventId, number: 1, orderIndex: 0, rulesetId: s.rulesetId, lengthSec: 300, status: 'done',
      athleteAId: id('Ines'), athleteBId: id('Bruno'), style: 'gi',
    }).run()
    expect((await proposeMatches(db, s.eventId, 'nogi')).map(p => [p.a.firstName, p.b.firstName])).toEqual([['Ines', 'Bruno']])
  })

  it('never proposes a kid who is in a division', async () => {
    const db = await freshDb()
    const { s, id } = await pool(db, [
      { name: 'Ines', team: 'A' },
      { name: 'Bruno', team: 'B' },
      { name: 'Kai', team: 'C' },
    ])
    const division = await db.insert(divisions).values({
      eventId: s.eventId, name: 'Novice', format: 'round_robin', styles: 'gi', position: 0, createdAt: '2026-09-12T00:00:00.000Z',
    }).returning().get()
    await db.insert(divisionMembers).values({ divisionId: division.id, athleteId: id('Ines'), seed: 1 }).run()
    // Ines is spoken for by the division, so Bruno pairs with Kai instead of her.
    expect((await proposeMatches(db, s.eventId, 'gi')).map(p => [p.a.firstName, p.b.firstName])).toEqual([['Bruno', 'Kai']])
  })

  it('never pairs two kids who already met in this event, for that style', async () => {
    const db = await freshDb()
    const { s, id } = await pool(db, [
      { name: 'Ines', team: 'A' },
      { name: 'Bruno', team: 'B' },
    ])
    await db.insert(matches).values({
      eventId: s.eventId, number: 1, orderIndex: 0, rulesetId: s.rulesetId, lengthSec: 300, status: 'done',
      athleteAId: id('Bruno'), athleteBId: id('Ines'), style: 'gi',
    }).run()
    expect(await proposeMatches(db, s.eventId, 'gi')).toEqual([])
  })

  it('leaves out a kid with no team, no age, or no weight', async () => {
    const db = await freshDb()
    const { s, id } = await pool(db, [
      { name: 'Ines', team: 'A' },
      { name: 'Bruno', team: 'B', age: null },
      { name: 'Kai', team: 'C', lbs: null },
      { name: 'Nadia', team: 'B' },
    ])
    await db.update(athletes).set({ teamId: null }).where(eq(athletes.id, id('Nadia'))).run()
    expect(await proposeMatches(db, s.eventId, 'gi')).toEqual([])
  })

  it('replaces the drafts of this style, leaves the matches alone, and audits once a run', async () => {
    const db = await freshDb()
    const { s, id } = await pool(db, [
      { name: 'Ines', team: 'A' },
      { name: 'Bruno', team: 'B' },
      { name: 'Kai', team: 'C' },
    ])
    const first = await proposeMatches(db, s.eventId, 'gi')
    expect(first).toHaveLength(1)
    const second = await proposeMatches(db, s.eventId, 'gi')
    expect(second.map(p => [p.a.athleteId, p.b.athleteId])).toEqual(first.map(p => [p.a.athleteId, p.b.athleteId]))
    expect(second[0].id).not.toBe(first[0].id)
    expect(await db.select().from(proposals).where(eq(proposals.eventId, s.eventId)).all()).toHaveLength(1)

    const rows = await db.select().from(auditLog).where(eq(auditLog.eventId, s.eventId)).all()
    expect(rows.map(r => r.action)).toEqual(['propose', 'propose'])
    expect(rows[0].detail).toEqual({ count: 1, roundRobins: 1, unmatched: 0 })
    expect(rows.every(r => r.actor === 'admin' && r.matchId === null)).toBe(true)
    // Nothing the proposer does touches the running order.
    expect(await db.select().from(matches).where(eq(matches.eventId, s.eventId)).all()).toEqual([])
    expect(id('Ines')).toBeGreaterThan(0)
  })

  it('leaves a draft of the other style alone when proposing again', async () => {
    const db = await freshDb()
    const { s } = await pool(db, [
      { name: 'Ines', team: 'A' },
      { name: 'Bruno', team: 'B' },
      { name: 'Kai', team: 'C' },
      { name: 'Nadia', team: 'B' },
    ])
    const nogi = await proposeMatches(db, s.eventId, 'nogi')
    expect(nogi).toHaveLength(2)
    const gi = await proposeMatches(db, s.eventId, 'gi')
    expect(gi).toHaveLength(2)
    // Proposing gi again replaces only the gi drafts; the nogi set from above still stands.
    await proposeMatches(db, s.eventId, 'gi')
    const rows = await db.select().from(proposals).where(eq(proposals.eventId, s.eventId)).all()
    expect(rows.filter(r => r.style === 'nogi').map(r => r.id)).toEqual(nogi.map(p => p.id))
    expect(rows.filter(r => r.style === 'gi')).toHaveLength(2)
  })
})

describe('the proposer makes the pairing with the lowest total cost where a kid without a pair costs 10.5', () => {
  const SIT_OUT = 10.5

  function bestByBruteForce(kids: { id: number; team: string; cost: (o: number) => number }[], admissible: (a: number, b: number) => boolean): number {
    let best = kids.length * SIT_OUT
    const walk = (i: number, taken: Set<number>, total: number, pairs: number) => {
      if (i === kids.length) {
        const value = total + (kids.length - 2 * pairs) * SIT_OUT
        if (value < best) best = value
        return
      }
      if (taken.has(i)) return walk(i + 1, taken, total, pairs)
      walk(i + 1, taken, total, pairs)
      for (let j = i + 1; j < kids.length; j++) {
        if (taken.has(j) || kids[i].team === kids[j].team || !admissible(i, j)) continue
        taken.add(i); taken.add(j)
        walk(i + 1, taken, total + kids[i].cost(j), pairs + 1)
        taken.delete(i); taken.delete(j)
      }
    }
    walk(0, new Set(), 0, 0)
    return best
  }

  it('makes two pairs where the closest pair first would strand two kids', async () => {
    const db = await freshDb()
    const { s } = await pool(db, [
      { name: 'Ana', team: 'A', lbs: 62, age: 8 },
      { name: 'Bea', team: 'B', lbs: 62, age: 8 },
      { name: 'Cal', team: 'C', lbs: 62, age: 9 },
      { name: 'Cid', team: 'C', lbs: 62, age: 9 },
    ])
    const out = await proposeMatches(db, s.eventId, 'gi')
    expect(out.map(p => p.cost)).toEqual([2, 2])
    expect(out.map(p => p.b.firstName).sort()).toEqual(['Cal', 'Cid'])
  })

  it('equals the brute-force optimum over seeded random pools, with a kid without a pair at 10.5', async () => {
    let seed = 7
    const rand = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n }
    const belts = ['white', 'grey', 'grey-black', 'yellow', null]
    for (const round of Array.from({ length: 12 }, (_, i) => i)) {
      const size = 5 + (round % 5)
      const kids: Kid[] = Array.from({ length: size }, (_, i) => ({
        name: `K${i}`, team: (['A', 'B', 'C'] as const)[rand(3)], age: 5 + rand(9), lbs: 35 + rand(75), belt: belts[rand(belts.length)],
      }))
      const db = await freshDb()
      const { s, id } = await pool(db, kids)
      const out = await proposeMatches(db, s.eventId, 'gi')
      const sides = kids.map((k, i) => ({ id: i, age: k.age!, weightLbs: k.lbs!, belt: k.belt ?? null, erp: null }))
      const model = sides.map((a, i) => ({ id: i, team: kids[i].team, cost: (j: number) => pairCost(a, sides[j]) }))
      const expected = bestByBruteForce(model, (i, j) => pairCost(sides[i], sides[j]) <= MAX_PAIR_COST)
      const at = new Map(kids.map((k, i) => [id(k.name), i]))
      const actual = out.reduce((t, p) => t + pairCost(sides[at.get(p.a.athleteId)!], sides[at.get(p.b.athleteId)!]), 0) + (size - 2 * out.length) * SIT_OUT
      expect(actual, `pool ${round}: ${JSON.stringify(kids)}`).toBeCloseTo(expected, 6)
      expect(new Set(out.flatMap(p => [p.a.athleteId, p.b.athleteId])).size).toBe(out.length * 2)
    }
  })
})
