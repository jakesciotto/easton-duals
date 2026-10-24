import type { DivisionView, EventContact, EventMode, EventStatus, FeedTake, MatchSource, MatchStatus, RulesetAction, RulesetTerminal, Style, TeamColor, WinType } from '@shared/types'

export type { SyncReport, SyncSuggestion } from '@shared/types'
export type { StandingsAthlete, StandingsCounts, StandingsReport, StandingsTeam, StandingsUnmatched } from '@shared/types'

export type { DivisionFormat, DivisionMember, DivisionStyles, DivisionView, Feed, FeedTake, Style } from '@shared/types'

export interface EventRow {
  id: number
  name: string
  date: string
  matCount: number
  matCode: string
  status: EventStatus
  mode: EventMode
  sameGender: boolean
  createdAt: string
  contactName?: string | null
  contactPhone?: string | null
  contact?: EventContact | null
  certifiedAt?: string | null
  far?: number | null
  wlLocations?: string[] | null
  smoothcompUrl?: string | null
}
export interface TeamRow { id: number; eventId: number; name: string; color: TeamColor; position: number }
export interface AthleteRow {
  id: number
  eventId: number
  teamId: number | null
  firstName: string
  lastName: string
  age: number | null
  ageSource: 'manual' | 'leaderboard' | 'wl' | null
  weightLbs: number | null
  weightSource: 'manual' | 'leaderboard' | null
  belt: string | null
  gender: string | null
  source: 'wl' | 'manual'
  wlUid: string | null
  wlLocation: string | null
  leaderboardId: string | null
  erp: number | null
  promotedAt: string | null
  syncedAt: string | null
  syncChanges: Record<string, { from: unknown; to: unknown }> | null
  suggestedWlUid: string | null
  suggestedScore: number | null
  dismissedWlUids: string[]
  scoring: boolean
}
export interface RulesetRow { id: number; eventId: number; name: string; defaultLengthSec: number; actions: RulesetAction[]; terminals: RulesetTerminal[] }
export interface MatRow { id: number; eventId: number; number: number; currentMatchId: number | null }
export interface MatchRow {
  id: number
  eventId: number
  number: number
  matId: number | null
  orderIndex: number
  rulesetId: number
  lengthSec: number
  athleteAId: number | null
  athleteBId: number | null
  feedAMatchId: number | null
  feedATake: FeedTake | null
  feedBMatchId: number | null
  feedBTake: FeedTake | null
  style: Style
  divisionId: number | null
  round: number | null
  status: MatchStatus
  winnerAthleteId: number | null
  winType: WinType | null
  pointsA: number
  pointsB: number
  clockElapsedMs: number
  clockStartedAt: string | null
  pendingTerminalAthleteId: number | null
  pendingTerminalKey: string | null
  lastSeq: number
  why: string | null
  source: MatchSource
  endedAt?: string | null
}
export interface EventDetail { event: EventRow; teams: TeamRow[]; athletes: AthleteRow[]; rulesets: RulesetRow[]; mats: MatRow[]; matches: MatchRow[]; divisions: DivisionView[]; candidateCount: number }
export type EventSummary = EventRow & { teams: TeamRow[] }
export interface RosterCandidate {
  wlUid: string
  firstName: string
  lastName: string
  belt: string | null
  wlLocation: string
  leaderboardId: string | null
  erp: number | null
  age: number | null
  weightLbs: number | null
  gender: string | null
}
export interface ProposalSide {
  athleteId: number
  firstName: string
  lastName: string
  teamId: number
  age: number | null
  weightLbs: number | null
  weightClass: string | null
  belt: string | null
  erp: number | null
}
export interface Proposal { id: number; eventId: number; cost: number; why: string; style: Style; a: ProposalSide; b: ProposalSide; c: ProposalSide | null }
export interface LeaderboardRow { teamId: number; rank: number; teamPoints: number; wins: number; points: number }

export interface ManualKid {
  firstName: string
  lastName: string
  age?: number | null
  weightLbs?: number | null
  belt?: string | null
  gender?: string | null
  teamId?: number | null
  scoring?: boolean
}

export interface SchedulePlan {
  order: { matchId: number; matId: number | null; orderIndex: number; wave: number }[]
  waves: number
  minutes: number
  perMat: { matId: number | null; number: number; count: number }[]
  warnings: string[]
  gaps: { wave: number; matId: number | null; waitingOn: number }[]
}

export type ScheduleAnswer = SchedulePlan & { applied: boolean }
