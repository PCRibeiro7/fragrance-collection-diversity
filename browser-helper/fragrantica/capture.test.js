import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { captureLoadedFragrancePage } from './capture.js'
import handler from '../../netlify/functions/import-fragrance-capture.mts'

beforeEach(() => {
  vi.stubGlobal('location', new URL('https://www.fragrantica.com/perfume/Diptyque/Philosykos-3865.html#similar'))
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('fragrance browser capture', () => {
  it('requires loaded cards and refuses unrelated pages without requesting the source', () => {
    document.body.innerHTML = '<h1>Philosykos</h1><div id="similar"><similar-perfumes-new title="This perfume reminds me of"></similar-perfumes-new></div>'
    expect(captureLoadedFragrancePage()).toMatchObject({ ok: false, message: expect.stringContaining('Scroll') })
    vi.stubGlobal('location', new URL('https://www.parfumo.com/Perfumes/Diptyque/Philosykos'))
    document.body.innerHTML = '<h1>Philosykos</h1><h2>Smells similar</h2><div role="tabpanel" id="layer"><a href="/Perfumes/Other/Layer">Layer</a></div>'
    expect(captureLoadedFragrancePage()).toMatchObject({ ok: false, message: expect.stringContaining('select Similar') })
    for (const pageUrl of ['https://www.parfumo.de/Perfumes/Diptyque/Philosykos', 'https://www.parfumo.com/Brands/Diptyque', 'https://user:secret@www.parfumo.com/Perfumes/Diptyque/Philosykos', 'https://www.parfumo.com:8080/Perfumes/Diptyque/Philosykos']) {
      vi.stubGlobal('location', new URL(pageUrl))
      expect(captureLoadedFragrancePage()).toMatchObject({ ok: false, message: expect.stringContaining('English Fragrantica or Parfumo') })
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('captures only the loaded section, parses repeated plain-brand cards, and preserves concentrations with unverified completeness', async () => {
    document.body.innerHTML = `
      <h1>Philosykos Eau de Parfum <span itemprop="brand">Diptyque</span></h1>
      <script type="application/ld+json">{"@type":"Product","name":"Philosykos Eau de Parfum","brand":{"name":"Diptyque"},"review":{"text":"PRIVATE REVIEW"}}</script>
      <div id="similar" data-token="PRIVATE TOKEN"><h2>This perfume reminds me of</h2><span>All 10</span>
        <div><a href="/perfume/Brand/Target-123.html"><img alt="perfume Target Eau de Toilette Brand"></a><span>Brand</span><a href="/perfume/Brand/Target-123.html">Target Eau de Toilette</a></div>
        <div><a href="/perfume/Brand/Target-123.html"><img alt="perfume Target Eau de Toilette Brand"></a><span>Brand</span><a href="/perfume/Brand/Target-123.html">Target Eau de Toilette</a></div>
        <div><a href="/perfume/Brand/Target-456.html"><img alt="perfume Target Eau de Parfum Brand"></a><span>Brand</span><a href="/perfume/Brand/Target-456.html">Target Eau de Parfum</a></div>
        <script>window.unwanted = true</script>
        <div hidden><a href="/perfume/Brand/Hidden-987.html">Hidden</a></div>
      </div>
      <h2>Shopping recommendations</h2><a href="/perfume/Shop/Other-999.html">Unrelated shop item</a>
    `
    const before = document.body.innerHTML
    const { ok, capture } = captureLoadedFragrancePage()

    expect(ok).toBe(true)
    expect(capture).toMatchObject({ format: 'scent-map-fragrance-capture', source: 'fragrantica' })
    expect(capture.pageUrl).not.toContain('#similar')
    expect(capture.identityHtml).not.toContain('PRIVATE REVIEW')
    expect(capture.similarityHtml).not.toContain('unwanted')
    expect(capture.similarityHtml).not.toContain('Unrelated shop item')
    expect(capture.similarityHtml).not.toContain('Hidden')
    expect(capture.similarityHtml).not.toContain('PRIVATE TOKEN')
    expect(document.body.innerHTML).toBe(before)
    const response = await handler(new Request('http://localhost/.netlify/functions/import-fragrance-capture', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(capture),
    }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.result).toMatchObject({
      captureMethod: 'browser', fragrance: { brand: 'Diptyque', name: 'Philosykos', variant: 'Eau de Parfum' },
      similarities: [{ brand: 'Brand', name: 'Target', variant: 'Eau de Toilette' }, { brand: 'Brand', name: 'Target', variant: 'Eau de Parfum' }],
      advertisedTotal: 10, completeness: 'partial',
    })
    expect(body.result).not.toHaveProperty('upstreamStatus')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('captures Parfumo Similar cards with title identity, aliases, and counts while excluding other tabs and sections', async () => {
    vi.stubGlobal('location', new URL('https://www.parfumo.com/Perfumes/Diptyque/Philosykos_Eau_de_Parfum'))
    document.body.innerHTML = `
      <meta property="og:title" content="Philosykos by Diptyque (Eau de Parfum) » Reviews &amp; Perfume Facts">
      <h1>Philosykos</h1>
      <a href="/Perfumes/Other/Shop"><img alt="Shopping by Other">Shopping</a>
      <div><h2>Smells similar</h2>
        <a role="tab" href="#pane-a">Similar</a><a role="tab" aria-controls="pane-b"><img alt="Layer"></a><a role="tab" href="#pane-c">Associations</a>
        <span>All 30</span><div role="tabpanel" id="pane-a">
          <a href="/Perfumes/Aramis/Tuscany"><img alt="Tuscany per Uomo / Etruscan (Eau de Toilette) by Aramis">Tuscany per Uomo Eau de Toilette</a>
          <a href="/Perfumes/Aramis/Tuscany"><img alt="Tuscany per Uomo / Etruscan (Eau de Toilette) by Aramis">Tuscany per Uomo Eau de Toilette</a>
          <div onclick="window.location.href='https://parfumo.com/Perfumes/Diptyque/Philosykos'" data-token="PRIVATE TOKEN"><a href="https://media.parfumo.com/image.jpg"><img src="https://media.parfumo.com/image.jpg" alt="Philosykos (Eau de Toilette) by Diptyque"></a><span>Philosykos Eau de Toilette</span></div>
          <div style="display: none"><a href="/Perfumes/Other/Hidden"><img alt="Hidden by Other">Hidden</a></div>
        </div>
        <div role="tabpanel" id="pane-b"><a href="/Perfumes/Other/Layer"><img alt="Layer by Other">Layer suggestion</a></div>
        <div role="tabpanel" id="pane-c"><a href="/Perfumes/Other/Association"><img alt="Association by Other">Association suggestion</a></div>
        <script>PRIVATE SCRIPT</script>
      </div>
      <div><h2>Reviews</h2>PRIVATE REVIEW<a href="/Perfumes/Other/Popular"><img alt="Popular by Other">Popular</a></div>
    `
    const before = document.body.innerHTML
    const { ok, capture } = captureLoadedFragrancePage()

    expect(ok).toBe(true)
    expect(capture).toMatchObject({ format: 'scent-map-fragrance-capture', source: 'parfumo', pageUrl: location.href })
    for (const unwanted of ['Shopping', 'Layer suggestion', 'Association suggestion', 'Hidden', 'PRIVATE SCRIPT', 'PRIVATE REVIEW', 'PRIVATE TOKEN', 'Popular', 'onclick=', 'src=']) {
      expect(capture.similarityHtml).not.toContain(unwanted)
    }
    expect(document.body.innerHTML).toBe(before)
    const response = await handler(new Request('http://localhost/capture', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(capture),
    }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.result).toMatchObject({
      source: 'parfumo', captureMethod: 'browser', fragrance: { brand: 'Diptyque', name: 'Philosykos', variant: 'Eau de Parfum' },
      similarities: [{ brand: 'Aramis', name: 'Tuscany per Uomo', variant: 'Eau de Toilette' }, { brand: 'Diptyque', name: 'Philosykos', variant: 'Eau de Toilette' }],
      advertisedTotal: 30, completeness: 'partial',
    })
    expect(body.result).not.toHaveProperty('upstreamStatus')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects malformed files, unsafe URLs, and captures with no extracted cards', async () => {
    const capture = { format: 'scent-map-fragrantica-capture', version: 1, pageUrl: location.href, identityHtml: '<h1>Philosykos<span itemprop="brand">Diptyque</span></h1>', similarityHtml: '<div id="similar"></div>' }
    for (const [body, status, code] of [
      [{ format: 'backup' }, 400, 'invalid_request'],
      [{ ...capture, pageUrl: 'https://127.0.0.1/private' }, 400, 'unsupported_url'],
      [{ ...capture, pageUrl: 'https://www.parfumo.com/Perfumes/Diptyque/Philosykos' }, 400, 'invalid_request'],
      [{ ...capture, format: 'scent-map-fragrance-capture', source: 'parfumo' }, 400, 'invalid_request'],
      [capture, 422, 'parse_failed'],
    ]) {
      const response = await handler(new Request('http://localhost/capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
      expect(response.status).toBe(status)
      expect(await response.json()).toMatchObject({ ok: false, error: { code } })
    }
    const response = await handler(new Request('http://localhost/capture', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...capture, similarityHtml: '<div id="similar"><div><a href="/designers/Diptyque.html">Diptyque</a><a href="/perfume/Diptyque/Target-123.html">Target</a></div></div>' }),
    }))
    expect(response.status).toBe(200)
    expect((await response.json()).result).toMatchObject({ source: 'fragrantica', captureMethod: 'browser', completeness: 'unknown' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('limits capture uploads to 2 MB', async () => {
    const response = await handler(new Request('http://localhost/capture', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(2 * 1024 * 1024 + 1),
    }))
    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ ok: false, error: { code: 'too_large' } })
    expect(fetch).not.toHaveBeenCalled()
  })
})
