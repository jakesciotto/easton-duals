import type { DivisionView, EventContact, EventMode, EventStatus, FeedTake, MatchSource, MatchStatus, RulesetAction, RulesetTerminal, Style, TeamColor, WinType } from '@shared/types'

// The sync answers one shape, and the two screens that print it read it from here rather
// than each reaching into the server's own module.
export type { SyncReport, SyncSuggestion } from '@shared/types'

/**
 * The division vocabulary, mirrored for the same reason the sync report is: the screens
 * that print a division read one shape from this module rather than each reaching into
 * the server's own.
 */
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
  /**
   * 6.4's escalation contact. Optional because the two endpoints that serve an event row
   * carry different halves of it: the list serves the raw columns and the detail adds the
   * joined `contact`, which is null unless both halves are filled. A caller reads whichever
   * one it has and prints nothing when it has neither.
   */
  contactName?: string | null
  contactPhone?: string | null
  contact?: EventContact | null
  /** When an admin signed the record off. Null on every event that is not certified. */
  certifiedAt?: string | null
  /** G24: the board's far setting. Null until an admin sets one, and the board reads 1.0. */
  far?: number | null
  /**
   * The locations an older sync stored. The sync searches every location now, so nothing
   * reads this; it is declared because the detail endpoint still carries the column until
   * the cleanup that drops it. Optional for the same reason as the contact halves above:
   * the list endpoint serves the raw columns and only the detail carries this one.
   */
  wlLocations?: string[] | null
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
  /** WellnessLiving's promotion date for the belt the row carries. */
  promotedAt: string | null
  /** When a sync last touched this row. Null until one has. */
  syncedAt: string | null
  /** What the last sync changed, field by field. Empty when it changed nothing. */
  syncChanges: Record<string, { from: unknown; to: unknown }> | null
  /** The one near match waiting on a person, and how close it scored. */
  suggestedWlUid: string | null
  suggestedScore: number | null
  /** Candidates a person has already said are not this child. */
  dismissedWlUids: string[]
  /**
   * Whether a win by this competitor earns their team points. A team inside `SCORING_CAP`
   * scores with every kid and the flag is moot for it; a larger one scores only with the
   * kids an admin marked.
   */
  scoring: boolean
}
export interface RulesetRow { id: number; eventId: number; name: string; defaultLengthSec: number; actions: RulesetAction[]; terminals: RulesetTerminal[] }
export interface MatRow { id: number; eventId: number; number: number; currentMatchId: number | null }
export interface MatchRow {
  id: number
  eventId: number
  /** The stable per-event number, printed as M12 on every surface. */
  number: number
  matId: number | null
  orderIndex: number
  rulesetId: number
  lengthSec: number
  /** Null only while a bracket side waits on the feed beside it. */
  athleteAId: number | null
  athleteBId: number | null
  /** Which side of an earlier match fills this one, and whether it takes the winner. */
  feedAMatchId: number | null
  feedATake: FeedTake | null
  feedBMatchId: number | null
  feedBTake: FeedTake | null
  style: Style
  /** The division this match belongs to, and its round inside that division's format. */
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
  /** Whether the proposer paired these two, somebody designed the match by hand, or a
      division's format generated it. */
  source: MatchSource
  // Derived server side from the latest end event rather than stored on the row, so
  // it is read only here and absent on any row this client has built itself.
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
/**
 * A draft pairing, and the standing of one team. Both are mirrored here for the same
 * reason `RosterCandidate` is: the screens that print them read one shape from this
 * module rather than each reaching into the server's own.
 */
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
export interface Proposal { id: number; eventId: number; cost: number; why: string; style: Style; a: ProposalSide; b: ProposalSide }
export interface LeaderboardRow { teamId: number; rank: number; teamPoints: number; wins: number; points: number }

export interface ManualKid {
  firstName: string
  lastName: string
  age?: number | null
  weightLbs?: number | null
  belt?: string | null
  gender?: string | null
  teamId?: number | null
}

/**
 * One run of the scheduler, as `POST /events/:id/schedule` answers it. It is mirrored
 * here rather than imported because the planner lives outside the shared folder the
 * `@shared` alias points at, and the preview dialog is the only thing that reads it.
 */
export interface SchedulePlan {
  order: { matchId: number; matId: number | null; orderIndex: number; wave: number }[]
  waves: number
  minutes: number
  perMat: { matId: number | null; number: number; count: number }[]
  warnings: string[]
  /** A mat that idles for a wave, and the number of the match it is waiting on. */
  gaps: { wave: number; matId: number | null; waitingOn: number }[]
}

/** The same plan, plus whether the call that produced it also wrote the order. */
export type ScheduleAnswer = SchedulePlan & { applied: boolean }
