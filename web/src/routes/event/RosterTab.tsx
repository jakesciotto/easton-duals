import { useEffect, useMemo, useRef, useState } from 'react'
import { writeErrorMessage } from '@/lib/eventMode'
import { adminApi, useAdminMutation } from '@/lib/queries'
import { ApiError } from '@/lib/api'
import type { AthleteRow, EventDetail, RosterCandidate, SyncReport } from '@/lib/types'
import { athleteName } from '@/lib/format'
import { matchAthleteIds } from '@/lib/matchView'
import { AddKidDialog } from './AddKidDialog'
import { LinkCandidateDialog } from './LinkCandidateDialog'
import { PasteRosterDialog } from './PasteRosterDialog'
import { ProfileSheet } from './ProfileSheet'
import { SyncRosterDialog } from './SyncRosterDialog'
import { reportLines } from './link-report'
import { RosterGroup } from './roster-group'
import { dropZoneValue, useRosterDrag } from './roster-drag'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { OverflowMenu } from '@/components/OverflowMenu'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function RosterTab({ detail }: { detail: EventDetail }) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [faults, setFaults] = useState<Set<number>>(new Set())
  const [addOpen, setAddOpen] = useState(false)
  const [addTeamId, setAddTeamId] = useState<number | null>(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)
  const [removing, setRemoving] = useState<AthleteRow[]>([])
  const [linking, setLinking] = useState<AthleteRow | null>(null)
  const [profileFor, setProfileFor] = useState<AthleteRow | null>(null)
  const [report, setReport] = useState<SyncReport | null>(null)
  const [stoppedOn, setStoppedOn] = useState<string | null>(null)
  const [matchNotice, setMatchNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const anchor = useRef<number | null>(null)
  const eventId = detail.event.id
  const assign = useAdminMutation(eventId, (v: { ids: number[]; teamId: number | null }) => adminApi(`/api/events/${eventId}/athletes/assign`, { method: 'POST', body: v }))
  const patch = useAdminMutation(eventId, (v: { id: number; body: Partial<AthleteRow> }) => adminApi(`/api/athletes/${v.id}`, { method: 'PATCH', body: v.body }))
  const remove = useAdminMutation(eventId, (id: number) => adminApi(`/api/athletes/${id}`, { method: 'DELETE' }))
  const mark = useAdminMutation(eventId, (v: { ids: number[]; scoring: boolean }) =>
    adminApi(`/api/events/${eventId}/athletes/scoring`, { method: 'POST', body: v }))
  const confirm = useAdminMutation(eventId, (v: { id: number; wlUid: string }) => adminApi(`/api/athletes/${v.id}/link`, { method: 'POST', body: { wlUid: v.wlUid } }))
  const dismiss = useAdminMutation(eventId, (v: { id: number; wlUid: string }) => adminApi(`/api/athletes/${v.id}/dismiss`, { method: 'POST', body: { wlUid: v.wlUid } }))
  const createMatch = useAdminMutation(eventId, (v: { athleteAId: number; athleteBId: number }) =>
    adminApi<{ warnings?: string[] }>(`/api/events/${eventId}/matches`, { method: 'POST', body: v }), { proposals: true })

  const poolKey = detail.athletes.flatMap(a => [a.suggestedWlUid, a.wlUid]).filter(u => u !== null).join(',')
  const [suggestions, setSuggestions] = useState<Map<string, RosterCandidate>>(new Map())
  const [poolError, setPoolError] = useState<string | null>(null)
  useEffect(() => {
    if (poolKey === '') return
    let ignore = false
    adminApi<RosterCandidate[]>(`/api/events/${eventId}/candidates`)
      .then(rows => {
        if (ignore) return
        setSuggestions(new Map(rows.map(c => [c.wlUid, c])))
        setPoolError(null)
      })
      .catch(e => { if (!ignore) setPoolError(e instanceof ApiError ? e.message : 'Could not reach the server') })
    return () => { ignore = true }
  }, [eventId, poolKey])

  const byTeam = (teamId: number | null) => detail.athletes.filter(a => a.teamId === teamId).sort((x, y) => x.lastName.localeCompare(y.lastName) || x.firstName.localeCompare(y.firstName))
  const groups = [
    ...detail.teams.map(t => ({ key: `t${t.id}`, title: t.name, color: t.color as string | null, teamId: t.id as number | null, kids: byTeam(t.id) })),
    { key: 'u', title: 'Unassigned', color: null as string | null, teamId: null as number | null, kids: byTeam(null) },
  ]
  const order = groups.flatMap(g => g.kids.map(k => k.id))

  const onSelect = (id: number, v: boolean, range: boolean) => {
    const from = anchor.current
    anchor.current = id
    setSelected(s => {
      const n = new Set(s)
      const start = from === null ? -1 : order.indexOf(from)
      const end = order.indexOf(id)
      if (range && start !== -1 && end !== -1) {
        for (const rid of order.slice(Math.min(start, end), Math.max(start, end) + 1)) {
          if (v) n.add(rid)
          else n.delete(rid)
        }
        return n
      }
      if (v) n.add(id)
      else n.delete(id)
      return n
    })
  }

  const clearSelection = () => setSelected(new Set())
  const clearMessages = () => { setReport(null); setMatchNotice(null) }
  const markScoring = (scoring: boolean) => {
    clearMessages()
    mark.mutate({ ids: [...selected], scoring }, { onSuccess: clearSelection })
  }
  const moveTo = (ids: number[], teamId: number | null) => {
    clearMessages()
    const moving = ids.filter(id => detail.athletes.find(a => a.id === id)?.teamId !== teamId)
    if (moving.length === 0) {
      clearSelection()
      return
    }
    assign.mutate({ ids: moving, teamId }, { onSuccess: clearSelection })
  }

  const onPatch = (id: number, body: Partial<AthleteRow>) => { clearMessages(); patch.mutate({ id, body }, {
    onError: () => setFaults(f => new Set(f).add(id)),
    onSuccess: () => setFaults(f => {
      if (!f.has(id)) return f
      const n = new Set(f)
      n.delete(id)
      return n
    }),
  }) }

  const drag = useRosterDrag((id, teamId) => moveTo([id], teamId))

  const closeRemove = () => {
    setRemoving([])
    setStoppedOn(null)
    remove.reset()
  }
  const runRemove = async () => {
    setStoppedOn(null)
    clearMessages()
    const done: number[] = []
    let halted: AthleteRow | null = null
    for (const kid of removing) {
      try {
        await remove.mutateAsync(kid.id)
        done.push(kid.id)
      } catch {
        halted = kid
        break
      }
    }
    if (halted) setStoppedOn(athleteName(halted))
    if (done.length > 0) {
      setSelected(s => {
        const n = new Set(s)
        for (const id of done) n.delete(id)
        return n
      })
    }
    if (done.length === removing.length) closeRemove()
    else setRemoving(removing.filter(k => !done.includes(k.id)))
  }

  const inMatch = useMemo(
    () => new Set(detail.matches.flatMap(matchAthleteIds)),
    [detail.matches],
  )
  const unfought = useMemo(
    () => new Set(detail.matches.filter(m => m.status === 'pending' || m.status === 'live').flatMap(matchAthleteIds)),
    [detail.matches],
  )
  const selectedRows = detail.athletes.filter(a => selected.has(a.id))
  const [pairAId, pairBId] = selectedRows.length === 2 ? order.filter(id => selected.has(id)) : []
  const pairA = detail.athletes.find(a => a.id === pairAId)
  const pairB = detail.athletes.find(a => a.id === pairBId)
  const matchDisabledTitle = !pairA || !pairB
    ? undefined
    : pairA.teamId === null || pairB.teamId === null || pairA.teamId === pairB.teamId
      ? 'Pick two competitors on different teams.'
      : unfought.has(pairA.id) ? `${athleteName(pairA)} already has a match.`
        : unfought.has(pairB.id) ? `${athleteName(pairB)} already has a match.`
          : undefined
  const runCreateMatch = () => {
    if (!pairA || !pairB) return
    clearMessages()
    createMatch.mutate({ athleteAId: pairA.id, athleteBId: pairB.id }, {
      onSuccess: r => {
        const warnings = r?.warnings ?? []
        setMatchNotice({
          ok: true,
          text: warnings.length === 0 ? 'Match created.' : `${athleteName(pairA)} and ${athleteName(pairB)}: ${warnings.join('. ')}.`,
        })
        clearSelection()
      },
      onError: e => setMatchNotice({ ok: false, text: writeErrorMessage(e) }),
    })
  }
  const removable = selectedRows.filter(a => !inMatch.has(a.id))
  const blockedCount = selectedRows.length - removable.length
  const needsData = detail.athletes.filter(a => a.age === null || a.weightLbs === null).length
  const failure = [
    assign.error ? { title: 'The move failed', message: writeErrorMessage(assign.error), at: assign.submittedAt } : null,
    patch.error ? { title: 'The edit was not saved', message: writeErrorMessage(patch.error), at: patch.submittedAt } : null,
    confirm.error ? { title: 'That competitor was not linked', message: writeErrorMessage(confirm.error), at: confirm.submittedAt } : null,
    dismiss.error ? { title: 'That candidate was not dismissed', message: writeErrorMessage(dismiss.error), at: dismiss.submittedAt } : null,
    mark.error ? { title: 'The scoring change was not saved', message: writeErrorMessage(mark.error), at: mark.submittedAt } : null,
  ].filter((f): f is { title: string; message: string; at: number } => f !== null)
    .sort((x, y) => y.at - x.at)[0] ?? null
  const announcement = selected.size === 0
    ? ''
    : `${selected.size} ${selected.size === 1 ? 'competitor' : 'competitors'} selected.`

  return (
    <div className="grid gap-6" data-dragging={drag.dragging}>
      <span aria-live="polite" className="sr-only">{announcement}</span>
      {selected.size > 0 ? (
        <div role="group" aria-label="Selection" className="flex min-h-10 flex-wrap items-center gap-3">
          <span className="t3 font-medium!"><span className="fig">{selected.size}</span> selected</span>
          <OverflowMenu
            label="Move to"
            items={[
              ...detail.teams.map(t => ({ key: String(t.id), label: `Move to ${t.name}`, disabled: false, onSelect: () => moveTo([...selected], t.id) })),
              { key: 'none', label: 'Move to Unassigned', disabled: false, onSelect: () => moveTo([...selected], null) },
            ]}
          />
          <Button size="sm" variant="ghost" disabled={mark.isPending} onClick={() => markScoring(true)}>Mark scoring</Button>
          <Button size="sm" variant="ghost" disabled={mark.isPending} onClick={() => markScoring(false)}>Unmark scoring</Button>
          {selectedRows.length === 2 && (
            <Button size="sm" variant="ghost" disabled={matchDisabledTitle !== undefined || createMatch.isPending} title={matchDisabledTitle} onClick={runCreateMatch}>
              Create match
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={removable.length === 0} onClick={() => setRemoving(removable)}>Remove</Button>
          <Button size="sm" variant="ghost" onClick={clearSelection}>Clear</Button>
          {blockedCount > 0 && (
            <span className="t2 text-gray-10">
              <span className="fig">{blockedCount}</span> already in a match
            </span>
          )}
        </div>
      ) : (
        <div className="flex min-h-10 flex-wrap items-center gap-2">
          <span className="t2 text-gray-10">
            {detail.teams.length} teams · {detail.athletes.length} competitors
            {needsData > 0 && ` · ${needsData} need age or weight`}
          </span>
          <span className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setSyncOpen(true)}>Sync from WellnessLiving</Button>
            <Button size="sm" variant="secondary" onClick={() => setPasteOpen(true)}>Paste roster</Button>
            <Button size="sm" onClick={() => { setAddTeamId(null); setAddOpen(true) }}>Add competitor</Button>
          </span>
        </div>
      )}
      {failure && (
        <Alert>
          <AlertTitle>{failure.title}</AlertTitle>
          <AlertDescription>{failure.message}</AlertDescription>
        </Alert>
      )}
      {poolError !== null && (
        <Alert>
          <AlertTitle>The WellnessLiving pool did not load</AlertTitle>
          <AlertDescription>{poolError}</AlertDescription>
        </Alert>
      )}
      {report && (
        <Alert variant="attend">
          <AlertTitle variant="attend">The roster was synced with WellnessLiving</AlertTitle>
          <AlertDescription>
            <span className="grid gap-1">
              {reportLines(report).map(line => <span key={line}>{line}</span>)}
            </span>
          </AlertDescription>
        </Alert>
      )}
      {matchNotice && (
        <Alert variant={matchNotice.ok ? 'attend' : 'fault'}>
          <AlertDescription>{matchNotice.text}</AlertDescription>
        </Alert>
      )}
      <AddKidDialog detail={detail} open={addOpen} onOpenChange={setAddOpen} initialTeamId={addTeamId} />
      <PasteRosterDialog detail={detail} open={pasteOpen} onOpenChange={setPasteOpen} />
      <SyncRosterDialog detail={detail} open={syncOpen} onOpenChange={setSyncOpen} onReport={setReport} />
      <LinkCandidateDialog
        detail={detail}
        kid={linking}
        open={linking !== null}
        onOpenChange={o => { if (!o) setLinking(null) }}
      />
      <ProfileSheet
        detail={detail}
        kid={profileFor}
        open={profileFor !== null}
        onOpenChange={o => { if (!o) setProfileFor(null) }}
      />
      <Dialog open={removing.length > 0} onOpenChange={o => { if (!o) closeRemove() }}>
        {removing.length > 0 && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {removing.length === 1 ? `Remove ${athleteName(removing[0])}?` : `Remove ${removing.length} competitors?`}
              </DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p className="t3 text-gray-11">This takes the competitor off this event's roster. Competitors already placed in a match cannot be removed.</p>
              {remove.error && (
                <Alert>
                  <AlertTitle>{stoppedOn ?? 'The competitor'} was not removed</AlertTitle>
                  <AlertDescription>{writeErrorMessage(remove.error)}</AlertDescription>
                </Alert>
              )}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={closeRemove}>Cancel</Button>
              <Button type="button" variant="destructive" disabled={remove.isPending} onClick={runRemove}>Remove</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
      <div className="grid items-start gap-6 [grid-template-columns:repeat(auto-fit,minmax(400px,1fr))]">
        {groups.map(g => (
          <RosterGroup
            onAdd={() => { setAddTeamId(g.teamId); setAddOpen(true) }}
            key={g.key}
            title={g.title}
            color={g.color}
            teamId={g.teamId}
            kids={g.kids}
            selected={selected}
            faults={faults}
            inMatch={inMatch}
            pendingOrLive={unfought}
            suggestions={suggestions}
            dragging={drag.dragging}
            over={drag.over === dropZoneValue(g.teamId)}
            onSelect={onSelect}
            onPatch={onPatch}
            onRemove={kid => setRemoving([kid])}
            onUnassign={kid => moveTo([kid.id], null)}
            onLink={kid => { clearMessages(); setLinking(kid) }}
            onConfirm={(kid, wlUid) => { clearMessages(); confirm.mutate({ id: kid.id, wlUid }) }}
            onDismiss={(kid, wlUid) => { clearMessages(); dismiss.mutate({ id: kid.id, wlUid }) }}
            onProfile={setProfileFor}
            onDragStart={drag.start}
          />
        ))}
      </div>
    </div>
  )
}
