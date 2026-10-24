import { useMemo, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router'
import { Field } from '@base-ui/react/field'
import type { EventMode, EventStatus, Snapshot } from '@shared/types'
import { PinGate } from '@/components/PinGate'
import { AdminShell } from '@/components/AdminShell'
import { RouteFallback } from '@/components/RouteFallback'
import { ApiError } from '@/lib/api'
import { adminApi, useAdminMutation, useEventDetail } from '@/lib/queries'
import { SnapshotStreamContext, useSnapshot } from '@/lib/useSnapshot'
import { pollIntervalForSnapshot } from '@/lib/pollInterval'
import { SETUP_PARAM, setupStepOf, type SetupStep } from '@/lib/setupFlow'
import {
  MODE_GROUP_LABEL, MODE_LABEL, MODE_OPTIONS, deskSwitchConsequence, deskSwitchMidMatch,
  deskSwitchRefusal, modeOf, statusOf, toMode, writeErrorMessage, CERTIFIED_REFUSAL, type MidMatchMat,
} from '@/lib/eventMode'
import { FAR_STEPS, farOf } from './board/useFar'
import { cn } from '@/lib/utils'
import type { EventDetail } from '@/lib/types'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { List, ListRow } from '@/components/ui/list'
import { Segment } from '@/components/ui/segment'
import { dialogBody, dialogFooter, dialogSurface } from '@/components/dialog-frame'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { OverflowMenu } from '@/components/OverflowMenu'
import { ContactDialog, contactFooter } from './event/ContactDialog'
import { TeamsDialog } from './event/TeamsDialog'
import { DELETE_EVENT_ACTION, DeleteEventDialog } from './event/DeleteEventDialog'
import { SmoothcompDialog } from './event/SmoothcompDialog'
import { RosterTab } from './event/RosterTab'
import { EntryTab } from './event/EntryTab'
import { RulesetsTab } from './event/RulesetsTab'
import { MatchesTab } from './event/MatchesTab'
import { LiveTab } from './event/LiveTab'
import { SetupRosterStep } from './event/SetupRosterStep'
import { SetupMatchesStep } from './event/SetupMatchesStep'

const STATUS: Record<EventStatus, { label: string; variant: 'default' | 'live' | 'done' }> = {
  setup: { label: 'Setup', variant: 'default' },
  live: { label: 'Live', variant: 'live' },
  done: { label: 'Done', variant: 'done' },
  certified: { label: 'Certified', variant: 'done' },
}

const PANEL = 'px-4 pt-6 pb-10 sm:px-6'

export const FAR_GROUP_LABEL = 'Board far'
const FAR_OPTIONS = FAR_STEPS.map(value => ({ value: String(value), label: String(value) }))

function DeskSwitchDialog({ mats, pending, error, onCancel, onConfirm }: {
  mats: MidMatchMat[]
  pending: boolean
  error: Error | null
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={mats.length > 0} onOpenChange={o => { if (!o) onCancel() }}>
      <DialogContent className={dialogSurface(512)}>
        <DialogHeader><DialogTitle>Switch to {MODE_LABEL.entry.toLowerCase()}?</DialogTitle></DialogHeader>
        <DialogBody className={dialogBody}>
          <div className="grid gap-3">
            <p className="t3 text-gray-11">{deskSwitchConsequence(mats)}</p>
            <List>
              {mats.map(mat => (
                <ListRow key={mat.number} className="flex items-center gap-3">
                  <span className="shrink-0 t2 text-gray-10">Mat <span className="fig">{mat.number}</span></span>
                  <span className="min-w-0 flex-1 truncate t3">{mat.pair}</span>
                </ListRow>
              ))}
            </List>
            <p className="t2 text-gray-10">The board drops the mat rack as soon as the desk takes over.</p>
            {error && (
              <Alert>
                <AlertTitle>How this event runs was not changed</AlertTitle>
                <AlertDescription>{writeErrorMessage(error)}</AlertDescription>
              </Alert>
            )}
          </div>
        </DialogBody>
        <DialogFooter className={dialogFooter}>
          <Button type="button" variant="secondary" onClick={onCancel}>Keep the mats scoring</Button>
          <Button type="button" disabled={pending} onClick={onConfirm}>Switch to the desk</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EventMeta({ eventId, detail, mode, refusal, certified, snapshot }: {
  eventId: number
  detail: EventDetail
  mode: EventMode
  refusal: string | null
  certified: boolean
  snapshot: Snapshot | null
}) {
  const [confirming, setConfirming] = useState<MidMatchMat[]>([])
  const [contactOpen, setContactOpen] = useState(false)
  const [teamsOpen, setTeamsOpen] = useState(false)
  const set = useAdminMutation(eventId, (m: EventMode) => adminApi(`/api/events/${eventId}`, { method: 'PATCH', body: { mode: m } }))
  const setFar = useAdminMutation(eventId, (far: number) => adminApi(`/api/events/${eventId}`, { method: 'PATCH', body: { far } }))
  const storedFar = farOf(detail)
  const shownFar = setFar.isPending && setFar.variables !== undefined ? setFar.variables : storedFar
  const shown = set.isPending && set.variables !== undefined ? set.variables : mode
  const contact = detail.event.contact ?? null

  const pick = (value: string) => {
    if (refusal !== null) return
    const next = toMode(value)
    if (next === mode) return
    const midMatch = next === 'entry' ? deskSwitchMidMatch(snapshot) : []
    if (midMatch.length > 0) { setConfirming(midMatch); return }
    set.mutate(next)
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 t2 text-gray-10">
        <span className="fig">{detail.event.date}</span>
        <span><span className="fig">{detail.athletes.length}</span> competitors</span>
        <span><span className="fig">{detail.matches.length}</span> matches</span>
        <Button variant="ghost" size="sm" onClick={() => setTeamsOpen(true)}>
          <span className="fig">{detail.teams.length}</span> teams
        </Button>
        <Button
          variant="ghost" size="sm" disabled={certified}
          title={certified ? CERTIFIED_REFUSAL : undefined}
          onClick={() => setContactOpen(true)}
        >
          {contact === null ? 'Add a desk contact' : `Desk contact: ${contact.name}`}
        </Button>
        <span className="ml-auto flex min-w-0 items-center gap-2">
          <span className="whitespace-nowrap">{FAR_GROUP_LABEL}</span>
          <Field.Root disabled={certified} className={cn('min-w-0', certified && 'opacity-50')}>
            <Segment
              aria-label={FAR_GROUP_LABEL}
              value={shownFar === null ? '' : String(shownFar)}
              options={FAR_OPTIONS}
              onValueChange={v => { if (!certified) setFar.mutate(Number(v)) }}
            />
          </Field.Root>
        </span>
        <Field.Root disabled={refusal !== null} className={cn('min-w-0', refusal !== null && 'opacity-50')}>
          <Segment
            aria-label={MODE_GROUP_LABEL}
            value={shown}
            options={MODE_OPTIONS}
            onValueChange={pick}
          />
        </Field.Root>
      </div>
      {refusal !== null && <p className="t2 text-gray-10">{refusal}</p>}
      {set.error && confirming.length === 0 && (
        <Alert>
          <AlertTitle>How this event runs was not changed</AlertTitle>
          <AlertDescription>{writeErrorMessage(set.error)}</AlertDescription>
        </Alert>
      )}
      {setFar.error && (
        <Alert>
          <AlertTitle>The board size was not changed</AlertTitle>
          <AlertDescription>{writeErrorMessage(setFar.error)}</AlertDescription>
        </Alert>
      )}
      <DeskSwitchDialog
        mats={confirming}
        pending={set.isPending}
        error={set.error}
        onCancel={() => { setConfirming([]); set.reset() }}
        onConfirm={() => set.mutate('entry', { onSuccess: () => setConfirming([]) })}
      />
      <ContactDialog open={contactOpen} onOpenChange={setContactOpen} detail={detail} />
      <TeamsDialog detail={detail} certified={certified} open={teamsOpen} onOpenChange={setTeamsOpen} />
    </div>
  )
}

function EventBody({ eventId }: { eventId: number }) {
  const q = useEventDetail(eventId)
  const [params, setParams] = useSearchParams()
  const step = setupStepOf(params.get(SETUP_PARAM))
  const [picked, setPicked] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [smoothcompOpen, setSmoothcompOpen] = useState(false)
  const stream = useSnapshot(eventId)
  const shared = useMemo(() => ({ eventId, state: stream }), [eventId, stream])
  if (q.isLoading) return <RouteFallback rung="two-line" />
  if (q.error || !q.data) {
    return (
      <AdminShell title="Event" connected={q.error instanceof ApiError ? undefined : stream.connected}>
        <div className={PANEL}>
          <Alert>
            <AlertDescription>{q.error?.message ?? 'Not found'}</AlertDescription>
          </Alert>
        </div>
      </AdminShell>
    )
  }
  const detail = q.data
  const mode = modeOf(stream.live, detail.event.mode)
  const certified = statusOf(stream.live, detail.event.status) === 'certified'
  const refusal = certified ? CERTIFIED_REFUSAL : mode === 'live' ? deskSwitchRefusal(stream.live) : null
  const leave = (next: SetupStep | null) => {
    if (step !== null) setPicked(step)
    setParams(prev => {
      const n = new URLSearchParams(prev)
      if (next === null) n.delete(SETUP_PARAM)
      else n.set(SETUP_PARAM, next)
      return n
    }, { replace: true })
  }
  const landing = mode === 'entry' ? 'entry' : 'roster'
  if (picked === null) setPicked(landing)
  const tab = step ?? picked ?? landing

  return (
    <AdminShell
      title={detail.event.name}
      status={<Badge variant={STATUS[detail.event.status].variant}>{STATUS[detail.event.status].label}</Badge>}
      actions={(
        <>
          <Link to={`/board/${eventId}`} target="_blank" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>Open board</Link>
          <OverflowMenu
            label="Event actions"
            items={[
              { key: 'smoothcomp', label: 'Smoothcomp standings', disabled: false, onSelect: () => setSmoothcompOpen(true) },
              { key: 'delete', label: DELETE_EVENT_ACTION, disabled: certified, tone: 'destructive', onSelect: () => setDeleteOpen(true) },
            ]}
          />
        </>
      )}
      freshness={{
        lastSuccessAt: stream.lastSuccessAt,
        pollIntervalMs: pollIntervalForSnapshot(stream.snapshot),
        paused: stream.paused,
        waiting: stream.waiting,
      }}
      connected={stream.connected}
      meta={<EventMeta eventId={eventId} detail={detail} mode={mode} refusal={refusal} certified={certified} snapshot={stream.live} />}
      footer={contactFooter(detail)}
    >
      <SnapshotStreamContext value={shared}>
        <Tabs value={tab} onValueChange={v => setPicked(String(v))} className="gap-0">
          <TabsList className="px-4 sm:px-6">
            <TabsTrigger value="roster">Roster<span className="ml-1.5 fig text-gray-10">{detail.athletes.length}</span></TabsTrigger>
            <TabsTrigger value="entry">Entry</TabsTrigger>
            <TabsTrigger value="rulesets">Rulesets</TabsTrigger>
            <TabsTrigger value="matches">Matches<span className="ml-1.5 fig text-gray-10">{detail.matches.length}</span></TabsTrigger>
            <TabsTrigger value="live">Live</TabsTrigger>
          </TabsList>
          <TabsContent value="roster" className={PANEL}><RosterTab detail={detail} /></TabsContent>
          <TabsContent value="entry" className={PANEL}><EntryTab detail={detail} /></TabsContent>
          <TabsContent value="rulesets" className={PANEL}><RulesetsTab detail={detail} /></TabsContent>
          <TabsContent value="matches" className={PANEL}><MatchesTab detail={detail} /></TabsContent>
          <TabsContent value="live" className={PANEL}><LiveTab detail={detail} /></TabsContent>
        </Tabs>
        <SetupRosterStep
          detail={detail}
          open={step === 'roster'}
          onClose={() => leave(null)}
          onContinue={() => leave('matches')}
        />
        <SetupMatchesStep detail={detail} open={step === 'matches'} onClose={() => leave(null)} />
      </SnapshotStreamContext>
      <SmoothcompDialog detail={detail} certified={certified} open={smoothcompOpen} onOpenChange={setSmoothcompOpen} />
      <DeleteEventDialog detail={detail} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </AdminShell>
  )
}

export default function EventPage() {
  const { eventId } = useParams()
  return <PinGate><EventBody eventId={Number(eventId)} /></PinGate>
}
