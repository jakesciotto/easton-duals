import { KIDS_BELTS, type KidsBelt } from '../shared/types.js'
import type { WlNameFilter } from './types.js'

export function kidsQuery(categoryTitle?: string): string {
  const category = categoryTitle
    ? `text_rank_category = '${categoryTitle.replace(/'/g, "''")}'`
    : "text_rank_category like '%Kids%' and text_rank_category like '%IBJJF%'"
  return "select uid, text_rank, text_rank_category, `o_client.text_first`, `o_client.text_last`, `o_rank_promotion_date.dtl_promotion_date` " +
    `where text_rank <> 'No belt' and ${category}`
}

const TERMS_PER_QUERY = 60

const quote = (s: string): string => s.replace(/'/g, "''")

export function searchQuery(filter: WlNameFilter, categoryTitle?: string): string[] {
  const terms = [
    ...filter.uids.map(value => ({ column: null, value })),
    ...filter.lastTokens.map(value => ({ column: 'o_client.text_last', value })),
    ...filter.firstTokens.map(value => ({ column: 'o_client.text_first', value })),
  ]
  const queries: string[] = []
  for (let from = 0; from < terms.length; from += TERMS_PER_QUERY) {
    const batch = terms.slice(from, from + TERMS_PER_QUERY)
    const uids = batch.filter(t => t.column === null).map(t => `'${quote(t.value)}'`)
    const clauses = uids.length > 0 ? [`uid in (${uids.join(',')})`] : []
    for (const t of batch) {
      if (t.column !== null) clauses.push(`lower(\`${t.column}\`) like '%${quote(t.value.toLowerCase())}%'`)
    }
    queries.push(`${kidsQuery(categoryTitle)} and (${clauses.join(' or ')})`)
  }
  return queries
}

export function normalizeTitle(s: unknown): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim()
}

const COMPOUND: Record<string, KidsBelt> = {
  'gray/white': 'grey-white', 'grey/white': 'grey-white',
  'gray/black': 'grey-black', 'grey/black': 'grey-black',
  'yellow/white': 'yellow-white', 'yellow/black': 'yellow-black',
  'orange/white': 'orange-white', 'orange/black': 'orange-black',
  'green/white': 'green-white', 'green/black': 'green-black',
}
const SIMPLE: Record<string, KidsBelt> = {
  white: 'white', gray: 'grey', grey: 'grey', yellow: 'yellow', orange: 'orange', green: 'green',
}

export function deriveKidsBelt(rankTitle: string): KidsBelt | null {
  const head = String(rankTitle ?? '').split('-')[0].toLowerCase().replace(/\bbelts?\b/g, '').replace(/\s+/g, ' ').trim()
  const belt = COMPOUND[head] ?? SIMPLE[head] ?? null
  return belt && (KIDS_BELTS as readonly string[]).includes(belt) ? belt : null
}
