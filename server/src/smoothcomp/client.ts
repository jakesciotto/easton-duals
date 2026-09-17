// Smoothcomp serves its HTML pages behind a Cloudflare challenge, but answers its JSON
// endpoints normally to a plain server request carrying a browser User-Agent. Never add
// challenge-solving code here.
export const USER_AGENT = 'Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0'
const MAX_RETRIES = 4
const RETRYABLE = new Set([429, 500, 502, 503, 504])

export class SmoothcompError extends Error {
  constructor(message: string, readonly status: number | null) { super(message) }
}
export class SmoothcompTimeout extends Error {
  constructor() { super('Smoothcomp took too long. Try again.') }
}

export interface ClientOptions { fetchFn?: typeof fetch; backoffMs?: number; deadlineAt?: number }

const sleep = (ms: number) => ms > 0 ? new Promise<void>(r => setTimeout(r, ms)) : Promise.resolve()

// A retry never sleeps past the deadline: the next attempt throws the timeout on time
// rather than oversleeping into a caller that has already given up.
function wait(ms: number, deadlineAt: number | undefined): number {
  return deadlineAt === undefined ? ms : Math.min(ms, Math.max(0, deadlineAt - Date.now()))
}

export async function fetchJson(url: string, opts: ClientOptions = {}): Promise<unknown> {
  const fetchFn = opts.fetchFn ?? fetch
  const backoffMs = opts.backoffMs ?? 1000
  let last: SmoothcompError | null = null
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (opts.deadlineAt !== undefined && Date.now() >= opts.deadlineAt) throw new SmoothcompTimeout()
    let res: Response
    try {
      res = await fetchFn(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } })
    } catch (err) {
      last = new SmoothcompError(`Smoothcomp request failed for ${url}: ${(err as Error).message}`, null)
      if (attempt === MAX_RETRIES) throw last
      await sleep(wait(backoffMs * 2 ** attempt, opts.deadlineAt))
      continue
    }
    if (res.ok) return res.json()
    last = new SmoothcompError(`Smoothcomp responded ${res.status} for ${url}`, res.status)
    if (!RETRYABLE.has(res.status) || attempt === MAX_RETRIES) throw last
    await sleep(wait(backoffMs * 2 ** attempt, opts.deadlineAt))
  }
  throw last
}

export async function mapConcurrent<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency: number): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = Array.from({ length: items.length })
  let next = 0
  const worker = async () => {
    while (true) {
      const i = next++
      if (i >= items.length) return
      try { results[i] = { status: 'fulfilled', value: await fn(items[i]) } }
      catch (err) { results[i] = { status: 'rejected', reason: err } }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker))
  return results
}
