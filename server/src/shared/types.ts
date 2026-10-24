export type WinType = 'submission' | 'points' | 'decision' | 'walkover' | 'dq'
export type MatchStatus = 'pending' | 'live' | 'done'
export type EventStatus = 'setup' | 'live' | 'done' | 'certified'
export type EventMode = 'live' | 'entry'
export type MatchSource = 'designed' | 'proposed' | 'generated'

export type Style = 'gi' | 'nogi'
export type DivisionFormat = 'round_robin' | 'single_elim' | 'double_elim'
export type DivisionStyles = 'gi' | 'nogi' | 'both'
export type FeedTake = 'winner' | 'loser'

export const DIVISION_LIMITS = { round_robin: [2, 10], single_elim: [2, 16], double_elim: [3, 16] } as const
export type MatchEventType = 'score' | 'set_score' | 'clock_start' | 'clock_pause' | 'clock_extend' | 'terminal' | 'end' | 'admin'

export interface RulesetAction { key: string; label: string; points: number }
export interface RulesetTerminal { key: string; label: string; winType: WinType }

export type MatchEventPayload =
  | { kind: 'end'; winnerAthleteId: number; winType: WinType }
  | { kind: 'reopen' }
  | { kind: 'edit_result'; winnerAthleteId: number; winType: WinType; reason?: string }
  | { kind: 'skip' }
  | { kind: 'clock_extend'; addMs: number }

export const CORRECTION_REASON_MAX = 120

export type AuditActor = 'admin' | 'desk' | 'system' | 'mat' | `mat:${number}`

export type AuditAction =
  | 'score' | 'terminal' | 'clock_start' | 'clock_pause' | 'clock_extend'
  | 'end' | 'undo' | 'skip' | 'reopen' | 'entry' | 'correction'
  | 'bind' | 'takeover' | 'unbind' | 'advance'
  | 'create' | 'event_edit' | 'mode' | 'contact' | 'mat_count' | 'far' | 'start' | 'finish' | 'delete'
  | 'certify' | 'uncertify'
  | 'team_edit' | 'team_add' | 'team_remove'
  | 'roster_add' | 'roster_edit' | 'roster_assign' | 'roster_remove' | 'roster_sync' | 'roster_link'
  | 'match_create' | 'match_edit' | 'match_delete' | 'reorder'
  | 'propose' | 'generate'
  | 'ruleset_create' | 'ruleset_edit' | 'ruleset_delete'
  | 'division_create' | 'division_edit' | 'division_delete' | 'fill' | 'schedule'
  | 'smoothcomp_standings'
  | 'set_score' | 'admin'

export type AuditDetail = Record<string, unknown>

export interface AuditEntry {
  id: number
  at: string
  actor: AuditActor
  action: AuditAction
  detail: AuditDetail
}

export interface ProfileChange { from: unknown; to: unknown }
export type SyncChanges = Record<string, ProfileChange>

export interface SyncSuggestion { athleteId: number; name: string; candidate: string; location: string; score: number }

export interface SyncReport {
  linked: string[]
  refreshed: number
  changed: string[]
  suggested: SyncSuggestion[]
  ambiguous: string[]
  unmatched: string[]
  gone: string[]
}

export interface ClockState { elapsedMs: number; startedAt: string | null; lengthMs: number }
export interface MatchResult { winnerAthleteId: number; winType: WinType }
export interface PendingTerminal { athleteId: number; actionKey: string }

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

export interface Proposal {
  id: number
  eventId: number
  cost: number
  why: string
  style: Style
  a: ProposalSide
  b: ProposalSide
  c: ProposalSide | null
}

export interface DivisionMember { athleteId: number; seed: number; firstName: string; lastName: string; teamId: number | null; erp: number | null }

export interface DivisionView {
  id: number
  eventId: number
  name: string
  format: DivisionFormat
  styles: DivisionStyles
  position: number
  members: DivisionMember[]
  matchIds: number[]
  running: boolean
  warnings: string[]
}

export interface Feed { matchId: number; matchNumber: number; take: FeedTake }

export interface MatchSide {
  athleteId: number | null
  name: string
  teamId: number | null
  belt: string | null
  weightLbs: number | null
  score: number
  feed: Feed | null
}

export interface MatchView {
  id: number
  number: number
  orderIndex: number
  matId: number | null
  status: MatchStatus
  rulesetId: number
  lengthSec: number
  why: string | null
  source: MatchSource
  style: Style
  divisionId: number | null
  round: number | null
  a: MatchSide
  b: MatchSide
  clock: ClockState
  result: MatchResult | null
  pendingTerminal: PendingTerminal | null
  endedAt: string | null
  lastSeq: number
}

export interface TeamScoring { marked: number; size: number; everyone: boolean }
export interface TeamView { id: number; name: string; color: TeamColor; position: number; teamPoints: number; wins: number; points: number; scoring: TeamScoring }

export interface LeaderboardRow { teamId: number; rank: number; teamPoints: number; wins: number; points: number }

export interface StandingsAthlete { athleteId: number; name: string; scoring: boolean; wins: number; losses: number; teamPoints: number }
export interface StandingsTeam extends LeaderboardRow { name: string; color: TeamColor; scoring: TeamScoring; athletes: StandingsAthlete[] }
export interface StandingsUnmatched { name: string; club: string; division: string }
export interface StandingsCounts { read: number; counted: number; byes: number; unfinished: number; undecided: number; unmatched: number; sameTeam: number }
export interface StandingsReport {
  fetchedAt: string
  url: string
  brackets: { read: number; failed: number[] }
  matches: StandingsCounts
  teams: StandingsTeam[]
  unmatched: StandingsUnmatched[]
  sameTeamPairs: string[]
  unknownMethods: string[]
}
export interface RulesetView { id: number; name: string; defaultLengthSec: number; actions: RulesetAction[]; terminals: RulesetTerminal[] }
export interface MatView { id: number; number: number; current: MatchView | null; onDeck: MatchView[]; bound: boolean; blocked: string | null }

export interface EventContact { name: string; phone: string }

export interface Snapshot {
  version: number
  now: string
  event: { id: number; name: string; date: string; status: EventStatus; mode: EventMode; matCount: number; contact: EventContact | null; certifiedAt: string | null; far: number | null }
  teams: TeamView[]
  leaderboard: LeaderboardRow[]
  rulesets: RulesetView[]
  mats: MatView[]
  matches: MatchView[]
}

export const ON_DECK_DEPTH = 5

export const SCORING_CAP = 10
export const TEAM_POINTS: Record<WinType, number> = { submission: 3, points: 2, decision: 1, walkover: 1, dq: 1 }

export const MIN_TEAMS = 2
export const MAX_TEAMS = 8

export const TEAM_COLORS = {
  red: '#e97871',
  blue: '#53a3f2',
  green: '#a1a62b',
  amber: '#54b66e',
  purple: '#ac89e8',
  pink: '#d779ba',
  teal: '#00b5b7',
  orange: '#d78c29',
} as const
export type TeamColor = keyof typeof TEAM_COLORS
export const TEAM_COLOR_KEYS = Object.keys(TEAM_COLORS) as TeamColor[]

export const TEAM_COLOR_LABELS: Record<TeamColor, string> = {
  red: 'Crimson',
  orange: 'Amber',
  green: 'Citron',
  amber: 'Green',
  teal: 'Teal',
  blue: 'Azure',
  purple: 'Violet',
  pink: 'Magenta',
}

export function teamCode(name: string): string {
  const letters = name.replace(/[^a-zA-Z]/g, '')
  if (letters.length >= 3) return letters.slice(0, 3).toUpperCase()
  return (letters + name.replace(/[^a-zA-Z0-9]/g, '')).slice(0, 3).toUpperCase() || 'TBD'
}

export const KIDS_BELTS = [
  'white',
  'grey-white', 'grey', 'grey-black',
  'yellow-white', 'yellow', 'yellow-black',
  'orange-white', 'orange', 'orange-black',
  'green-white', 'green', 'green-black',
] as const
export type KidsBelt = typeof KIDS_BELTS[number]

export const DEFAULT_ACTIONS: RulesetAction[] = [
  { key: 'takedown', label: 'Takedown', points: 2 },
  { key: 'sweep', label: 'Sweep', points: 2 },
  { key: 'pass', label: 'Pass', points: 3 },
  { key: 'mount', label: 'Mount', points: 4 },
  { key: 'back', label: 'Back', points: 4 },
  { key: 'nearfall', label: 'Near fall', points: 2 },
  { key: 'penalty', label: 'Penalty', points: -1 },
]
export const DEFAULT_TERMINALS: RulesetTerminal[] = [
  { key: 'submission', label: 'Submission', winType: 'submission' },
  { key: 'pin', label: 'Pin', winType: 'submission' },
]
export const DEFAULT_LENGTH_SEC = 300

export const EXTEND_MIN_MS = 30_000
export const EXTEND_MAX_MS = 300_000

export const FAR_MIN = 0.85
export const FAR_MAX = 1.2
