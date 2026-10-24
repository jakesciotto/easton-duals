import type { Style } from '@shared/types'
import { writeErrorMessage } from '@/lib/eventMode'
import { styleLabel } from '@/lib/format'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function RegenerateConfirmDialog({ open, count, style, pending, error, onOpenChange, onConfirm }: {
  open: boolean
  count: number
  style: Style
  pending: boolean
  error: Error | null
  onOpenChange: (o: boolean) => void
  onConfirm: () => void
}) {
  const word = styleLabel(style).toLowerCase()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Replace {count} {word} {count === 1 ? 'proposal' : 'proposals'}?</DialogTitle></DialogHeader>
        <DialogBody>
          <p className="t3 text-gray-11">Proposing again replaces every {word} proposal on this event, the swaps you made by hand included.</p>
          <p className="t3 text-gray-11">Matches you have already confirmed, and proposals in the other style, are not affected.</p>
          {error && (
            <Alert>
              <AlertTitle>The proposals did not come back</AlertTitle>
              <AlertDescription>{writeErrorMessage(error)}</AlertDescription>
            </Alert>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" size="lg" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" size="lg" disabled={pending} onClick={onConfirm}>Propose more</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
