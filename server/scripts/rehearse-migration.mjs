import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { sql } from 'drizzle-orm'
import { createClient } from '@libsql/client'
import { createDb, dbUrlFromEnv, initDb, migrateDb } from '../dist/db/client.js'
import { loadDotEnv } from '../dist/lib/env.js'

// Rehearses the newest migration on a copy of a live database before it runs for real.
// The source is only ever read. Its rows land in a fresh file database migrated to the
// journal entry named by --at, the rest of the journal runs there, and the counts and the
// links between tables are compared. Nothing about a person is printed, only counts.
//
//   node server/scripts/rehearse-migration.mjs --at 0011_multi_team [--source <url>]
//
// The source defaults to the .env target, which for this repo is production.

const here = path.dirname(fileURLToPath(import.meta.url))
loadDotEnv(path.resolve(here, '../../.env'))

const args = process.argv.slice(2)
const flag = name => {
  const i = args.indexOf(name)
  return i === -1 ? null : args[i + 1] ?? null
}
const at = flag('--at')
if (!at) {
  console.error('usage: rehearse-migration.mjs --at <migration tag to copy into> [--source <url>]')
  process.exit(2)
}
const sourceOpts = flag('--source') ? { url: flag('--source') } : dbUrlFromEnv(process.env)
const sourceName = sourceOpts.url.startsWith('file:') ? `file (${sourceOpts.url})` : new URL(sourceOpts.url).host
console.log(`rehearsal reading ${sourceName}`)

// Parents before children, so every foreign key resolves while the copy is written.
const TABLES = ['events', 'teams', 'athletes', 'rulesets', 'mats', 'matches', 'match_events', 'proposals']

const drizzleDir = path.resolve(here, '../drizzle')
const journal = JSON.parse(fs.readFileSync(path.join(drizzleDir, 'meta/_journal.json'), 'utf8'))
const stop = journal.entries.findIndex(e => e.tag === at)
if (stop === -1) {
  console.error(`no migration tagged ${at}`)
  process.exit(2)
}
if (stop === journal.entries.length - 1) {
  console.error(`${at} is the newest migration; nothing to rehearse after it`)
  process.exit(2)
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'duels-rehearse-'))
const folder = path.join(work, 'drizzle')
fs.cpSync(drizzleDir, folder, { recursive: true })
const cutJournal = entries => fs.writeFileSync(path.join(folder, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }))
cutJournal(journal.entries.slice(0, stop + 1))

const targetUrl = `file:${path.join(work, `${randomUUID()}.db`)}`
const target = createClient({ url: targetUrl })
const targetDb = createDb({ url: targetUrl })
await initDb(targetDb, { url: targetUrl })
await migrateDb(targetDb, folder)
await target.execute('pragma foreign_keys = on')

const source = createDb(sourceOpts)
const before = {}
for (const table of TABLES) {
  const rows = await source.all(sql.raw(`select * from ${table}`))
  const columns = (await target.execute(`pragma table_info(${table})`)).rows.map(r => r.name)
  before[table] = rows.length
  for (const row of rows) {
    const cols = columns.filter(c => c in row)
    await target.execute({
      sql: `insert into ${table} (${cols.join(', ')}) values (${cols.map(() => '?').join(', ')})`,
      args: cols.map(c => row[c] ?? null),
    })
  }
  console.log(`copied ${table}: ${rows.length}`)
}

const sideOf = async client => Object.fromEntries((await client.execute('select id, event_id, athlete_a_id, athlete_b_id, order_index from matches order by id')).rows
  .map(r => [r.id, [r.event_id, r.athlete_a_id, r.athlete_b_id, r.order_index]]))
const sidesBefore = await sideOf(target)
const eventsBefore = (await target.execute('select match_id, count(*) as n from match_events group by match_id')).rows

cutJournal(journal.entries)
const started = Date.now()
await migrateDb(targetDb, folder)
console.log(`migrated ${journal.entries.length - stop - 1} migration(s) after ${at} in ${Date.now() - started} ms`)

const failures = []
for (const table of TABLES) {
  const n = Number((await target.execute(`select count(*) as n from ${table}`)).rows[0].n)
  if (n !== before[table]) failures.push(`${table}: ${before[table]} rows before, ${n} after`)
}
const sidesAfter = await sideOf(target)
for (const [id, sides] of Object.entries(sidesBefore)) {
  if (JSON.stringify(sidesAfter[id]) !== JSON.stringify(sides)) failures.push(`match ${id} changed its event, sides or order`)
}
const eventsAfter = Object.fromEntries((await target.execute('select match_id, count(*) as n from match_events group by match_id')).rows.map(r => [r.match_id, Number(r.n)]))
for (const r of eventsBefore) {
  if (eventsAfter[r.match_id] !== Number(r.n)) failures.push(`match ${r.match_id} lost scoring events`)
}
const orphans = (await target.execute('pragma foreign_key_check')).rows
if (orphans.length > 0) failures.push(`${orphans.length} foreign key violation(s)`)
const numbering = (await target.execute(
  'select event_id, count(*) as n, min(number) as lo, max(number) as hi, count(distinct number) as distinct_n from matches group by event_id',
)).rows
for (const r of numbering) {
  if (Number(r.lo) !== 1 || Number(r.hi) !== Number(r.n) || Number(r.distinct_n) !== Number(r.n)) failures.push(`event ${r.event_id}: numbers are not 1 to ${r.n}`)
}

fs.rmSync(work, { recursive: true, force: true })
if (failures.length > 0) {
  console.error('REHEARSAL FAILED')
  for (const f of failures) console.error(`  ${f}`)
  process.exit(1)
}
console.log(`REHEARSAL PASSED: ${Object.values(before).reduce((a, b) => a + b, 0)} rows survived, foreign keys clean, numbers contiguous per event`)
