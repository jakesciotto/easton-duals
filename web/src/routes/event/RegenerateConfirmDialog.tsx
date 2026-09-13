import type { Style } from '@shared/types'
import { writeErrorMessage } from '@/lib/eventMode'
import { styleLabel } from '@/lib/format'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/**
 * 6.8's one piece of friction, in one place. Proposing again deletes the drafts of the
 * style it is asked for, the ones an organizer has already swapped by hand included, so it
 * states the figure it is about to throw away and which style it belongs to. It is asked
 * only when drafts of that style exist: the first press has nothing to replace.
 */
export function RegenerateConfirmDialog({ open, count, style, pending, error, onOpenChange, onConfirm }: {
  open: boolean
  count: number
  /** Proposing replaces only this style's drafts, so the sentence has to name it. */
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
