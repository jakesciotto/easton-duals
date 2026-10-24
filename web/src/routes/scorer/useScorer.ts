import { useCallback, useEffect, useRef, useState } from 'react'
import type { MatchView, RulesetView, Snapshot, WinType } from '@shared/types'
import { formatClock, remainingMs } from '@shared/clock'
import { ApiError } from '@/lib/api'
import type { MatBinding } from '@/lib/auth'
import { bindLossOf, type BindLoss } from '@/lib/matBinding'
import { decisionOf, endMatch, extendClock, heartbeat, postMatchEvent, undoLast, type DecisionType, type ScoreResponse } from '@/lib/scoring'
import { playRegistered, playRejected } from '@/lib/sounds'
import {
  ADD_TIME_MS, applyClockExtend, applyClockPause, applyClockStart, applyScore, applyUndo,
  errorCopy, withDeadline, WRITE_DEADLINE_MS, type LocalAction,
} from './actions'
import { loadLedger, pruneLedgers, saveLedger } from './ledger'

const HEARTBEAT_MS = 20_000

export type SheetReason = 'terminal' | 'end' | 'time'
export interface Outcome { winner: number | null; winType: WinType | null }


export interface Statement extends Outcome { scores: { a: number; b: number } }

export interface Sheet extends Outcome {
  reason: SheetReason
  shown: Statement
  changed: { was: Statement; now: Statement } | null
}

interface PendingOp {
  id: number
  apply: (match: MatchView) => MatchView
  needed: (match: MatchView) => boolean
}

interface Ledger { matchId: number; actions: LocalAction[] }

function derive(match: MatchView, ruleset: RulesetView | null): Outcome {
  if (match.pendingTerminal) {
    const t = ruleset?.terminals.find(x => x.key === match.pendingTerminal!.actionKey)
    return { winner: match.pendingTerminal.athleteId, winType: t?.winType ?? 'submission' }
  }
  if (match.a.score > match.b.score) return { winner: match.a.athleteId, winType: 'points' }
  if (match.b.score > match.a.score) return { winner: match.b.athleteId, winType: 'points' }
  return { winner: null, winType: null }
}

function statement(match: MatchView, ruleset: RulesetView | null): Statement {
  return { ...derive(match, ruleset), scores: { a: match.a.score, b: match.b.score } }
}

export function useScorer(binding: MatBinding, snapshot: Snapshot | null, connected: boolean) {
  const mat = snapshot?.mats.find(m => m.id === binding.matId) ?? null
  const polled = mat?.current ?? null
  const [busy, setBusy] = useState(false)
  const [sheetBusy, setSheetBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [written, setWritten] = useState<MatchView | null>(null)
  const [writeMark, setWriteMark] = useState<{ seq: number; version: number } | null>(null)
  const [pending, setPending] = useState<PendingOp[]>([])
  const [log, setLog] = useState<Ledger>({ matchId: 0, actions: [] })
  const [bindingLost, setBindingLost] = useState<BindLoss | null>(null)
  const seqRef = useRef<{ matchId: number; seq: number; version: number } | null>(null)
  const projected = useRef<{ matchId: number; seq: number } | null>(null)
  const chain = useRef<Promise<unknown>>(Promise.resolve())
  const generation = useRef(0)
  const opSeq = useRef(0)
  const inFlight = useRef(0)
  const offset = useRef(0)
  const terminating = useRef(false)

  useEffect(() => {
    if (snapshot?.now) offset.current = Date.parse(snapshot.now) - Date.now()
  }, [snapshot?.now])

  const base = written && writeMark && polled && written.id === polled.id && snapshot !== null && snapshot.version <= writeMark.version ? written : polled
  const current = base ? pending.reduce((m, op) => (op.needed(m) ? op.apply(m) : m), base) : null
  const ruleset = current ? snapshot?.rulesets.find(r => r.id === current.rulesetId) ?? null : null

  if (base && snapshot && (
    seqRef.current === null
    || seqRef.current.matchId !== base.id
    || (base === polled && snapshot.version > seqRef.current.version)
  )) {
    seqRef.current = { matchId: base.id, seq: base.lastSeq, version: snapshot.version }
  }

  if (base && (pending.length === 0 || projected.current?.matchId !== base.id)) {
    projected.current = { matchId: base.id, seq: base.lastSeq }
  }

  const mine = current && log.matchId === current.id ? log.actions : []
  const live = current ? mine.filter(a => a.seq <= current.lastSeq) : []
  const lastAction = current && live.length > 0 && live[live.length - 1].seq === current.lastSeq ? live[live.length - 1] : null

  useEffect(() => {
    const beat = () => {
      void heartbeat(binding.matId, binding.token).catch(e => {
        const lost = bindLossOf(e)
        if (lost) setBindingLost(lost)
      })
    }
    beat()
    const id = setInterval(beat, HEARTBEAT_MS)
    return () => clearInterval(id)
  }, [binding.matId, binding.token])

  useEffect(() => {
    setSheet(null)
    setError(null)
    setPending([])
    const id = current?.id ?? 0
    if (id) pruneLedgers(id)
    setLog({ matchId: id, actions: id ? loadLedger(id, current!.lastSeq) : [] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id])

  useEffect(() => {
    if (log.matchId) saveLedger(log.matchId, log.actions)
  }, [log])

  const agreed = pending.length === 0 ? base?.lastSeq : undefined
  useEffect(() => {
    if (agreed === undefined) return
    setLog(l => (l.actions.some(a => a.seq > agreed) ? { ...l, actions: l.actions.filter(a => a.seq <= agreed) } : l))
  }, [agreed, base?.id])

  const enqueue = useCallback((fn: (matchId: number, seq: number) => Promise<ScoreResponse>, opId: number | null): Promise<ScoreResponse | null> => {
    const mine = generation.current
    const matchId = seqRef.current?.matchId
    inFlight.current += 1
    setBusy(true)
    const task = async (): Promise<ScoreResponse | null> => {
      try {
        if (generation.current !== mine) return null
        const at = seqRef.current
        if (matchId === undefined || !at || at.matchId !== matchId) return null
        try {
          const r = await withDeadline(fn(matchId, at.seq), WRITE_DEADLINE_MS)
          seqRef.current = { matchId: r.match.id, seq: r.match.lastSeq, version: r.version }
          setWritten(r.match)
          setWriteMark({ seq: r.match.lastSeq, version: r.version })
          if (opId !== null) setPending(p => p.filter(o => o.id !== opId))
          return r
        } catch (e) {
          generation.current += 1
          setPending([])
          const lost = bindLossOf(e)
          if (lost) {
            setBindingLost(lost)
            return null
          }
          if (e instanceof ApiError && e.code === 'sequence') {
            const s = Number(e.details.currentSeq)
            if (Number.isFinite(s)) seqRef.current = { matchId, seq: s, version: at.version }
          }
          setError(errorCopy(e))
          playRejected()
          return null
        }
      } finally {
        inFlight.current -= 1
        if (inFlight.current === 0) setBusy(false)
      }
    }
    const next = chain.current.then(task, task)
    chain.current = next.catch(() => null)
    return next
  }, [])

  const push = (op: Omit<PendingOp, 'id'>): number => {
    const id = ++opSeq.current
    setPending(p => [...p, { id, ...op }])
    return id
  }

  const record = (matchId: number, action: LocalAction) =>
    setLog(l => (l.matchId === matchId ? { matchId, actions: [...l.actions, action] } : { matchId, actions: [action] }))

  const reseq = (matchId: number, from: number, to: number) =>
    setLog(l => (l.matchId === matchId && from !== to
      ? { matchId, actions: l.actions.map(a => (a.seq === from ? { ...a, seq: to } : a)) }
      : l))

  const tap = (athleteId: number | null, actionKey: string) => {
    const m = current
    const action = ruleset?.actions.find(a => a.key === actionKey)
    if (athleteId === null || !m || !action || !connected || !projected.current) return
    setError(null)
    const target = ++projected.current.seq
    const name = m.a.athleteId === athleteId ? m.a.name : m.b.name
    const at = formatClock(remainingMs(m.clock, Date.now() + offset.current))
    record(m.id, { kind: 'score', seq: target, athleteId, name, label: action.label, points: action.points, at })
    const id = push({ apply: x => applyScore(x, athleteId, action.points), needed: x => x.lastSeq < target })
    playRegistered()
    void enqueue((matchId, seq) => postMatchEvent(matchId, binding.token, { type: 'score', athleteId, actionKey, lastSeq: seq }), id)
  }

  const clock = () => {
    const m = current
    if (!m || !connected || !projected.current) return
    setError(null)
    const target = ++projected.current.seq
    const nowMs = Date.now() + offset.current
    const running = m.clock.startedAt !== null
    const at = formatClock(remainingMs(m.clock, nowMs))
    record(m.id, { kind: 'clock', seq: target, label: running ? 'Clock paused' : 'Clock started', at })
    const id = running
      ? push({ apply: x => applyClockPause(x, nowMs), needed: x => x.clock.startedAt !== null })
      : push({ apply: x => applyClockStart(x, new Date(nowMs).toISOString()), needed: x => x.clock.startedAt === null })
    void enqueue((matchId, seq) => postMatchEvent(matchId, binding.token, { type: running ? 'clock_pause' : 'clock_start', lastSeq: seq }), id)
  }

  const addTime = () => {
    const m = current
    if (!m || !connected || !projected.current) return
    if (m.clock.startedAt !== null) return
    setError(null)
    const target = ++projected.current.seq
    const at = formatClock(remainingMs(m.clock, Date.now() + offset.current))
    record(m.id, { kind: 'extend', seq: target, label: 'Time added', addMs: ADD_TIME_MS, at })
    const id = push({ apply: x => applyClockExtend(x, ADD_TIME_MS), needed: x => x.lastSeq < target })
    void enqueue(async (matchId, seq) => {
      try {
        return await extendClock(matchId, binding.token, { lastSeq: seq, addMs: ADD_TIME_MS })
      } catch (e) {
        const server = e instanceof ApiError && e.code === 'sequence' ? Number(e.details.currentSeq) : NaN
        if (!Number.isFinite(server)) throw e
        const r = await extendClock(matchId, binding.token, { lastSeq: server, addMs: ADD_TIME_MS })
        reseq(matchId, target, r.match.lastSeq)
        return r
      }
    }, id)
  }

  const undo = () => {
    const m = current
    const target = lastAction
    if (!m || !connected || !projected.current || projected.current.seq === 0) return
    if (!target || target.kind === 'clock' || target.seq !== m.lastSeq) return
    setError(null)
    const gone = projected.current.seq
    projected.current.seq = gone - 1
    const id = push({ apply: x => applyUndo(x, target), needed: x => x.lastSeq >= gone })
    void enqueue((matchId, seq) => undoLast(matchId, binding.token, seq), id)
  }

  const minus = (athleteId: number | null) => {
    if (athleteId === null || !lastAction || lastAction.kind !== 'score' || lastAction.athleteId !== athleteId) return
    undo()
  }

  const raise = (reason: SheetReason, shown: Statement) =>
    setSheet({ reason, shown, changed: null, winner: shown.winner, winType: shown.winType })

  const close = () => { setSheet(null); setError(null) }

  const terminal = async (athleteId: number | null, actionKey: string) => {
    if (athleteId === null || !current || !connected || terminating.current) return
    terminating.current = true
    setError(null)
    try {
      const r = await enqueue((matchId, seq) => postMatchEvent(matchId, binding.token, { type: 'terminal', athleteId, actionKey, lastSeq: seq }), null)
      if (r) raise('terminal', statement(r.match, ruleset))
    } finally {
      terminating.current = false
    }
  }

  const openEnd = (reason: 'end' | 'time' = 'end') => {
    if (!current) return
    raise(reason, statement(current, ruleset))
  }

  const pickWinner = (athleteId: number | null) => setSheet(s => (s && athleteId !== null
    ? { ...s, winner: athleteId, winType: s.winType ?? s.changed?.now.winType ?? 'decision', changed: null }
    : s))

  const pickWinType = (winType: DecisionType) => setSheet(s => (s ? { ...s, winType } : s))

  const confirm = async () => {
    if (!sheet || sheet.changed || sheet.winner === null || sheetBusy) return
    const now = current ? statement(current, ruleset) : sheet.shown
    if (now.winner !== sheet.shown.winner || now.winType !== sheet.shown.winType) {
      setSheet({ reason: sheet.reason, shown: now, changed: { was: sheet.shown, now }, winner: null, winType: null })
      setError('The score changed. Read the new result, then record it.')
      playRejected()
      return
    }
    setSheetBusy(true)
    try {
      const tie = sheet.shown.winner === null
      const settled = tie ? { winnerAthleteId: sheet.winner!, winType: decisionOf(sheet.winType) } : {}
      const r = await enqueue((matchId, seq) => endMatch(matchId, binding.token, { lastSeq: seq, ...settled }), null)
      if (r) close()
    } finally {
      setSheetBusy(false)
    }
  }

  const cancel = async () => {
    if (sheetBusy) return
    if (sheet?.reason === 'terminal') {
      setSheetBusy(true)
      try {
        const r = await enqueue((matchId, seq) => undoLast(matchId, binding.token, seq), null)
        if (!r) return
      } finally {
        setSheetBusy(false)
      }
    }
    close()
  }

  return { mat, current, ruleset, busy, sheetBusy, error, sheet, lastAction, bindingLost, tap, terminal, clock, addTime, undo, minus, openEnd, pickWinner, pickWinType, confirm, cancel }
}
