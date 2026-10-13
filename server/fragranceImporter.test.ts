// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from '../netlify/functions/import-fragrance.mts'
import { FETCH_TIMEOUT_MS, MAX_PAGE_BYTES, importFragrancePage, validateFragranceUrl } from './fragranceImporter'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('fragrance URL validation', () => {
  it.each([
    'http://www.parfumo.com/Perfumes/Brand/Scent',
    'https://www.parfumo.com:8080/Perfumes/Brand/Scent',
    'https://user:password@www.parfumo.com/Perfumes/Brand/Scent',
    'https://www.parfumo.com.attacker.example/Perfumes/Brand/Scent',
    'https://www.parfumo.de/Perfumes/Brand/Scent',
    'https://www.parfumo.com/api/secret',
    'https://www.parfumo.com/Perfumes/Brand',
    'https://www.parfumo.com/Perfumes/Brand/Scent%2f..%2f..%2fapi',
    'https://www.fragrantica.com/board/viewtopic.php?id=123',
    'https://127.0.0.1/Perfumes/Brand/Scent',
  ])('rejects unsupported or unsafe destination %s', (url) => {
    expect(() => validateFragranceUrl(url)).toThrow('Use an HTTPS English fragrance page')
  })

  it('accepts canonical and short fragrance URLs and strips fragments', () => {
    expect(validateFragranceUrl('https://www.fragrantica.com/p/123#reviews')).toMatchObject({ source: 'fragrantica' })
    expect(validateFragranceUrl('https://parfumo.com/Perfumes/Brand/Scent#reviews').url.href).toBe('https://parfumo.com/Perfumes/Brand/Scent')
  })
})

describe('server import trial', () => {
  it('returns a draft identity and uncertainty without fetching related pages', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('<title>Root by Brand » Reviews</title><h1>Root</h1>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await handler(new Request('http://localhost/.netlify/functions/import-fragrance', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://www.parfumo.com/Perfumes/Brand/Root' }),
    }))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toMatchObject({ ok: true, result: { fragrance: { brand: 'Brand', name: 'Root' }, similarities: [], completeness: 'unknown', upstreamStatus: 200 } })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'manual' })
  })

  it('rejects incorrect methods and malformed input before fetching a source', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const get = await handler(new Request('http://localhost/import'))
    const post = await handler(new Request('http://localhost/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }))

    expect(get.status).toBe(405)
    expect(get.headers.get('allow')).toBe('POST')
    expect(post.status).toBe(400)
    expect(await post.json()).toMatchObject({ ok: false, error: { code: 'invalid_request' } })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    [403, 'Forbidden', {}, 'blocked', 502],
    [429, 'Too many requests', {}, 'rate_limited', 429],
    [403, 'Challenge', { 'cf-mitigated': 'challenge' }, 'challenge', 502],
    [200, '<title>Just a moment...</title>', {}, 'challenge', 502],
    [200, '<h1>Unrecognized layout</h1>', {}, 'parse_failed', 422],
  ] as const)('classifies upstream HTTP %s as %s without retrying', async (status, html, headers, code, endpointStatus) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(html, { status, headers }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await handler(new Request('http://localhost/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://www.fragrantica.com/p/123' }),
    }))

    expect(response.status).toBe(endpointStatus)
    expect(await response.json()).toMatchObject({ ok: false, error: { code, upstreamStatus: status } })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('rejects unsafe redirect destinations before making another request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/admin' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(importFragrancePage('https://www.parfumo.com/Perfumes/Brand/Root')).rejects.toMatchObject({ detail: { code: 'unsupported_url', upstreamStatus: 302 } })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('follows a safe relative redirect and reports the resolved source page', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: '/Perfumes/Brand/Canonical' } }))
      .mockResolvedValueOnce(new Response('<title>Root by Brand » Reviews</title>', { headers: { 'Content-Type': 'text/html' } }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await importFragrancePage('https://www.parfumo.com/Perfumes/Brand/Root')

    expect(result.pageUrl).toBe('https://www.parfumo.com/Perfumes/Brand/Canonical')
    expect(result.fragrance.sourceUrls).toEqual({ parfumo: result.pageUrl })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('stops after three redirects', async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Response(null, { status: 302, headers: { Location: '/Perfumes/Brand/Root' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(importFragrancePage('https://www.parfumo.com/Perfumes/Brand/Root')).rejects.toMatchObject({ detail: { code: 'redirect_limit' } })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it.each(['advertised', 'streamed'])('enforces the 5 MB limit for %s response sizes', async (kind) => {
    const page = kind === 'advertised'
      ? new Response('small', { headers: { 'Content-Length': String(MAX_PAGE_BYTES + 1) } })
      : new Response(new Uint8Array(MAX_PAGE_BYTES + 1))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(page))

    await expect(importFragrancePage('https://www.parfumo.com/Perfumes/Brand/Root')).rejects.toMatchObject({ detail: { code: 'too_large' } })
  })

  it('aborts a slow source at the overall request deadline', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    })))
    const assertion = expect(importFragrancePage('https://www.parfumo.com/Perfumes/Brand/Root')).rejects.toMatchObject({ detail: { code: 'timeout' } })

    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS)

    await assertion
  })
})
