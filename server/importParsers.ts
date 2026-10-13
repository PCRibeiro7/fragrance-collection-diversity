import { loadBuffer, type CheerioAPI } from 'cheerio'
import type { AnyNode, Element } from 'domhandler'
import { identityKey } from '../src/domain/identity'
import type { FragrancePageImport } from '../src/domain/fragranceImport'
import type { FragranceInput, SimilaritySource } from '../src/domain/types'

const clean = (value: string | undefined) => (value ?? '').replace(/\s+/gu, ' ').trim()
const fullConcentration = 'Eau de Parfum|Eau de Toilette|Eau de Cologne|Extrait de Parfum|Parfum Solide|Perfume Oil'
const bracketConcentration = `${fullConcentration}|Extrait|Parfum|Cologne|EDP|EDT|EDC`
const document = (html: Buffer, encoding?: string) => loadBuffer(html, {
  encoding: { defaultEncoding: 'utf-8', ...(encoding ? { transportLayerEncodingLabel: encoding } : {}) },
})

function identity(brand: string, name: string, explicitVariant = ''): FragranceInput | undefined {
  brand = clean(brand)
  name = clean(name)
  let variant = clean(explicitVariant)
  if (!brand || !name) return undefined
  const qualifier = name.match(new RegExp(`\\s*\\((${bracketConcentration})\\)$`, 'i'))
    ?? name.match(new RegExp(`\\s+(${fullConcentration})$`, 'i'))
  if (qualifier && (!variant || qualifier[1].toLowerCase() === variant.toLowerCase())) {
    name = name.slice(0, qualifier.index).trim()
    variant ||= qualifier[1]
  }
  if (!name) return undefined
  return { brand, name, ...(variant ? { variant } : {}) }
}

function value($: CheerioAPI, selector: string): string {
  const item = $(selector).first()
  return clean(item.attr('content') ?? item.text())
}

function productIdentity($: CheerioAPI, pageUrl: string): FragranceInput | undefined {
  const products: Record<string, unknown>[] = []
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const pending: unknown[] = [JSON.parse($(element).text())]
      while (pending.length) {
        const item = pending.pop()
        if (Array.isArray(item)) pending.push(...item)
        else if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>
          const types = Array.isArray(record['@type']) ? record['@type'] : [record['@type']]
          if (types.includes('Product')) products.push(record)
          if (record['@graph']) pending.push(record['@graph'])
        }
      }
    } catch { /* Malformed structured data does not prevent reading the visible identity. */ }
  })
  const product = products.find((item) => item.url === pageUrl || item['@id'] === pageUrl)
    ?? (products.length === 1 ? products[0] : undefined)
  if (!product || typeof product.name !== 'string') return undefined
  const brand = typeof product.brand === 'string' ? product.brand
    : product.brand && typeof product.brand === 'object' && 'name' in product.brand && typeof product.brand.name === 'string'
      ? product.brand.name : ''
  return identity(brand, product.name)
}

function headingIdentity($: CheerioAPI, source: SimilaritySource): FragranceInput | undefined {
  const heading = $('h1').first()
  if (!heading.length) return undefined
  const brand = value($, '[itemprop="brand"] [itemprop="name"], [itemprop="brand"]')
    || clean(heading.find(source === 'parfumo' ? 'a[href^="/Perfumes/"]' : 'a[href*="/designers/"]').first().text())
    || value($, source === 'parfumo'
      ? '.breadcrumb a[href^="/Perfumes/"], .breadcrumbs a[href^="/Perfumes/"], [itemtype$="BreadcrumbList"] a[href^="/Perfumes/"]'
      : '.breadcrumb a[href*="/designers/"], .breadcrumbs a[href*="/designers/"]')
  const nameElement = heading.find('[itemprop="name"]').first()
  const copy = (nameElement.length ? nameElement : heading).clone()
  const concentration = heading.find('[itemprop="concentration"], [data-concentration], .concentration').first()
  const variant = clean(concentration.attr('content') ?? concentration.attr('data-concentration') ?? concentration.text())
  copy.find('small, [itemprop="brand"], a, [itemprop="concentration"], [data-concentration], .concentration, .year').remove()
  let name = clean(copy.text()).replace(/\s+for (?:women and men|men and women|women|men)$/i, '')
  if (brand && name.endsWith(` ${brand}`)) name = name.slice(0, -brand.length).trim()
  return identity(brand, name, variant)
}

function parfumoTitleIdentity($: CheerioAPI): FragranceInput | undefined {
  const title = value($, 'meta[property="og:title"]') || value($, 'title')
  const match = title.match(/^(.+) by (.+?)(?:\s*[»|]|$)/u)
  if (!match) return undefined
  const qualifier = match[2].match(new RegExp(`\\s+\\((${bracketConcentration})\\)$`, 'i'))
  return identity(qualifier ? match[2].slice(0, qualifier.index) : match[2], match[1], qualifier?.[1])
}

// Bound extraction by document order, rather than taking every perfume link on the page.
function similarityElements($: CheerioAPI, source: SimilaritySource): Element[] | undefined {
  const all = $('*').toArray().filter((item): item is Element => 'tagName' in item)
  const pattern = source === 'fragrantica' ? /^This perfume reminds me of$/i : /^Smells similar$/i
  const start = all.findIndex((item) => /^h[2-6]$/.test(item.tagName) && pattern.test(clean($(item).text())))
  if (start < 0) return undefined
  const level = Number(all[start].tagName[1])
  const stop = all.findIndex((item, index) => index > start && /^h[1-6]$/.test(item.tagName) && (
    Number(item.tagName[1]) <= level ||
    /^(?:Reviews|Statements|Images|Charts|Related links|Popular by|Users who like|Collections|Fragrance (?:Notes|Pyramid))/i.test(clean($(item).text()))
  ))
  return all.slice(start + 1, stop < 0 ? undefined : stop).filter((item) => {
    const unrelatedPane = $(item).parents('[role="tabpanel"], .tab-pane').toArray().some((pane) =>
      /layer|associat|recommend/i.test(`${$(pane).attr('id') ?? ''} ${$(pane).attr('aria-label') ?? ''}`))
    return !unrelatedPane
  })
}

function cardIdentity($: CheerioAPI, link: Element, source: SimilaritySource): FragranceInput | undefined {
  const node = $(link)
  const image = node.find('img').first()
  const title = clean(node.attr('title') || image.attr('title') || image.attr('alt'))
  if (source === 'parfumo') {
    const byIndex = title.toLowerCase().lastIndexOf(' by ')
    if (byIndex < 1) return undefined
    const brand = title.slice(byIndex + 4)
    const display = node.clone()
    display.find('img, .brand, [itemprop="brand"]').remove()
    const visible = clean(display.text())
    // Display text chooses one alias when the tooltip lists multiple names.
    const names = title.slice(0, byIndex).split(/\s+\/\s+/u)
    const comparable = (name: string) => clean(name.replace(/[()]/g, '')).toLowerCase()
    const chosen = visible && names.some((name) => comparable(name) === comparable(visible)) ? visible : names[0]
    const qualifier = title.slice(0, byIndex).match(new RegExp(`\\s+\\((${bracketConcentration})\\)$`, 'i'))
    return identity(brand, chosen, qualifier?.[1])
  }
  // Fragrantica cards have a designer link beside the perfume link. Do not guess a brand from its URL slug.
  let parent = node.parent()
  for (let depth = 0; depth < 3 && parent.length; depth += 1, parent = parent.parent()) {
    const brands = parent.find('a[href*="/designers/"]').toArray()
    if (brands.length !== 1) continue
    const brand = clean($(brands[0]).text())
    let name = clean(node.text())
    if (!name && title.toLowerCase().startsWith('perfume ')) {
      name = title.slice(8).replace(/\s+for (?:women and men|men and women|women|men)$/i, '')
      if (!name.endsWith(` ${brand}`)) continue
      name = name.slice(0, -brand.length).trim()
    }
    const result = identity(brand, name)
    if (result) return result
  }
  // Loaded cards may show the brand as plain text, rather than a designer link.
  parent = node.parent()
  for (let depth = 0; depth < 3 && parent.length; depth += 1, parent = parent.parent()) {
    const perfumeLinks = parent.find('a[href*="/perfume/"], a[href^="/p/"]').toArray()
    if (new Set(perfumeLinks.map((item) => $(item).attr('href'))).size !== 1) continue
    const cardImage = parent.find('img').first()
    const caption = clean(cardImage.attr('title') || cardImage.attr('alt'))
    if (!/^perfume /i.test(caption)) continue
    const fullName = caption.slice(8).replace(/\s+for (?:women and men|men and women|women|men)$/i, '')
    const candidates = parent.find('*').toArray().filter((item) => !$(item).children().length)
      .map((item) => clean($(item).text())).filter((brand) => brand && fullName.endsWith(` ${brand}`))
    const matches = candidates.flatMap((brand) => {
      const name = fullName.slice(0, -brand.length).trim()
      if (clean(node.text()) && clean(node.text()) !== name) return []
      const result = identity(brand, name)
      return result ? [result] : []
    })
    const unique = new Map(matches.map((item) => [identityKey(item), item]))
    if (unique.size === 1) return [...unique.values()][0]
  }
  return undefined
}

export function isChallengePage(html: Buffer, encoding?: string): boolean {
  const $ = document(html, encoding)
  return /^(?:Just a moment|Attention Required|Checking your browser|Verify (?:you are|that you are) human)/i.test(value($, 'title'))
    || $('#challenge-running, #challenge-stage, #cf-challenge-running').length > 0
}

export function parseFragrancePage(html: Buffer, source: SimilaritySource, pageUrl: string, encoding?: string): FragrancePageImport | undefined {
  const $ = document(html, encoding)
  const fragrance = headingIdentity($, source) || productIdentity($, pageUrl)
    || (source === 'parfumo' ? parfumoTitleIdentity($) : undefined)
  if (!fragrance) return undefined
  fragrance.sourceUrls = { [source]: pageUrl }
  const elements = similarityElements($, source)
  const warnings: string[] = []
  const similarities: FragranceInput[] = []
  const seen = new Set<string>()
  let advertisedTotal: number | undefined
  let skipped = 0
  if (elements) {
    const selected = new Set<AnyNode>(elements)
    const linkPattern = source === 'parfumo' ? /^\/Perfumes\/[^/]+\/[^/]+\/?$/ : /^\/(?:perfume\/[^/]+\/[^/]+-\d+\.html|p\/\d+)$/
    const sectionText = elements.filter((item) => !item.children.some((child) => selected.has(child)))
      .map((item) => clean($(item).text())).join(' ')
    const count = sectionText.match(/\bAll\s+(\d[\d,]*)\b/i)
      ?? sectionText.match(/\b(\d[\d,]*)\s+(?:similar perfumes|similarities)\b/i)
    if (count) advertisedTotal = Number(count[1].replace(/,/g, ''))
    for (const element of elements) {
      if (element.tagName !== 'a') continue
      let path: string
      try {
        const target = new URL($(element).attr('href') ?? '', pageUrl)
        if (target.hostname !== new URL(pageUrl).hostname) continue
        path = target.pathname
      } catch { continue }
      if (!linkPattern.test(path)) continue
      const related = cardIdentity($, element, source)
      if (!related) { skipped += 1; continue }
      const key = identityKey(related)
      if (key === identityKey(fragrance) || seen.has(key)) continue
      seen.add(key)
      similarities.push(related)
    }
    if (skipped) warnings.push('Some similarity links could not be resolved to a brand and fragrance name. Review the source page manually.')
  } else {
    warnings.push(source === 'fragrantica' && $('#similar similar-perfumes-new').length
      ? 'The similarity list is loaded by browser JavaScript and is not present in the returned HTML; this is not evidence of an empty list.'
      : 'The similarity section was not found in the returned HTML; this is not evidence of an empty list.')
  }
  let completeness: FragrancePageImport['completeness'] = 'unknown'
  if (advertisedTotal !== undefined && similarities.length < advertisedTotal) {
    completeness = 'partial'
    warnings.push(`Only ${similarities.length} of ${advertisedTotal} advertised similarities were extracted.`)
  } else if (elements && advertisedTotal === similarities.length && skipped === 0) {
    completeness = 'complete'
  } else if (elements) {
    warnings.push('The total similarity count could not be verified; the extracted list may be incomplete.')
  }
  return { source, pageUrl, fragrance, similarities, completeness, ...(advertisedTotal !== undefined ? { advertisedTotal } : {}), warnings, upstreamStatus: 200 }
}
