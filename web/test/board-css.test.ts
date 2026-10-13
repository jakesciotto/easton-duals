import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'

/**
 * The board's colour and size decisions live in board.css, where a type checker cannot
 * see them and a component test cannot either: jsdom applies no stylesheet. Every
 * grep the brief makes about the board is checked here against the declarations themselves.
 */
// Read from disk rather than imported: vitest stubs every CSS module, `?raw` included,
// and under jsdom `import.meta.url` is an http URL, so the path is resolved from the cwd
// the suite was started in.
function boardCssPath(): string {
  for (const candidate of ['src/routes/board/board.css', 'web/src/routes/board/board.css']) {
    const full = resolvePath(process.cwd(), candidate)
    if (existsSync(full)) return full
  }
  throw new Error(`board.css not found from ${process.cwd()}`)
}

const css = readFileSync(boardCssPath(), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

function ruleFor(selector: string): string | null {
  for (const match of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (match[1].split(',').map(s => s.trim()).includes(selector)) return match[2]
  }
  return null
}

function rule(selector: string): string {
  const body = ruleFor(selector)
  if (body === null) throw new Error(`board.css has no rule for ${selector}`)
  return body
}

function declIn(body: string, prop: string): string {
  const found = new RegExp(`(?:^|[;{\\n])\\s*${prop}\\s*:\\s*([^;]+);`).exec(body)
  if (!found) throw new Error(`no ${prop} in rule`)
  return found[1].replace(/\s+/g, ' ').trim()
}

function decl(selector: string, prop: string): string {
  return declIn(rule(selector), prop)
}

describe('the board greps in 5.1', () => {
  it('carries no hex literal and no console sized type', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/font-size:[^;]*\d(px|vw|vh)\b/)
  })

  it('spends no grey below --gray-10 beyond the two 6.15 and 2.5 name', () => {
    expect(css.match(/var\(--gray-[2-9]\)/g)).toBeNull()
    // The settled row background and the letterbox bars outside the stage, which 3.4
    // states in those words. The plate the third one cut its code out of is retired.
    expect(css.match(/var\(--gray-1\)/g)).toHaveLength(2)
    expect(decl('.b-row-settled', 'background')).toBe('var(--gray-1)')
    expect(decl('.b-frame', 'background')).toBe('var(--gray-1)')
  })
})
