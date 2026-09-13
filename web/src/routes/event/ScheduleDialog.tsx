import { useEffect, useState } from 'react'
import { writeErrorMessage } from '@/lib/eventMode'
import { adminApi, useAdminMutation } from '@/lib/queries'
import type { EventDetail, ScheduleAnswer, SchedulePlan } from '@/lib/types'
import { cn } from '@/lib/utils'
import { dialogBody, dialogFooter, dialogSurface } from '@/components/dialog-frame'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { FieldHead, FieldRow, FieldSet } from '@/components/ui/field-set'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const MAT_COLS = 'grid grid-cols-[minmax(0,1fr)_auto] gap-3'

/**
 * How long the plan says the event runs, at the resolution anybody can act on. The hour
 * part is dropped under an hour rather than printed as a zero, and one wave on one mat is
 * one wave on one mat: a sentence the room reads has to be a sentence.
 */
export function wavesLine(plan: SchedulePlan): string {
  const hours = Math.floor(plan.minutes / 60)
  const minutes = plan.minutes % 60
  const time = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
  const waves = `${plan.waves} ${plan.waves === 1 ? 'wave' : 'waves'}`
  const mats = `${plan.perMat.length} ${plan.perMat.length === 1 ? 'mat' : 'mats'}`
  return `${waves}, about ${time} on ${mats}`
}

/** A mat that idles for a wave, and the match the whole lane is waiting on. */
export function gapLine(plan: SchedulePlan, gap: SchedulePlan['gaps'][number]): string {
  const number = plan.perMat.find(m => m.matId === gap.matId)?.number ?? 1
  return `Mat ${number} waits on M${gap.waitingOn}`
}

/**
 * Spec 9's preview. Ordering the matches rewrites the mat and the running order of every
 * pending match at once, so it is stated before it is written: what each mat is given,
 * how long the plan takes, what it had to bend, and where a mat sits idle.
 */
export function ScheduleDialog({ detail, open, onOpenChange }: { detail: EventDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const eventId = detail.event.id
  const [plan, setPlan] = useState<SchedulePlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const apply = useAdminMutation(eventId, () =>
    adminApi<ScheduleAnswer>(`/api/events/${eventId}/schedule`, { method: 'POST', body: { apply: true } }))

  // Opening asks for the plan. It is a read that has to be a POST, so it runs here rather
  // than as a query: nothing caches a preview of a write nobody has made yet.
  useEffect(() => {
    if (!open) return
    let ignore = false
    setPlan(null)
    setError(null)
    apply.reset()
    adminApi<ScheduleAnswer>(`/api/events/${eventId}/schedule`, { method: 'POST', body: { apply: false } })
      .then(answer => { if (!ignore) setPlan(answer) })
      .catch((e: Error) => { if (!ignore) setError(writeErrorMessage(e)) })
    return () => { ignore = true }
  }, [open, eventId])

  const onApply = () => {
    setError(null)
    apply.mutate(undefined, {
      onSuccess: () => onOpenChange(false),
      onError: (e: Error) => setError(writeErrorMessage(e)),
    })
  }

  const empty = plan !== null && plan.order.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogSurface(576)}>
        <DialogHeader>
          <div className="grid min-w-0 gap-0.5">
            <DialogTitle>Order matches</DialogTitle>
            <DialogDescription className="t2 text-gray-10">
              Gi first, younger first, nobody twice in a row, and every feeder before the round it feeds.
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody className={cn(dialogBody, 'gap-4')}>
          {plan === null && error === null && <Skeleton className="h-24 w-full" />}

          {plan !== null && (
            <>
              <p className="t3 text-gray-11">{wavesLine(plan)}</p>
              <FieldSet>
                <FieldHead className={MAT_COLS}>
                  <span className="font-sans">Mat</span>
                  <span className="tick text-right font-sans">Matches</span>
                </FieldHead>
                {empty
                  ? <EmptyState message="Nothing left to order." />
                  : plan.perMat.map(m => (
                    <FieldRow key={m.matId ?? 'none'} className={cn(MAT_COLS, 'h-9')}>
                      <span className="truncate t3">Mat <span className="fig">{m.number}</span></span>
                      <span className="fig t3 text-right text-gray-11">{m.count}</span>
                    </FieldRow>
                  ))}
              </FieldSet>

              {(plan.warnings.length > 0 || plan.gaps.length > 0) && (
                <div className="grid gap-1">
                  {plan.warnings.map(w => <p key={w} className="t2 text-attend">{w}</p>)}
                  {plan.gaps.map(g => <p key={`${g.wave}-${g.matId}`} className="t2 text-gray-10">{gapLine(plan, g)}</p>)}
                </div>
              )}
            </>
          )}

          {error !== null && (
            <Alert>
              <AlertTitle>The order did not run</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </DialogBody>
        <DialogFooter className={dialogFooter}>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" disabled={plan === null || empty || apply.isPending} onClick={onApply}>Apply order</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
