#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

const ROOT = new URL('..', import.meta.url).pathname
const WEB_SRC = join(ROOT, 'web/src')

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.(tsx?|css)$/.test(full)) out.push(full)
  }
  return out
}

const isBoard = file => file.includes('/routes/board/') || file.endsWith('routes/BoardPage.tsx')

const GRAY_1_ALLOWED = /\.(b-frame|b-row-settled|b-code)\b/

const RULES = [
  {
    name: 'no hex literal in the app',
    why: 'Every colour comes from a token, so a change lands everywhere at once.',
    skip: file => file.endsWith('web/src/index.css') || file.endsWith('components/QrCode.tsx'),
    pattern: /#[0-9a-fA-F]{3,8}\b/,
  },
  {
    name: 'no cqh outside the board',
    why: 'Container query units are the board dialect. The console is sized in pixels.',
    skip: isBoard,
    pattern: /[0-9]cqh/,
  },
  {
    name: 'no console type scale or fixed size on the board',
    why: 'The board is sized in cqh so it scales to any panel. A px, vw or vh size does not.',
    skip: file => !isBoard(file),
    pattern: /\b(text-(xs|sm|base|lg|xl|[2-9]xl)|font-(bold|extrabold|black))\b|font-size:\s*[0-9.]+(px|vw|vh)|(text|w|h)-\[[0-9.]+(px|vw|vh)\]/,
  },
  {
    name: 'no grey below --gray-10 as board text, and no console surface token',
    why: 'At 25 feet a hairline is 1.18:1 and a card fill reads as a smudge. 6.15 deletes both.',
    skip: file => !isBoard(file),
    pattern: /var\(--gray-[2-9]\)|\b(text|bg|border)-gray-[1-9]\b|\bborder-border\b|\bbg-card\b/,
  },
  {
    name: 'no route pins its own poll interval',
    why: 'Every route under the event body reads one shared stream, which polls on the derived ramp. A pinned interval is ignored by the stream and then used as a staleness threshold, so the screen calls data fresh after the board has stopped trusting it. The board and the scorer sit outside that provider and own their own poll, so the rule does not reach them.',
    skip: file => !file.includes('/routes/event/') && !file.endsWith('routes/EventPage.tsx'),
    pattern: /useSnapshot\([^)]*,[^)]*\)/,
  },
  {
    name: 'no --gray-1 on the board outside the three places 6.15 names',
    why: 'The letterbox, the settled row and the plate code. Anywhere else it is a card fill.',
    skip: file => !isBoard(file),
    pattern: /var\(--gray-1\)/,
    allow: (_line, selector) => GRAY_1_ALLOWED.test(selector),
  },
]

const files = walk(WEB_SRC)
let failed = 0

for (const rule of RULES) {
  const hits = []
  for (const file of files) {
    if (rule.skip(file)) continue
    const lines = readFileSync(file, 'utf8').split('\n')
    let selector = ''
    lines.forEach((line, i) => {
      if (line.includes('{')) selector = line.slice(0, line.indexOf('{')).trim()
      if (!rule.pattern.test(line)) return
      if (rule.allow && rule.allow(line, selector)) return
      hits.push(`${relative(ROOT, file)}:${i + 1}: ${line.trim()}`)
    })
  }
  if (hits.length) {
    failed += hits.length
    console.error(`\ndesign-lint: ${rule.name} (${hits.length})`)
    console.error(`  ${rule.why}`)
    for (const hit of hits) console.error(`  ${hit}`)
  }
}

const CODE_ROOTS = ['server/src', 'server/scripts', 'server/test', 'server/drizzle', 'web/src', 'web/test', 'scripts']
const CODE_FILES = /\.(tsx?|mjs|css|sql)$/
const PRAGMA = /^(\/\/\/ <reference|\/\/ @ts-|\/\/ eslint-|\/\* eslint-)/

function walkCode(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (entry === 'node_modules' || entry === 'meta') continue
    if (statSync(full).isDirectory()) out.push(...walkCode(full))
    else if (CODE_FILES.test(full)) out.push(full)
  }
  return out
}

function commentsIn(file, text) {
  const hits = []
  const line = pos => text.slice(0, pos).split('\n').length
  if (file.endsWith('.sql')) {
    text.split('\n').forEach((l, i) => { if (/^\s*--/.test(l) && !l.includes('statement-breakpoint')) hits.push(i + 1) })
    return hits
  }
  if (file.endsWith('.css')) {
    for (const m of text.matchAll(/\/\*[\s\S]*?\*\//g)) hits.push(line(m.index))
    return hits
  }
  const kind = file.endsWith('.tsx') ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, kind, text)
  const K = ts.SyntaxKind
  const regexCanFollow = t => t === undefined || !(t === K.Identifier || t === K.CloseParenToken || t === K.CloseBracketToken
    || t === K.CloseBraceToken || t === K.NumericLiteral || t === K.StringLiteral || t === K.NoSubstitutionTemplateLiteral
    || t === K.TemplateTail || t === K.ThisKeyword || t === K.TrueKeyword || t === K.FalseKeyword || t === K.NullKeyword)
  let templates = 0
  let previous
  let token = scanner.scan()
  while (token !== K.EndOfFileToken) {
    if (token === K.TemplateHead) templates++
    else if (token === K.CloseBraceToken && templates > 0) {
      token = scanner.reScanTemplateToken(false)
      if (token === K.TemplateTail) templates--
    } else if ((token === K.SlashToken || token === K.SlashEqualsToken) && regexCanFollow(previous)) {
      token = scanner.reScanSlashToken()
    }
    if (token === K.SingleLineCommentTrivia || token === K.MultiLineCommentTrivia) {
      const body = scanner.getTokenText()
      if (!PRAGMA.test(body)) hits.push(line(scanner.getTokenStart()))
    } else if (token !== K.WhitespaceTrivia && token !== K.NewLineTrivia) previous = token
    token = scanner.scan()
  }
  return hits
}

const codeFiles = CODE_ROOTS.flatMap(root => walkCode(join(ROOT, root)))
const commentHits = []
for (const file of codeFiles) {
  const text = readFileSync(file, 'utf8')
  if (text.startsWith('#!')) {
    const nl = text.indexOf('\n')
    for (const l of commentsIn(file, ' '.repeat(nl) + text.slice(nl))) commentHits.push(`${relative(ROOT, file)}:${l}`)
    continue
  }
  for (const l of commentsIn(file, text)) commentHits.push(`${relative(ROOT, file)}:${l}`)
}
if (commentHits.length) {
  failed += commentHits.length
  console.error(`\ndesign-lint: no comments in code (${commentHits.length})`)
  console.error('  A fact worth keeping lives in the component spec, CLAUDE.md or the README, never beside the code.')
  for (const hit of commentHits.slice(0, 40)) console.error(`  ${hit}`)
  if (commentHits.length > 40) console.error(`  and ${commentHits.length - 40} more`)
}

if (failed) {
  console.error(`\ndesign-lint failed with ${failed} violation${failed === 1 ? '' : 's'}.`)
  process.exit(1)
}
console.log(`design-lint passed: ${RULES.length + 1} rules over ${files.length} web files and ${codeFiles.length} code files.`)
