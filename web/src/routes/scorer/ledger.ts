import type { LocalAction } from './actions'

const PREFIX = 'duels:scorer-log:'

export const LEDGER_CAP = 12

const key = (matchId: number) => `${PREFIX}${matchId}`

function isAction(value: unknown): value is LocalAction {
  if (typeof value !== 'object' || value === null) return false
  const a = value as Partial<LocalAction>
  if (typeof a.seq !== 'number' || typeof a.at !== 'string') return false
  return a.kind === 'score' || a.kind === 'clock' || a.kind === 'extend'
}

export function loadLedger(matchId: number, lastSeq: number): LocalAction[] {
  try {
    const raw = sessionStorage.getItem(key(matchId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isAction).filter(a => a.seq <= lastSeq)
  } catch {
    return []
  }
}

export function saveLedger(matchId: number, actions: LocalAction[]): void {
  try {
    sessionStorage.setItem(key(matchId), JSON.stringify(actions.slice(-LEDGER_CAP)))
  } catch { }
}

export function pruneLedgers(keep: number): void {
  try {
    const stale: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k !== null && k.startsWith(PREFIX) && k !== key(keep)) stale.push(k)
    }
    for (const k of stale) sessionStorage.removeItem(k)
  } catch { }
}
