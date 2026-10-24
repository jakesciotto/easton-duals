export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

const MIN_TOKEN = 3

export function nameTokens(name: string): string[] {
  const out: string[] = []
  const add = (token: string, min: number) => {
    if (token.length >= min && !out.includes(token)) out.push(token)
  }
  const parts = name.split(/[^\p{L}]+/u)
  for (const part of parts) {
    add(part.toLowerCase(), MIN_TOKEN)
    add(normalize(part), MIN_TOKEN)
  }
  if (out.length > 0) return out
  for (const part of parts) {
    add(part.toLowerCase(), 1)
    add(normalize(part), 1)
  }
  return out
}

function bigrams(s: string): string[] {
  const out: string[] = []
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2))
  return out
}

export function dice(a: string, b: string): number {
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return 1
  if (na.length < 2 || nb.length < 2) return 0

  const bgA = bigrams(na)
  const bgB = bigrams(nb)
  const pool = [...bgB]
  let matches = 0
  for (const bg of bgA) {
    const i = pool.indexOf(bg)
    if (i === -1) continue
    matches++
    pool.splice(i, 1)
  }
  return (2 * matches) / (bgA.length + bgB.length)
}

export const NICKNAMES: string[][] = [
  ['alex', 'alexander', 'alejandro', 'alexandra'],
  ['ben', 'benjamin'],
  ['sam', 'samuel', 'samantha'],
  ['max', 'maximilian', 'maxwell'],
  ['nick', 'nicholas'],
  ['liz', 'elizabeth'],
  ['kate', 'katherine', 'katie'],
  ['mike', 'michael'],
  ['matt', 'matthew'],
  ['nate', 'nathan', 'nathaniel'],
  ['tony', 'anthony'],
  ['will', 'william'],
  ['josh', 'joshua'],
  ['jake', 'jacob'],
  ['zach', 'zachary'],
  ['ellie', 'eleanor'],
  ['abby', 'abigail'],
  ['gabe', 'gabriel'],
  ['izzy', 'isabella', 'isabel'],
  ['eli', 'elijah'],
  ['leo', 'leonardo'],
  ['danny', 'daniel'],
  ['chris', 'christopher'],
  ['andy', 'andrew'],
  ['joe', 'joseph'],
  ['tom', 'thomas'],
  ['jack', 'john'],
  ['charlie', 'charles'],
  ['ali', 'alison'],
  ['mia', 'amelia'],
]

const CANONICAL = new Map(NICKNAMES.flatMap(group => group.map(name => [name, group[0]] as const)))

export function canonicalFirst(first: string): string {
  const token = normalize(first.trim().split(/[\s-]+/)[0] ?? '')
  return CANONICAL.get(token) ?? token
}

interface Named { firstName: string; lastName: string }

export function exactName(a: Named, b: Named): boolean {
  return normalize(a.lastName) === normalize(b.lastName) && canonicalFirst(a.firstName) === canonicalFirst(b.firstName)
}

export function nameScore(a: Named, b: Named): number {
  const base = dice(`${a.firstName} ${a.lastName}`, `${b.firstName} ${b.lastName}`)
  const bonus = normalize(a.lastName) === normalize(b.lastName) ? 0.1 : 0
  return Math.min(1, base + bonus)
}

export const SUGGEST_FLOOR = 0.6
export const SUGGEST_MARGIN = 0.05
