import { athletes, rosterCandidates, type AthleteRow } from '../db/schema.js'

type CandidateRow = typeof rosterCandidates.$inferSelect
type AthleteUpdate = Partial<typeof athletes.$inferInsert>

type CandidateFields = Pick<CandidateRow, 'wlUid' | 'wlLocation' | 'leaderboardId' | 'erp' | 'belt' | 'gender' | 'age' | 'weightLbs' | 'promotedAt'>

export function fullName(a: { firstName: string; lastName: string }): string {
  return `${a.firstName} ${a.lastName}`
}

export function linkUpdate(existing: Pick<AthleteRow, 'wlUid' | 'ageSource' | 'weightSource'>, cand: CandidateFields): AthleteUpdate {
  const force = existing.wlUid === null
  const update: AthleteUpdate = {
    wlUid: cand.wlUid,
    wlLocation: cand.wlLocation,
    leaderboardId: cand.leaderboardId,
    erp: cand.erp,
  }
  if (cand.belt !== null) {
    update.belt = cand.belt
    update.promotedAt = cand.promotedAt
  }
  if (cand.gender !== null) update.gender = cand.gender
  if (cand.age !== null && (force || existing.ageSource !== 'manual')) {
    update.age = cand.age
    update.ageSource = 'leaderboard'
  }
  if (cand.weightLbs !== null && (force || existing.weightSource !== 'manual')) {
    update.weightLbs = cand.weightLbs
    update.weightSource = 'leaderboard'
  }
  return update
}
