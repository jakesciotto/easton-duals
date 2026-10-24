const EVENT_PATH = /\/event\/(\d+)/

export type ParsedSmoothcompUrl = { ok: true; origin: string; eventId: string } | { ok: false; message: string }

export function isSmoothcompHost(hostname: string): boolean {
  return hostname === 'smoothcomp.com' || hostname.endsWith('.smoothcomp.com')
}

export function parseSmoothcompUrl(input: string): ParsedSmoothcompUrl {
  const raw = input.trim()
  if (!raw) return { ok: false, message: 'Enter a Smoothcomp event URL.' }
  let url: URL
  try { url = new URL(raw) } catch { return { ok: false, message: `Not a valid URL: ${raw}` } }
  if (!isSmoothcompHost(url.hostname)) {
    return { ok: false, message: `Not a smoothcomp.com URL: ${url.hostname}` }
  }
  const match = EVENT_PATH.exec(url.pathname)
  if (!match) return { ok: false, message: 'No event id in that URL. Expected /event/{id} in the path.' }
  return { ok: true, origin: url.origin, eventId: match[1] }
}
