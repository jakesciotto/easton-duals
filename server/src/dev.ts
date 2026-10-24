import fs from 'node:fs'
import path from 'node:path'
import { applyDevDefaults } from './lib/env.js'

const local = applyDevDefaults(process.env)
if (local === null) {
  console.log('dev: remote database from .env (DUALS_DEV_REMOTE=1)')
} else {
  fs.mkdirSync(path.dirname(local), { recursive: true })
  console.log(`dev: local database ${local} (set DUALS_DEV_REMOTE=1 for the remote target)`)
}

await import('./index.js')
