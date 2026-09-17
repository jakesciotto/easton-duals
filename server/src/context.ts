import type { Db } from './db/client.js'
import type { TokenPayload } from './auth/tokens.js'
import type { WlLike, LeaderboardConfig } from './roster/types.js'

export interface RosterConfig {
  wl: WlLike | null
  leaderboard: LeaderboardConfig | null
  // Wall-clock budget for one roster sync across every location, or null for no budget.
  syncBudgetMs: number | null
}

// How the standings route reaches Smoothcomp. Every field has a production default; tests
// pass a fake fetch and a short deadline.
export interface SmoothcompConfig {
  fetchFn?: typeof fetch
  concurrency?: number
  deadlineMs?: number
  backoffMs?: number
}

export interface AppContext {
  port: number
  db: Db
  secret: string
  adminPin: string
  roster: RosterConfig
  publicUrl?: string
  smoothcomp?: SmoothcompConfig
}

export type Env = { Variables: { ctx: AppContext; auth: TokenPayload | null } }
