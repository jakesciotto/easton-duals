export type WinType = 'submission' | 'points' | 'decision' | 'walkover' | 'dq'
export type MatchStatus = 'pending' | 'live' | 'done'
/**
 * 'certified' is the record the organizer signed off on. It reads as done everywhere a
 * status is displayed, and it refuses every write on the event until an admin unlocks it.
 */
export type EventStatus = 'setup' | 'live' | 'done' | 'certified'
/**
 * How the event is run. 'entry' means the desk types every result and no tablet scores a
 * mat; 'live' means the mats drive it and the desk corrects. The walkthrough two weeks
 * before the event decides it, so it is a stored setting rather than something inferred
 * from whether a mat happens to be bound at this instant.
 */
export type EventMode = 'live' | 'entry'
/**
 * Where a match came from. 'proposed' is a proposal the organizer confirmed; 'designed'
 * is a pair a person picked in the Add match dialog; 'generated' is one match of a
 * division. Every row written before the proposer existed reads 'designed'.
 */
export type MatchSource = 'designed' | 'proposed' | 'generated'

/** Every match is one or the other. Rows written before divisions existed read gi. */
export type Style = 'gi' | 'nogi'
export type DivisionFormat = 'round_robin' | 'single_elim' | 'double_elim'
/** What a division runs. 'both' generates two independent sets, gi first. */
export type DivisionStyles = 'gi' | 'nogi' | 'both'
/** Which side of a finished match fills an empty side of a later one. */
export type FeedTake = 'winner' | 'loser'

// How many kids a format takes. Round robin grows quadratically, so it stops at ten; the
// brackets stop at sixteen, which is four rounds. Double elimination needs three, because
// two kids meeting twice is not a bracket.
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

// Why a result was changed after the fact. The desk types it into the Result dialog, and
// it travels with the correction in both the match log and the audit row.
export const CORRECTION_REASON_MAX = 120

/**
 * Who made a write, as it is stored in the audit log. `mat:3` is the tablet scoring mat 3,
 * `desk` is the Entry tab, `admin` is any other console write, and `system` is the server's
 * own sweeps (a clock that ran out, a tablet that stopped answering).
 */
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
  // The proposer replaced the two-team generator in 0.12.0. Nothing writes 'generate' any
  // more, but the log is append only and every event run before then carries the rows.
  | 'propose' | 'generate'
  | 'ruleset_create' | 'ruleset_edit' | 'ruleset_delete'
  | 'division_create' | 'division_edit' | 'division_delete' | 'fill' | 'schedule'
  | 'smoothcomp_standings'
  // Backfilled rows carry the match event's own type, and two of those are not verbs any
  // live write records: a desk entry's absolute score, and the pre-0007 admin event kind.
  | 'set_score' | 'admin'

export type AuditDetail = Record<string, unknown>

export interface AuditEntry {
  id: number
  at: string
  actor: AuditActor
  action: AuditAction
  detail: AuditDetail
}

// What one sync moved on one athlete, field by field, as the profile sheet prints it.
// An empty object is a row the sync read and found already right.
export interface ProfileChange { from: unknown; to: unknown }
export type SyncChanges = Record<string, ProfileChange>

// One near match waiting on a person. `candidate` and `location` name the WellnessLiving
// record, so the row and the dialog print the pair without a second lookup.
export interface SyncSuggestion { athleteId: number; name: string; candidate: string; location: string; score: number }

// One run of the sync. Names are "First Last", so the web prints them without a lookup.
// `changed` is the refreshed rows whose profile actually moved.
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

/**
 * One kid as a draft pairing carries them. The class is the label the registration
 * prints, so the console shows the band rather than doing the arithmetic itself. Age and
 * weight are nullable because a swap can put any kid on the event into a proposal.
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

/** A draft pairing. It reaches the board only once Confirm turns it into a match. */
export interface Proposal {
  id: number
  eventId: number
  cost: number
  why: string
  style: Style
  a: ProposalSide
  b: ProposalSide
}

/** One kid in a division, in seed order. The seed is the listed order, 1 at the top. */
export interface DivisionMember { athleteId: number; seed: number; firstName: string; lastName: string; teamId: number | null; erp: number | null }

/**
 * A division as the console reads it. `running` is true once any of its matches is live
 * or done, which is when editing, seeding and deleting stop. `warnings` is recomputed
 * from the members rather than stored, so it always describes the set as it stands.
 */
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

/** Where an empty side's kid comes from: the winner or the loser of an earlier match. */
export interface Feed { matchId: number; matchNumber: number; take: FeedTake }

/**
 * A side of a match. `athleteId` is null while a bracket side waits on its feeder, and
 * `name` then reads "Winner of M7" or "Loser of M7" so every surface has a line to print.
 * A filled side keeps its `feed`, because that is where the kid came from.
 */
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

// How many of the team's kids are marked to score, how many kids it has, and whether the
// cap is moot because the team fits inside it.
export interface TeamScoring { marked: number; size: number; everyone: boolean }
export interface TeamView { id: number; name: string; color: TeamColor; position: number; teamPoints: number; wins: number; points: number; scoring: TeamScoring }

/**
 * One line of the board's hero. Teams are ranked by team points, then wins, then match
 * points, then the order they were added in; teams level on the first three share a rank,
 * and the next team down takes the rank its position in the list gives it (1, 1, 3).
 */
export interface LeaderboardRow { teamId: number; rank: number; teamPoints: number; wins: number; points: number }

// The Smoothcomp standings: a Smoothcomp event's finished matches joined to the roster's names,
// teams and scoring marks, ranked by the same rules as the leaderboard. Never stored; the
// route answers it and writes one audit row.
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
/**
 * `blocked` is why an idle mat with a queue is not showing anything: the first match in
 * its queue is waiting on a feeder, or one of its kids is on another mat. Null when the
 * mat has a match, has no queue, or the next match is simply waiting to be called.
 */
export interface MatView { id: number; number: number; current: MatchView | null; onDeck: MatchView[]; bound: boolean; blocked: string | null }

// Null unless both halves are filled: a name with no number, or a number with no name,
// gives a volunteer nothing to act on, so the line is not printed at all.
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

// The board's one-mat live composition budgets four queued lines plus the pair on
// deck, and the setup composition shows three per mat. The serializer carries the
// deepest consumer's need, because a shallower cap silently starves a line the
// board has already reserved room for.
export const ON_DECK_DEPTH = 5

// A team scores with at most this many kids. A smaller team scores with every kid.
export const SCORING_CAP = 10
// What a win by a scoring kid is worth to the team, by how it was won.
export const TEAM_POINTS: Record<WinType, number> = { submission: 3, points: 2, decision: 1, walkover: 1, dq: 1 }

// An event is a duel between at least two teams and at most the eight colours below.
export const MIN_TEAMS = 2
export const MAX_TEAMS = 8

// Eight hues at one lightness and one chroma, oklch(0.70 0.14 h), spread 45 degrees
// apart. The previous values were the Tailwind v3 500 ramp, whose lightness spread
// meant a team could be visibly quieter than its opponent on the same wall. Holding
// lightness constant drops the contrast spread from 1.80x to 1.15x.
//
// The KEYS are frozen: they are stored in teams.color and changing one needs a data
// migration. Two of them can no longer match their hue, because eight evenly spread
// hues leave room for only two warm ones. TEAM_COLOR_LABELS is what a person sees,
// so the name always agrees with the swatch.
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

// A three letter code cut out of the team fill. Every fill takes --gray-1 text at
// 6.73:1 or better, so the plate is legal at every size for every pair.
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

// A referee adds time to finish a match that ran out, not to invent a new one, so the
// control offers half a minute at the low end and five minutes at the high end.
export const EXTEND_MIN_MS = 30_000
export const EXTEND_MAX_MS = 300_000

// The board's far correction on a win probability read, source 9.1. 1.0 is neutral; the
// range is bounded so a mistyped value cannot invert or flatten the read.
export const FAR_MIN = 0.85
export const FAR_MAX = 1.2
