import { fetchJson, mapConcurrent, SmoothcompTimeout } from './client.js'
import { parseBracket, type SmoothcompMatch } from './parse.js'

const MAX_RELATED = 10

export function bracketListUrl(origin: string, eventId: string): string {
  return `${origin}/en/event/${eventId}/schedule/brackets.json?search=`
}
export function renderDataUrl(origin: string, eventId: string, bracketId: number): string {
  return `${origin}/en/event/${eventId}/bracket/${bracketId}/getRenderData`
}

export function extractBracketIds(json: unknown): number[] {
  const list = (json as { brackets?: unknown })?.brackets
  const ids = new Set<number>()
  for (const b of Array.isArray(list) ? list : []) {
    const id = (b as { bracket_id?: unknown })?.bracket_id
    if (typeof id === 'number') ids.add(id)
  }
  return [...ids]
}

// A related bracket link comes from the payload, not the admin, so it gets the same host
// check the pasted URL got.
export function relatedBrackets(json: unknown, origin: string): { id: number; link: string }[] {
  const related = (json as { bracketInfo?: { relatedBrackets?: unknown } })?.bracketInfo?.relatedBrackets
  if (!Array.isArray(related)) return []
  const host = new URL(origin).hostname
  return related.slice(0, MAX_RELATED).flatMap(r => {
    const { id, link } = (r ?? {}) as { id?: unknown; link?: unknown }
    if (typeof id !== 'number' || typeof link !== 'string') return []
    try { return new URL(link, origin).hostname === host ? [{ id, link }] : [] } catch { return [] }
  })
}

export interface PullOptions { fetchFn?: typeof fetch; concurrency: number; deadlineAt: number; backoffMs?: number }

// One call for the bracket list, then every bracket at the given concurrency. A related
// bracket outside the list is fetched in a second pass, same host only, at most ten per
// bracket. Matches are collected by id, so a match reached twice counts once.
export async function fetchEventMatches(target: { origin: string; eventId: string }, opts: PullOptions): Promise<{ matches: SmoothcompMatch[]; brackets: { read: number; failed: number[] } }> {
  const client = { fetchFn: opts.fetchFn, backoffMs: opts.backoffMs, deadlineAt: opts.deadlineAt }
  const ids = extractBracketIds(await fetchJson(bracketListUrl(target.origin, target.eventId), client))
  const known = new Set(ids)
  const byId = new Map<number, SmoothcompMatch>()
  const failed: number[] = []
  let read = 0
  const pull = async (list: { id: number; url: string }[]): Promise<{ id: number; link: string }[]> => {
    const settled = await mapConcurrent(list, async b => {
      const json = await fetchJson(b.url, client)
      return { json, related: relatedBrackets(json, target.origin), matches: parseBracket(json, b.id) }
    }, opts.concurrency)
    const extra: { id: number; link: string }[] = []
    settled.forEach((r, i) => {
      if (r.status === 'rejected') {
        if (r.reason instanceof SmoothcompTimeout) throw r.reason
        failed.push(list[i].id)
        return
      }
      read++
      for (const m of r.value.matches) byId.set(m.id, m)
      for (const rel of r.value.related) if (!known.has(rel.id)) { known.add(rel.id); extra.push(rel) }
    })
    return extra
  }
  const extra = await pull(ids.map(id => ({ id, url: renderDataUrl(target.origin, target.eventId, id) })))
  if (extra.length > 0) await pull(extra.map(r => ({ id: r.id, url: `${r.link}/getRenderData` })))
  return { matches: [...byId.values()], brackets: { read, failed } }
}
