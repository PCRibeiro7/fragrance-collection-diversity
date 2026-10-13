// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseFragrancePage } from './importParsers'

describe('fragrance page extraction', () => {
  it('extracts Fragrantica identities only from the similarity section and removes repeated cards', () => {
    const html = Buffer.from(`
      <meta charset="utf-8">
      <h1 itemprop="name">Philosykos Eau de Parfum <span itemprop="brand">Diptyque</span><small>for women and men</small></h1>
      <h4>This perfume reminds me of</h4>
      <div><a href="/perfume/Diptyque/Philosykos-Eau-de-Toilette-72040.html"><img alt="perfume Philosykos Eau de Toilette Diptyque"></a>
        <a href="/designers/Diptyque.html">Diptyque</a><a href="/perfume/Diptyque/Philosykos-Eau-de-Toilette-72040.html">Philosykos Eau de Toilette</a></div>
      <div><a href="/perfume/Caline/Pure-Vision-123.html"><img alt="perfume Pure Vision Câline"></a><span>Câline</span><a href="/perfume/Caline/Pure-Vision-123.html">Pure Vision</a></div>
      <h4>Collections</h4>
      <div><a href="/designers/Diptyque.html">Diptyque</a><a href="/perfume/Diptyque/Shop-999.html">Shopping recommendation</a></div>
    `)
    const result = parseFragrancePage(html, 'fragrantica', 'https://www.fragrantica.com/perfume/Diptyque/Philosykos-3865.html')

    expect(result?.fragrance).toMatchObject({ brand: 'Diptyque', name: 'Philosykos', variant: 'Eau de Parfum' })
    expect(result?.similarities).toEqual([
      { brand: 'Diptyque', name: 'Philosykos', variant: 'Eau de Toilette' },
      { brand: 'Câline', name: 'Pure Vision' },
    ])
    expect(result?.completeness).toBe('unknown')
    expect(result?.warnings).toContain('The total similarity count could not be verified; the extracted list may be incomplete.')
  })

  it('marks Parfumo lists partial, preserves aliases and concentrations, and excludes other tabs and recommendations', () => {
    const html = Buffer.from(`
      <meta charset="utf-8"><meta property="og:title" content="Philosykos by Diptyque (Eau de Parfum) » Reviews &amp; Perfume Facts">
      <h1>Philosykos</h1><h2>Smells similar</h2><a>All 30</a>
      <div role="tabpanel" id="similar">
        <a href="/Perfumes/Aramis/Tuscany"><img alt="Tuscany per Uomo / Etruscan (Eau de Toilette) by Aramis">Tuscany per Uomo Eau de Toilette</a>
        <a href="/Perfumes/Diptyque/Philosykos"><img alt="Philosykos (Eau de Toilette) by Diptyque">Philosykos Eau de Toilette</a>
        <a href="/Perfumes/Diptyque/Philosykos"><img alt="Philosykos (Eau de Toilette) by Diptyque">Philosykos Eau de Toilette</a>
      </div>
      <div role="tabpanel" id="layer"><a href="/Perfumes/Other/Layer"><img alt="Layer by Other">Layer</a></div>
      <h2>Reviews</h2><a href="/Perfumes/Other/Popular"><img alt="Popular by Other">Popular</a>
    `)
    const result = parseFragrancePage(html, 'parfumo', 'https://www.parfumo.com/Perfumes/Diptyque/Philosykos_Eau_de_Parfum')

    expect(result?.fragrance).toMatchObject({ brand: 'Diptyque', name: 'Philosykos', variant: 'Eau de Parfum' })
    expect(result?.similarities).toEqual([
      { brand: 'Aramis', name: 'Tuscany per Uomo', variant: 'Eau de Toilette' },
      { brand: 'Diptyque', name: 'Philosykos', variant: 'Eau de Toilette' },
    ])
    expect(result).toMatchObject({ advertisedTotal: 30, completeness: 'partial' })
    expect(result?.warnings).toContain('Only 2 of 30 advertised similarities were extracted.')
  })

  it('verifies an advertised complete list while keeping EDT and EDP targets distinct', () => {
    const html = Buffer.from(`
      <h1><span itemprop="name">Root</span><span itemprop="brand">Brand</span><span class="concentration">Eau de Parfum</span></h1>
      <h2>Smells similar</h2><span>All 2</span>
      <a href="/Perfumes/Brand/Target_EDT"><img alt="Target (Eau de Toilette) by Brand">Target Eau de Toilette</a>
      <a href="/Perfumes/Brand/Target_EDP"><img alt="Target (Eau de Parfum) by Brand">Target Eau de Parfum</a>
      <a href="/Perfumes/Brand/Target_EDP"><img alt="Target (Eau de Parfum) by Brand">Target Eau de Parfum</a>
    `)
    const result = parseFragrancePage(html, 'parfumo', 'https://www.parfumo.com/Perfumes/Brand/Root')

    expect(result?.fragrance).toMatchObject({ brand: 'Brand', name: 'Root', variant: 'Eau de Parfum' })
    expect(result?.similarities.map((item) => item.variant)).toEqual(['Eau de Toilette', 'Eau de Parfum'])
    expect(result).toMatchObject({ advertisedTotal: 2, completeness: 'complete', warnings: [] })
  })

  it('uses structured product identity and treats a missing section as unknown rather than empty evidence', () => {
    const html = Buffer.from('<script type="application/ld+json">{"@graph":[{"@type":"Product","brand":{"name":"Creed"},"name":"Aventus Cologne"}]}</script>')
    const result = parseFragrancePage(html, 'fragrantica', 'https://www.fragrantica.com/perfume/Creed/Aventus-Cologne-123.html')

    expect(result?.fragrance).toEqual({ brand: 'Creed', name: 'Aventus Cologne', sourceUrls: { fragrantica: 'https://www.fragrantica.com/perfume/Creed/Aventus-Cologne-123.html' } })
    expect(result).toMatchObject({ similarities: [], completeness: 'unknown' })
    expect(result?.warnings).toContain('The similarity section was not found in the returned HTML; this is not evidence of an empty list.')
    const deferred = parseFragrancePage(Buffer.concat([html, Buffer.from('<lazy-section-new section-id="similar"><div id="similar"><similar-perfumes-new :perfume_id="123" title="This perfume reminds me of"></similar-perfumes-new></div></lazy-section-new>')]), 'fragrantica', 'https://www.fragrantica.com/perfume/Creed/Aventus-Cologne-123.html')
    expect(deferred).toMatchObject({ similarities: [], completeness: 'unknown' })
    expect(deferred?.warnings).toContain('The similarity list is loaded by browser JavaScript and is not present in the returned HTML; this is not evidence of an empty list.')
  })

  it('does not certify an unrecognized similarity card or invent a missing root brand', () => {
    const html = Buffer.from('<title>Root by Brand » Reviews</title><h1>Root</h1><h2>Smells similar</h2><span>All 0</span><a href="/Perfumes/Unknown/Scent">Scent</a>')
    expect(parseFragrancePage(html, 'parfumo', 'https://www.parfumo.com/Perfumes/Brand/Root')).toMatchObject({ completeness: 'unknown' })
    expect(parseFragrancePage(Buffer.from('<h1>Unknown fragrance</h1>'), 'fragrantica', 'https://www.fragrantica.com/p/123')).toBeUndefined()
  })
})
