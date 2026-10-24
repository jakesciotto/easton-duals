import { useEffect, useState } from 'react'
import { useSnapshot } from '@/lib/useSnapshot'
import { statusOf } from '@/lib/eventMode'
import type { EventDetail } from '@/lib/types'
import { cn } from '@/lib/utils'
import { SetupSteps } from '@/components/SetupSteps'
import { dialogBody, dialogFooter, dialogSurface } from '@/components/dialog-frame'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PasteMatchesDialog } from './PasteMatchesDialog'
import { ProposalsPanel } from './ProposalsPanel'
import { ScheduleDialog } from './ScheduleDialog'

export function SetupMatchesStep({ detail, open, onClose }: {
  detail: EventDetail
  open: boolean
  onClose: () => void
}) {
  const { live } = useSnapshot(detail.event.id)
  const certified = statusOf(live, detail.event.status) === 'certified'
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [orderOpen, setOrderOpen] = useState(false)
  useEffect(() => {
    if (open) return
    setConfirmOpen(false)
    setPasteOpen(false)
    setOrderOpen(false)
  }, [open])
  const standingDown = confirmOpen || pasteOpen || orderOpen
  const competitors = detail.athletes.length
  const teams = detail.teams.length

  return (
    <>
      <Dialog open={open && !standingDown} onOpenChange={o => { if (!o) onClose() }}>
        <DialogContent className={dialogSurface(640)} keepMounted={open} data-poll-through>
          <DialogHeader>
            <div className="grid gap-1">
              <DialogTitle>Assign the matches</DialogTitle>
              <SetupSteps current={3} />
            </div>
          </DialogHeader>
          <DialogBody className={dialogBody}>
            <p className="t3 text-gray-11">
              <span className="fig">{competitors}</span> {competitors === 1 ? 'competitor' : 'competitors'} across{' '}
              <span className="fig">{teams}</span> {teams === 1 ? 'team' : 'teams'}. Proposing pairs them across teams by
              weight class first, then age, and you confirm the ones you want.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" size="sm" variant="secondary" disabled={certified} onClick={() => setPasteOpen(true)}>Paste matches</Button>
              <Button type="button" size="sm" variant="secondary" disabled={certified} onClick={() => setOrderOpen(true)}>Order matches</Button>
            </div>
            <ProposalsPanel detail={detail} certified={certified} onConfirmOpenChange={setConfirmOpen} />
          </DialogBody>
          <DialogFooter className={cn(dialogFooter, 'justify-between')}>
            <Button type="button" variant="ghost" onClick={onClose}>Skip for now</Button>
            <Button type="button" onClick={onClose}>Open the event</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PasteMatchesDialog detail={detail} open={pasteOpen} onOpenChange={setPasteOpen} />
      <ScheduleDialog detail={detail} open={orderOpen} onOpenChange={setOrderOpen} />
    </>
  )
}
