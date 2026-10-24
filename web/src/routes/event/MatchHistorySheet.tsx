import { useEffect, useState } from 'react'
import type { AuditEntry } from '@shared/types'
import { adminApi } from '@/lib/queries'
import { historyRows, type HistoryRow, type HistorySource } from './match-history'
import { cn } from '@/lib/utils'
import { dialogBody, dialogFooter, dialogSurface } from '@/components/dialog-frame'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { EmptyState } from '@/components/ui/empty-state'
import { List, ListRow } from '@/components/ui/list'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export const HISTORY_NOTE = 'Every recorded action, oldest first. Read only.'
export const HISTORY_EMPTY = 'Nothing has been recorded here yet.'

const ROW = 'grid grid-cols-[64px_72px_minmax(0,1fr)] items-baseline gap-3'

function LoadingRows() {
  return (
    <List aria-hidden>
      {[0, 1, 2, 3].map(i => (
        <ListRow key={i} className={ROW}>
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-4 w-40" />
        </ListRow>
      ))}
    </List>
  )
}

function Row({ row }: { row: HistoryRow }) {
  return (
    <ListRow className={ROW}>
      <span className="fig t2 text-gray-10">{row.time}</span>
      <span className={cn('t1 uppercase', row.fromMat ? 'text-gray-11' : 'text-gray-10')}>{row.who}</span>
      <span className="grid min-w-0 gap-0.5">
        <span className={cn('t3', row.undone !== null && 'text-gray-10')}>{row.what}</span>
        {row.detail !== null && <span className="t2 text-gray-10">{row.detail}</span>}
        {row.undone !== null && <span className="t2 text-gray-10">{row.undone}</span>}
      </span>
    </ListRow>
  )
}

export function MatchHistorySheet({ source, open, onOpenChange }: {
  source: HistorySource | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const path = open && source !== null ? source.path : null

  useEffect(() => {
    if (path === null) return
    let ignore = false
    setEntries(null)
    setError(null)
    adminApi<AuditEntry[]>(path)
      .then(rows => { if (!ignore) setEntries(rows) })
      .catch((e: Error) => { if (!ignore) setError(e) })
    return () => { ignore = true }
  }, [path])

  if (source === null) return null
  const rows = entries === null ? [] : historyRows(entries, source.context)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogSurface(512)}>
        <DialogHeader>
          <div className="grid min-w-0 gap-0.5">
            <span className="flex min-w-0 items-center gap-2">
              {source.number !== null && <Chip size="t1">M<span className="fig">{source.number}</span></Chip>}
              <DialogTitle>{source.title}</DialogTitle>
            </span>
            <DialogDescription className="t2 text-gray-10">{HISTORY_NOTE}</DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody className={dialogBody}>
          {error !== null && (
            <Alert>
              <AlertTitle>The history did not load</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}
          {error === null && entries === null && <LoadingRows />}
          {error === null && entries !== null && (
            <List>
              {rows.length === 0
                ? <EmptyState message={HISTORY_EMPTY} />
                : rows.map(row => <Row key={row.id} row={row} />)}
            </List>
          )}
        </DialogBody>
        <DialogFooter className={dialogFooter}>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
