import { describe, it, expect } from 'vitest'
import { parseSmoothcompUrl } from '../src/smoothcomp/url.js'

describe('parseSmoothcompUrl', () => {
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
})
