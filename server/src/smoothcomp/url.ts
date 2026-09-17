// Smoothcomp runs one host per promoter: smoothcomp.com, naga.smoothcomp.com,
// grapplingindustries.smoothcomp.com. The origin travels with the event id, so every
// later request is built from what the admin pasted here.
const EVENT_PATH = /\/event\/(\d+)/

export type ParsedSmoothcompUrl = { ok: true; origin: string; eventId: string } | { ok: false; message: string }

export function parseSmoothcompUrl(input: string): ParsedSmoothcompUrl {
  const raw = input.trim()
  if (!raw) return { ok: false, message: 'Enter a Smoothcomp event URL.' }
  let url: URL
  try { url = new URL(raw) } catch { return { ok: false, message: `Not a valid URL: ${raw}` } }
  if (url.hostname !== 'smoothcomp.com' && !url.hostname.endsWith('.smoothcomp.com')) {
    return { ok: false, message: `Not a smoothcomp.com URL: ${url.hostname}` }
  }
  const match = EVENT_PATH.exec(url.pathname)
  if (!match) return { ok: false, message: 'No event id in that URL. Expected /event/{id} in the path.' }
  return { ok: true, origin: url.origin, eventId: match[1] }
}
