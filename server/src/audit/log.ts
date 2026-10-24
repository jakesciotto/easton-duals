import { eq } from 'drizzle-orm'
import type { DbLike } from '../db/client.js'
import { auditLog, events, mats } from '../db/schema.js'
import { MatchStateError } from '../shared/errors.js'
import type { TokenPayload } from '../auth/tokens.js'
import type { AuditAction, AuditActor, AuditDetail } from '../shared/types.js'

export const HISTORY_LIMIT = 500

export interface AuditInput {
  eventId: number
  matchId?: number | null
  actor: AuditActor
  action: AuditAction
  detail?: AuditDetail
  at?: string
}

export const CERTIFIED_MESSAGE = 'event is certified'

const OPEN_ON_CERTIFIED: ReadonlySet<AuditAction> = new Set(['certify', 'uncertify', 'unbind', 'smoothcomp_standings'])

export async function recordAudit(db: DbLike, row: AuditInput): Promise<void> {
  if (!OPEN_ON_CERTIFIED.has(row.action)) {
    const ev = await db.select({ status: events.status }).from(events).where(eq(events.id, row.eventId)).get()
    if (ev?.status === 'certified') throw new MatchStateError(CERTIFIED_MESSAGE)
  }
  await db.insert(auditLog).values({
    eventId: row.eventId,
    matchId: row.matchId ?? null,
    actor: row.actor,
    action: row.action,
    detail: row.detail ?? {},
    at: row.at ?? new Date().toISOString(),
  }).run()
}

export function actorOf(auth: TokenPayload | null, matNumber?: number | null): AuditActor {
  if (auth === null) return 'system'
  if (auth.role === 'admin') return 'admin'
  return matNumber == null ? 'mat' : `mat:${matNumber}`
}

export async function matNumberOf(db: DbLike, auth: TokenPayload | null): Promise<number | null> {
  if (auth?.role !== 'mat') return null
  const row = await db.select({ number: mats.number }).from(mats).where(eq(mats.id, auth.matId)).get()
  return row?.number ?? null
}

export function actorOfMatchEventId(id: string, fallback: AuditActor): AuditActor {
  if (id.startsWith('entry:')) return 'desk'
  if (id.startsWith('admin:')) return 'admin'
  if (id.startsWith('expiry:')) return 'system'
  return fallback
}
