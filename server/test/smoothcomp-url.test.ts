import { describe, it, expect } from 'vitest'
import { parseSmoothcompUrl } from '../src/smoothcomp/url.js'
import { relatedBrackets } from '../src/smoothcomp/brackets.js'
import { fetchJson, SmoothcompError } from '../src/smoothcomp/client.js'

describe('a Smoothcomp URL parses to one event', () => {
  it('reads the origin and the event id out of a results URL', () => {
    expect(parseSmoothcompUrl('https://smoothcomp.com/en/event/29499/results'))
      .toEqual({ ok: true, origin: 'https://smoothcomp.com', eventId: '29499' })
  })

  it('keeps a promoter subdomain as the origin', () => {
    expect(parseSmoothcompUrl('https://naga.smoothcomp.com/en/event/12/participants'))
      .toEqual({ ok: true, origin: 'https://naga.smoothcomp.com', eventId: '12' })
  })

  it('refuses an empty or blank input', () => {
    expect(parseSmoothcompUrl('')).toEqual({ ok: false, message: 'Enter a Smoothcomp event URL.' })
    expect(parseSmoothcompUrl('   ')).toEqual({ ok: false, message: 'Enter a Smoothcomp event URL.' })
  })

  it('refuses text that is not a URL', () => {
    expect(parseSmoothcompUrl('not a url')).toEqual({ ok: false, message: 'Not a valid URL: not a url' })
  })

  it('refuses a host that is not smoothcomp.com', () => {
    expect(parseSmoothcompUrl('https://example.com/event/1'))
      .toEqual({ ok: false, message: 'Not a smoothcomp.com URL: example.com' })
  })

  it('refuses a URL with no event id in the path', () => {
    expect(parseSmoothcompUrl('https://smoothcomp.com/en/events'))
      .toEqual({ ok: false, message: 'No event id in that URL. Expected /event/{id} in the path.' })
  })

  it('refuses a host that only looks like smoothcomp.com', () => {
    const lookAlikes: [string, string][] = [
      ['https://evilsmoothcomp.com/en/event/1', 'evilsmoothcomp.com'],
      ['https://smoothcomp.com.evil.example/en/event/1', 'smoothcomp.com.evil.example'],
      ['https://smoothcomp.com@evil.example/en/event/1', 'evil.example'],
      ['https://evil.example/smoothcomp.com/en/event/1', 'evil.example'],
      ['https://evil.example/en/event/1?next=https://smoothcomp.com/en/event/1', 'evil.example'],
      ['https://smoothcomp.co/en/event/1', 'smoothcomp.co'],
    ]
    for (const [input, host] of lookAlikes) {
      expect(parseSmoothcompUrl(input)).toEqual({ ok: false, message: `Not a smoothcomp.com URL: ${host}` })
    }
  })

  it('keeps a related bracket link only on the host of the origin', () => {
    const payload = {
      bracketInfo: {
        relatedBrackets: [
          { id: 1, link: 'https://smoothcomp.com/en/event/1/bracket/1' },
          { id: 2, link: 'https://evil.example/en/event/1/bracket/2' },
          { id: 3, link: '//evil.example/en/event/1/bracket/3' },
          { id: 4, link: 'https://naga.smoothcomp.com/en/event/1/bracket/4' },
          { id: 5, link: 'https://smoothcomp.com.evil.example/en/event/1/bracket/5' },
          { id: 6, link: 'https://smoothcomp.com@evil.example/en/event/1/bracket/6' },
        ],
      },
    }
    expect(relatedBrackets(payload, 'https://smoothcomp.com').map(r => r.id)).toEqual([1])
  })

  it('follows a redirect only while it stays on smoothcomp.com', async () => {
    const start = 'https://smoothcomp.com/en/event/1/schedule/brackets.json?search='
    const calls: { url: string; redirect: RequestRedirect | undefined }[] = []
    const fakeFetch = (routes: Record<string, () => Response>) => (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), redirect: init?.redirect })
      return routes[String(url)]?.() ?? new Response('null', { status: 404 })
    }) as typeof fetch
    const to = (location: string) => () => new Response(null, { status: 302, headers: { location } })

    calls.length = 0
    const onHost = fakeFetch({
      [start]: to('https://www.smoothcomp.com/en/event/1/schedule/brackets.json?search='),
      'https://www.smoothcomp.com/en/event/1/schedule/brackets.json?search=': () => new Response('{"brackets":[]}', { status: 200 }),
    })
    expect(await fetchJson(start, { fetchFn: onHost, backoffMs: 0 })).toEqual({ brackets: [] })
    expect(calls.map(c => c.redirect)).toEqual(['manual', 'manual'])

    for (const off of ['https://evil.example/brackets.json', '//evil.example/x', 'https://smoothcomp.com.evil.example/x']) {
      calls.length = 0
      const offHost = fakeFetch({ [start]: to(off) })
      await expect(fetchJson(start, { fetchFn: offHost, backoffMs: 0 })).rejects.toBeInstanceOf(SmoothcompError)
      expect(calls.map(c => c.url)).toEqual([start])
      expect(calls[0].redirect).toBe('manual')
    }
  })
})
