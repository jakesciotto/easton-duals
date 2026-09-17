import { useEffect, useState, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { SCORING_CAP } from '@shared/types'
import { CERTIFIED_REFUSAL, writeErrorMessage } from '@/lib/eventMode'
import { winnerLine } from '@/lib/format'
import { adminApi, useAdminMutation } from '@/lib/queries'
import type { EventDetail, StandingsReport } from '@/lib/types'
import { TeamPlate } from '@/components/TeamPlate'
import { dialogBody, dialogFooter, dialogSurface } from '@/components/dialog-frame'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { List, ListRow } from '@/components/ui/list'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PasteRosterDialog } from './PasteRosterDialog'

/** A numeral inside a sentence carries the figure face; the words around it do not. */
function Fig({ n }: { n: number }) {
  return <span className="fig">{n}</span>
}

/** One of the report's four exception lists, printed only when it has something in it. */
function Listing({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <p className="t2 text-gray-10">{title}</p>
      {children}
    </div>
  )
}

/**
 * Spec 4.2. The organizer pastes the roster the event runs on, saves the Smoothcomp event
 * the same children competed at, and reads back who won.
 *
 * The two halves are one dialog because neither answers on its own: Smoothcomp knows the
 * matches and nothing about the teams, the roster knows the teams and nothing about the
 * matches, and a name that is in one and not the other is the whole failure mode. So the
 * roster count sits above the URL rather than a tab away, and the report names every seat
 * it could not place instead of quietly tallying the rest.
 *
 * Nothing here is stored: the report is read and closed, the board never sees it, and a
 * certified event can still be read because reading changes nothing.
 */
export function SmoothcompDialog({ detail, certified, open, onOpenChange }: {
  detail: EventDetail
  certified: boolean
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const eventId = detail.event.id
  const stored = detail.event.smoothcompUrl ?? ''
  const [sub, setSub] = useState<'paste' | null>(null)
  const [url, setUrl] = useState(stored)
  const [report, setReport] = useState<StandingsReport | null>(null)
  const save = useAdminMutation(eventId, (smoothcompUrl: string) => adminApi(`/api/events/${eventId}`, { method: 'PATCH', body: { smoothcompUrl } }))
  // A plain mutation, not the admin one: the run writes an audit row and nothing the
  // event detail carries, so refetching the event after it would be a request for a row
  // that cannot have changed.
  const run = useMutation({ mutationFn: () => adminApi<StandingsReport>(`/api/events/${eventId}/smoothcomp/standings`, { method: 'POST' }) })

  // Opening reads whatever URL the event carries. Closing puts everything else back, so
  // the next press cannot open onto the last run's table with this run's URL above it.
  useEffect(() => {
    if (open) { setUrl(stored); return }
    setSub(null)
    setReport(null)
    save.reset()
    run.reset()
  }, [open])

  const onTeam = detail.athletes.filter(a => a.teamId !== null).length
  const noTeam = detail.athletes.length - onTeam
  const canRun = onTeam > 0 && url.trim() !== '' && !save.isPending && !run.isPending

  const calculate = async () => {
    // The table on screen belongs to the read that produced it. A second press that fails
    // would otherwise leave it standing under an alert, as if it were this run's answer.
    setReport(null)
    if (url.trim() !== stored) {
      try { await save.mutateAsync(url.trim()) } catch { return }
    }
    run.mutate(undefined, { onSuccess: r => setReport(r) })
  }

  const counts = report?.matches

  return (
    <>
      <Dialog open={open && sub === null} onOpenChange={o => { if (!o) onOpenChange(false) }}>
        <DialogContent className={dialogSurface(672)}>
          <DialogHeader><DialogTitle>Smoothcomp standings</DialogTitle></DialogHeader>
          <DialogBody className={dialogBody}>
            <div className="grid gap-2">
              {onTeam === 0
                ? <p className="t2 text-gray-10">Paste the roster first. The names must match Smoothcomp's registrations.</p>
                : (
                  <List>
                    {detail.teams.map(team => {
                      const kids = detail.athletes.filter(a => a.teamId === team.id)
                      const marked = kids.filter(a => a.scoring).length
                      return (
                        <ListRow key={team.id} className="flex items-center justify-between gap-3">
                          <TeamPlate color={team.color} name={team.name} size="inline" className="min-w-0" />
                          <span className="shrink-0 t2 text-gray-10">
                            <Fig n={kids.length} /> competitors,{' '}
                            {kids.length <= SCORING_CAP ? 'every competitor scores' : <><Fig n={marked} /> scoring</>}
                          </span>
                        </ListRow>
                      )
                    })}
                  </List>
                )}
              <div className="flex items-center gap-3">
                {noTeam > 0 && <span className="t2 text-attend"><Fig n={noTeam} /> on no team</span>}
                <Button variant="ghost" size="sm" onClick={() => setSub('paste')}>Paste roster</Button>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="smoothcomp-url">Smoothcomp event URL</Label>
              <Input
                id="smoothcomp-url"
                autoComplete="off"
                value={url}
                onChange={e => setUrl(e.target.value)}
                disabled={certified}
                title={certified ? CERTIFIED_REFUSAL : undefined}
                placeholder="https://smoothcomp.com/en/event/29499"
              />
              {save.error && <p className="t2 text-fault">{writeErrorMessage(save.error)}</p>}
            </div>

            {report && counts && (
              <div className="grid gap-4">
                <p className="t4 text-gray-12">{winnerLine(report.teams.filter(t => t.rank === 1).map(t => t.name))}</p>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead numeric>Rank</TableHead>
                      <TableHead>Team</TableHead>
                      <TableHead numeric>Team points</TableHead>
                      <TableHead numeric>Wins</TableHead>
                      <TableHead numeric>Points</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.teams.map(team => (
                      <TableRow key={team.teamId}>
                        <TableCell numeric>{team.rank}</TableCell>
                        <TableCell><TeamPlate color={team.color} name={team.name} size="inline" /></TableCell>
                        <TableCell numeric>{team.teamPoints}</TableCell>
                        <TableCell numeric>{team.wins}</TableCell>
                        <TableCell numeric>{team.points}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {report.teams.filter(team => team.athletes.length > 0).map(team => (
                  <div key={team.teamId} className="grid gap-1.5">
                    <TeamPlate color={team.color} name={team.name} size="inline" />
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Scoring</TableHead>
                          <TableHead numeric>W-L</TableHead>
                          <TableHead numeric>Team points</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {team.athletes.map(a => (
                          <TableRow key={a.athleteId}>
                            <TableCell className="text-gray-12">{a.name}</TableCell>
                            {/* A kid outside the scoring set is a state, not a blank: the
                                attend colour is reserved for what needs a person, so an
                                unmarked row recedes the way a missing roster cell does. */}
                            <TableCell className={a.scoring ? 'text-gray-11' : 'text-gray-10'}>{a.scoring ? 'yes' : '--'}</TableCell>
                            <TableCell numeric>{`${a.wins}-${a.losses}`}</TableCell>
                            <TableCell numeric>{a.teamPoints}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))}

                {report.unmatched.length > 0 && (
                  <Listing title="Not on the roster">
                    {report.unmatched.map(seat => (
                      <p key={`${seat.name} ${seat.club} ${seat.division}`} className="t2 text-gray-11">{seat.name}, {seat.club}, {seat.division}</p>
                    ))}
                  </Listing>
                )}
                {report.sameTeamPairs.length > 0 && (
                  <Listing title="Same team pairs">
                    {report.sameTeamPairs.map(pair => <p key={pair} className="t2 text-gray-11">{pair}</p>)}
                  </Listing>
                )}
                {report.unknownMethods.length > 0 && (
                  <Listing title="Unknown win methods">
                    {report.unknownMethods.map(method => <p key={method} className="t2 text-gray-11">{method}</p>)}
                  </Listing>
                )}
                {report.brackets.failed.length > 0 && (
                  <Listing title="Brackets that failed">
                    <p className="t2 fig text-gray-11">{report.brackets.failed.join(', ')}</p>
                  </Listing>
                )}

                <p className="t2 text-gray-10">
                  <Fig n={counts.read} /> matches read, <Fig n={counts.counted} /> counted, <Fig n={counts.byes} /> byes,{' '}
                  <Fig n={counts.unfinished} /> not finished, <Fig n={counts.undecided} /> undecided, <Fig n={counts.unmatched} /> skipped
                </p>
              </div>
            )}

            {run.error && (
              <Alert>
                <AlertTitle>Standings were not calculated</AlertTitle>
                <AlertDescription>{writeErrorMessage(run.error)}</AlertDescription>
              </Alert>
            )}
          </DialogBody>
          <DialogFooter className={dialogFooter}>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={!canRun} onClick={calculate}>{run.isPending ? 'Reading Smoothcomp' : 'Calculate'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* The roster is pasted in the dialog that already does it, and this one steps out of
          the way while that runs rather than nesting a second surface inside itself. */}
      <PasteRosterDialog detail={detail} open={sub === 'paste'} onOpenChange={o => { if (!o) setSub(null) }} />
    </>
  )
}
