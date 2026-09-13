import { useMemo, useState } from 'react'
import { writeErrorMessage } from '@/lib/eventMode'
import { parseMatchPaste, type MatchPasteLine } from '@/lib/match-paste'
import { adminApi, useAdminMutation } from '@/lib/queries'
import { athleteName, formatLabel, styleTag, stylesLabel } from '@/lib/format'
import type { DivisionView, EventDetail, MatchRow } from '@/lib/types'
import { cn } from '@/lib/utils'
import { dialogBody, dialogFooter, dialogSurface } from '@/components/dialog-frame'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface BulkResult { matches: MatchRow[]; divisions: DivisionView[]; warnings: string[] }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Spec 9's button, and the sentence it makes when the paste holds only one kind: naming
 * "0 divisions" beside three matches states a thing the operator did not ask for.
 */
export function createLabel(matches: number, divisions: number): string {
  if (matches > 0 && divisions > 0) return `Create ${plural(matches, 'match', 'matches')} and ${plural(divisions, 'division', 'divisions')}`
  if (divisions > 0) return `Create ${plural(divisions, 'division', 'divisions')}`
  return `Create ${plural(matches, 'match', 'matches')}`
}

/** What the paste holds, or what is stopping it. One line, either way. */
export function countLine(matches: number, divisions: number, errors: number): string {
  if (errors > 0) return `${plural(errors, 'line', 'lines')} to fix.`
  if (matches === 0 && divisions === 0) return ''
  return `${createLabel(matches, divisions).replace('Create ', '')} ready.`
}

function PreviewRow({ line, nameOf }: { line: MatchPasteLine; nameOf: (id: number) => string }) {
  const row = line.row
  return (
    <TableRow>
      <TableCell className="w-[var(--col-state)] p-0">
        <span aria-hidden className={cn('block h-8 w-[var(--col-state)]', line.problem !== null && 'bg-fault')} />
      </TableCell>
      <TableCell numeric className="text-gray-10">{line.n}</TableCell>
      {row === null ? (
        <TableCell colSpan={4}>
          <span className="truncate text-gray-10">{line.text}</span>
          <span className="ml-3 t2 text-fault">{line.problem}</span>
        </TableCell>
      ) : (
        <>
          <TableCell className="w-[80px] t2 text-gray-10">{row.kind === 'pair' ? 'Pair' : 'Division'}</TableCell>
          <TableCell className="min-w-0">
            <span className="grid min-w-0 gap-0.5">
              <span className="truncate text-gray-12">
                {row.kind === 'pair'
                  ? `${nameOf(row.athleteAId)} vs ${nameOf(row.athleteBId)}`
                  : `${row.name}: ${row.athleteIds.map(nameOf).join(', ')}`}
              </span>
              {row.notes.length > 0 && <span className="truncate t2 text-attend">{row.notes.join(' · ')}</span>}
            </span>
          </TableCell>
          <TableCell className="w-[72px] t2 text-gray-11">
            {row.kind === 'pair' ? styleTag(row.style) : stylesLabel(row.styles)}
          </TableCell>
          <TableCell className="w-[152px] t2 text-gray-11">{row.kind === 'division' ? formatLabel(row.format) : ''}</TableCell>
        </>
      )}
    </TableRow>
  )
}

/**
 * Spec 7's creation path. It mirrors the roster paste, because an organizer who has
 * already pasted a roster into this event has learned this screen once: a textarea, the
 * preview that says what every line will make, and one button that names the writes.
 */
export function PasteMatchesDialog({ detail, open, onOpenChange }: { detail: EventDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [text, setText] = useState('')
  // What the server noticed about the set it just wrote. A warning never blocks a write,
  // so it is reported after it rather than instead of it.
  const [warnings, setWarnings] = useState<string[]>([])
  const parsed = useMemo(() => parseMatchPaste(text, detail.athletes, detail.matches), [text, detail.athletes, detail.matches])
  const byId = useMemo(() => new Map(detail.athletes.map(a => [a.id, a])), [detail.athletes])
  const nameOf = (id: number) => { const a = byId.get(id); return a ? athleteName(a) : 'Unknown' }

  // A pasted pair can drop a proposal on either competitor, so this write invalidates the
  // draft list the same way the Add match dialog already does.
  const create = useAdminMutation(
    detail.event.id,
    (body: unknown) => adminApi<BulkResult>(`/api/events/${detail.event.id}/matches/bulk`, { method: 'POST', body }),
    { proposals: true },
  )

  const count = parsed.matches.length + parsed.divisions.length
  const blocked = parsed.errors.length > 0

  const submit = () => {
    setWarnings([])
    create.mutate({ matches: parsed.matches, divisions: parsed.divisions }, {
      onSuccess: r => {
        const said = r?.warnings ?? []
        setText('')
        if (said.length === 0) { onOpenChange(false); return }
        // Everything is on file. The dialog stays up to report what the server noticed
        // about it, with the box cleared for the next paste.
        setWarnings(said)
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogSurface(672)}>
        <DialogHeader><DialogTitle>Paste matches</DialogTitle></DialogHeader>
        <DialogBody className={cn(dialogBody, 'gap-4')}>
          <p className="t2 text-gray-11">
            One match or one division per line. A pair is <code className="fig text-gray-10">First Last vs First Last</code>, and a
            division names its format: <code className="fig text-gray-10">47 to 53 boys, single elim, First Last, First Last</code>.
          </p>
          <Textarea
            aria-label="Match text"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={'Mateo Rivera vs Olivia Kim, nogi\n47 to 53 boys, round robin, Mateo Rivera, Olivia Kim, Kai Espinoza'}
            className="font-mono"
          />

          {/* 7.12: one polite region, in the DOM and empty from the first render. */}
          <p aria-live="polite" className="t2 text-gray-10">{countLine(parsed.matches.length, parsed.divisions.length, parsed.errors.length)}</p>

          {parsed.lines.length > 0 && (
            // The caller's vertical scroll folds into Table's own wrapper rather than
            // adding a second scrolling div around it, the way the roster paste does.
            <Table wrapperClassName="max-h-[224px] overflow-y-auto">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[var(--col-state)] p-0"><span className="sr-only">Line state</span></TableHead>
                  <TableHead numeric className="w-[var(--col-num-s)]">Line</TableHead>
                  <TableHead className="w-[80px]">Kind</TableHead>
                  <TableHead>Competitors</TableHead>
                  <TableHead className="w-[72px]">Style</TableHead>
                  <TableHead className="w-[152px]">Format</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsed.lines.map((l, i) => <PreviewRow key={`${l.n}-${i}`} line={l} nameOf={nameOf} />)}
              </TableBody>
            </Table>
          )}

          {warnings.length > 0 && (
            <Alert variant="attend">
              <AlertTitle variant="attend">Matches added</AlertTitle>
              {warnings.map(w => <AlertDescription key={w}>{w}</AlertDescription>)}
            </Alert>
          )}
          {create.error && (
            <Alert>
              <AlertTitle>Those matches were not added</AlertTitle>
              <AlertDescription>{writeErrorMessage(create.error)}</AlertDescription>
            </Alert>
          )}
        </DialogBody>
        <DialogFooter className={dialogFooter}>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending || blocked || count === 0}>
            {createLabel(parsed.matches.length, parsed.divisions.length)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
