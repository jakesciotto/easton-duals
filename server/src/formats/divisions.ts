import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { DbLike } from '../db/client.js'
import { athletes, divisionMembers, divisions, matches, type AthleteRow, type DivisionRow, type MatchRow } from '../db/schema.js'
import { createMatch } from '../match/create.js'
import { MatchStateError, ValidationError, bumpVersion } from '../match/events.js'
import { recordAudit } from '../audit/log.js'
import { generateDivision, type GenerateMember, type Slot } from './generate.js'
import { DIVISION_LIMITS, type DivisionFormat, type DivisionMember, type DivisionStyles, type DivisionView } from '../shared/types.js'

export interface DivisionInput {
  name: string
  format: DivisionFormat
  styles: DivisionStyles
  athleteIds: number[]
}

export type DivisionPatch = Partial<DivisionInput>

const FORMAT_LABELS: Record<DivisionFormat, string> = {
  round_robin: 'round robin',
  single_elim: 'single elimination',
  double_elim: 'double elimination',
}

// A division is running once one of its matches has been started or settled, which is
// when regenerating it would rewrite a record somebody has already fought.
const RUNNING = 'division is running'

async function loadRow(db: DbLike, divisionId: number): Promise<DivisionRow> {
  const row = await db.select().from(divisions).where(eq(divisions.id, divisionId)).get()
  if (!row) throw new MatchStateError('division not found')
  return row
}

async function divisionMatches(db: DbLike, divisionId: number): Promise<MatchRow[]> {
  return db.select().from(matches).where(eq(matches.divisionId, divisionId)).orderBy(asc(matches.number)).all()
}

async function assertNotRunning(db: DbLike, divisionId: number): Promise<MatchRow[]> {
  const rows = await divisionMatches(db, divisionId)
  if (rows.some(m => m.status !== 'pending')) throw new MatchStateError(RUNNING)
  return rows
}

/**
 * The kids of a division, in the order they were listed. Every one has to be on the event
 * and on a team, because a kid with no team has nobody to score for.
 */
async function loadMembers(db: DbLike, eventId: number, athleteIds: number[], format: DivisionFormat): Promise<AthleteRow[]> {
  const [min, max] = DIVISION_LIMITS[format]
  if (new Set(athleteIds).size !== athleteIds.length) throw new ValidationError('a kid can only be in a division once')
  if (athleteIds.length < min || athleteIds.length > max) {
    throw new ValidationError(`a ${FORMAT_LABELS[format]} takes ${min} to ${max} kids`)
  }
  const rows = athleteIds.length === 0 ? [] : await db.select().from(athletes)
    .where(and(eq(athletes.eventId, eventId), inArray(athletes.id, athleteIds))).all()
  const byId = new Map(rows.map(a => [a.id, a]))
  return athleteIds.map(id => {
    const kid = byId.get(id)
    if (!kid) throw new ValidationError('every kid must be on this event')
    if (kid.teamId === null) throw new ValidationError('every kid must be on a team')
    return kid
  })
}

const generateMembers = (kids: AthleteRow[]): GenerateMember[] => kids.map((k, i) => ({
  athleteId: k.id, teamId: k.teamId as number, seed: i + 1, name: `${k.firstName} ${k.lastName}`,
}))

/** Generation numbers its own matches, so a feed resolves to the id the insert returned. */
async function insertMatches(db: DbLike, row: DivisionRow, kids: AthleteRow[]): Promise<{ ids: number[]; warnings: string[] }> {
  const { matches: generated, warnings } = generateDivision({
    name: row.name, format: row.format, styles: row.styles, members: generateMembers(kids),
  })
  const ids: number[] = []
  const feedOf = (slot: Slot) => slot.kind === 'feed' ? { matchId: ids[slot.index], take: slot.take } : null
  for (const m of generated) {
    const created = await createMatch(db, {
      eventId: row.eventId,
      athleteAId: m.a.kind === 'kid' ? m.a.athleteId : null,
      athleteBId: m.b.kind === 'kid' ? m.b.athleteId : null,
      feedA: feedOf(m.a),
      feedB: feedOf(m.b),
      style: m.style,
      divisionId: row.id,
      round: m.round,
      why: m.why,
      matId: null,
      source: 'generated',
    })
    if (!created.ok) throw created.code === 'validation' ? new ValidationError(created.message) : new MatchStateError(created.message)
    ids.push(created.match.id)
  }
  return { ids, warnings }
}

async function replaceMembers(db: DbLike, divisionId: number, kids: AthleteRow[]): Promise<void> {
  await db.delete(divisionMembers).where(eq(divisionMembers.divisionId, divisionId)).run()
  await db.insert(divisionMembers).values(kids.map((k, i) => ({ divisionId, athleteId: k.id, seed: i + 1 }))).run()
}

// The division's matches go one at a time with a row each, so the sheet reads the same
// whether a match was removed by hand or by an edit to the set it belonged to.
async function deleteMatches(db: DbLike, row: DivisionRow, rows: MatchRow[]): Promise<void> {
  if (rows.length === 0) return
  await db.delete(matches).where(inArray(matches.id, rows.map(m => m.id))).run()
  for (const m of rows) {
    await recordAudit(db, {
      eventId: row.eventId, matchId: m.id, actor: 'admin', action: 'match_delete',
      detail: { number: m.number, athleteAId: m.athleteAId, athleteBId: m.athleteBId, matId: m.matId, divisionId: row.id },
    })
  }
}

export async function createDivision(db: DbLike, eventId: number, input: DivisionInput): Promise<{ division: DivisionView; warnings: string[] }> {
  return db.transaction(async tx => {
    const kids = await loadMembers(tx, eventId, input.athleteIds, input.format)
    const last = await tx.select({ p: sql<number>`coalesce(max(${divisions.position}), -1)` }).from(divisions).where(eq(divisions.eventId, eventId)).get()
    const row = await tx.insert(divisions).values({
      eventId, name: input.name, format: input.format, styles: input.styles,
      position: (last?.p ?? -1) + 1, createdAt: new Date().toISOString(),
    }).returning().get()
    await replaceMembers(tx, row.id, kids)
    const { ids, warnings } = await insertMatches(tx, row, kids)
    await recordAudit(tx, {
      eventId, actor: 'admin', action: 'division_create',
      detail: { divisionId: row.id, name: row.name, format: row.format, styles: row.styles, members: kids.length, matches: ids.length },
    })
    await bumpVersion(tx, eventId)
    return { division: await loadDivision(tx, row.id), warnings }
  })
}

/**
 * A division is edited by being generated again: the set decides the matches, so there is
 * no such thing as editing one match of it. Every match it holds is deleted and rebuilt
 * with new numbers, which is why it is only allowed while none of them has run.
 */
export async function regenerateDivision(db: DbLike, divisionId: number, patch: DivisionPatch): Promise<{ division: DivisionView; warnings: string[] }> {
  return db.transaction(async tx => {
    const row = await loadRow(tx, divisionId)
    const existing = await assertNotRunning(tx, divisionId)
    const format = patch.format ?? row.format
    const athleteIds = patch.athleteIds ?? (await memberRows(tx, divisionId)).map(m => m.athleteId)
    const kids = await loadMembers(tx, row.eventId, athleteIds, format)
    await deleteMatches(tx, row, existing)
    const updated = await tx.update(divisions).set({
      name: patch.name ?? row.name, format, styles: patch.styles ?? row.styles,
    }).where(eq(divisions.id, divisionId)).returning().get()
    await replaceMembers(tx, divisionId, kids)
    const { ids, warnings } = await insertMatches(tx, updated, kids)
    await recordAudit(tx, {
      eventId: row.eventId, actor: 'admin', action: 'division_edit',
      detail: { divisionId, name: updated.name, format: updated.format, styles: updated.styles, members: kids.length, matches: ids.length },
    })
    await bumpVersion(tx, row.eventId)
    return { division: await loadDivision(tx, divisionId), warnings }
  })
}

export async function deleteDivision(db: DbLike, divisionId: number): Promise<void> {
  await db.transaction(async tx => {
    const row = await loadRow(tx, divisionId)
    await deleteMatches(tx, row, await assertNotRunning(tx, divisionId))
    await recordAudit(tx, {
      eventId: row.eventId, actor: 'admin', action: 'division_delete',
      detail: { divisionId, name: row.name, format: row.format, styles: row.styles },
    })
    await tx.delete(divisions).where(eq(divisions.id, divisionId)).run()
    await bumpVersion(tx, row.eventId)
  })
}

async function memberRows(db: DbLike, divisionId: number) {
  return db.select({
    athleteId: divisionMembers.athleteId,
    seed: divisionMembers.seed,
    firstName: athletes.firstName,
    lastName: athletes.lastName,
    teamId: athletes.teamId,
    erp: athletes.erp,
  }).from(divisionMembers)
    .innerJoin(athletes, eq(athletes.id, divisionMembers.athleteId))
    .where(eq(divisionMembers.divisionId, divisionId))
    .orderBy(asc(divisionMembers.seed)).all()
}

/**
 * The warnings are recomputed rather than stored, so a division always describes the set
 * it holds now. Generation is pure and deterministic, so this reads the same as the run
 * that made the matches.
 */
function viewOf(row: DivisionRow, members: DivisionMember[], divisionMatchRows: MatchRow[]): DivisionView {
  const { warnings } = generateDivision({
    name: row.name,
    format: row.format,
    styles: row.styles,
    members: members.map(m => ({ athleteId: m.athleteId, teamId: m.teamId ?? 0, seed: m.seed, name: `${m.firstName} ${m.lastName}` })),
  })
  return {
    id: row.id,
    eventId: row.eventId,
    name: row.name,
    format: row.format,
    styles: row.styles,
    position: row.position,
    members,
    matchIds: divisionMatchRows.map(m => m.id),
    running: divisionMatchRows.some(m => m.status !== 'pending'),
    warnings,
  }
}

export async function loadDivision(db: DbLike, divisionId: number): Promise<DivisionView> {
  const row = await loadRow(db, divisionId)
  return viewOf(row, await memberRows(db, divisionId), await divisionMatches(db, divisionId))
}

export async function loadDivisions(db: DbLike, eventId: number): Promise<DivisionView[]> {
  const rows = await db.select().from(divisions).where(eq(divisions.eventId, eventId))
    .orderBy(asc(divisions.position), asc(divisions.id)).all()
  const views: DivisionView[] = []
  for (const row of rows) views.push(viewOf(row, await memberRows(db, row.id), await divisionMatches(db, row.id)))
  return views
}
