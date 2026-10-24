import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { PinGate } from '@/components/PinGate'
import { AdminShell } from '@/components/AdminShell'
import { RouteFallback } from '@/components/RouteFallback'
import { TeamPlate } from '@/components/TeamPlate'
import { NewEventDialog } from './admin/NewEventDialog'
import { useEvents } from '@/lib/queries'
import { eventSetupPath } from '@/lib/setupFlow'
import { MODE_LABEL } from '@/lib/eventMode'
import type { EventSummary } from '@/lib/types'
import { Button, buttonVariants } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FieldSet, FieldHead, FieldRow } from '@/components/ui/field-set'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'

const STATE_RULE: Record<EventSummary['status'], string> = {
  live: 'bg-live',
  setup: 'bg-gray-7',
  done: 'bg-transparent',
  certified: 'bg-transparent',
}

const ROW = 'grid h-10 grid-cols-[var(--col-state)_minmax(0,1fr)_92px_116px_var(--col-num-s)_auto] items-center gap-x-3 font-mono t2'

const PLATES = 2

function EventRow({ ev }: { ev: EventSummary }) {
  const shown = ev.teams.slice(0, PLATES)
  const rest = ev.teams.length - shown.length
  return (
    <FieldRow className={cn(ROW, 'relative')}>
      <span aria-hidden className={cn('h-full self-stretch', STATE_RULE[ev.status])} />
      <div className="flex min-w-0 items-center gap-3 font-sans">
        <Link
          to={`/events/${ev.id}`}
          className="truncate t3 font-medium text-gray-12 outline-none after:absolute after:inset-0 after:rounded-none focus-visible:shadow-focus"
        >
          {ev.name}
        </Link>
        {shown.map(t => <TeamPlate key={t.id} color={t.color} name={t.name} size="inline" className="hidden sm:inline-flex" />)}
        {rest > 0 && <span className="hidden shrink-0 t2 text-gray-10 sm:inline">and <span className="fig">{rest}</span> more</span>}
      </div>
      <span className="fig text-gray-10">{ev.date}</span>
      <span className="truncate font-sans text-gray-10" title={MODE_LABEL[ev.mode]}>{MODE_LABEL[ev.mode]}</span>
      <span className="fig text-right text-gray-10">{ev.matCount}</span>
      <Link to={`/board/${ev.id}`} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'relative font-sans')}>Board</Link>
    </FieldRow>
  )
}

function EventList() {
  const events = useEvents()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  if (events.isLoading) return <RouteFallback tabs={false} rung="default" />

  return (
    <AdminShell title="Events" actions={<Button size="sm" onClick={() => setOpen(true)}>New event</Button>}>
      <NewEventDialog open={open} onOpenChange={setOpen} onCreated={d => navigate(eventSetupPath(d.event.id, 'roster'))} />
      <div className="grid gap-6 px-6 pb-10">
        {events.error && (
          <Alert>
            <AlertDescription>{events.error.message}</AlertDescription>
          </Alert>
        )}
        {events.data && (
          <FieldSet data-frame="card">
            <FieldHead className={ROW}>
              <span aria-hidden />
              <span className="t1 font-sans">Event</span>
              <span className="tick t1 font-sans text-right">Date</span>
              <span className="t1 font-sans">Runs</span>
              <span className="tick t1 font-sans text-right">Mats</span>
              <span className="sr-only">Board</span>
            </FieldHead>
            {events.data.length === 0
              ? (
                <EmptyState
                  message="No events yet."
                  action={<Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Create the first one</Button>}
                />
              )
              : events.data.map(ev => <EventRow key={ev.id} ev={ev} />)}
          </FieldSet>
        )}
      </div>
    </AdminShell>
  )
}

export default function AdminPage() {
  return <PinGate><EventList /></PinGate>
}
