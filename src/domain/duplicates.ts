import type { Fragrance } from './types'

export interface DuplicateCandidate {
  key: string
  left: Fragrance
  right: Fragrance
  confidence: 'likely' | 'review'
  reason: string
  warnings: string[]
}

function words(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

function brandKey(value: string): string {
  const key = words(value).replace(/\b(perfumes|parfums|fragrances|paris|australia)\b/g, '').replace(/\s+/g, ' ').trim()
  return ({ 'lattafa pride': 'lattafa', 'alezz oud': 'alezz' } as Record<string, string>)[key] ?? key
}

function nameKey(item: Fragrance): string {
  const brandWords = new Set(words(item.brand).split(' '))
  return words(item.name).split(' ').filter((word) => !brandWords.has(word)).join(' ')
}

function baseName(value: string): string {
  return value.replace(/\b(eau de parfum|eau de toilette|extrait de parfum|parfum|extrait|edp|edt|19\d{2}|20\d{2})\b/g, '')
    .replace(/\s+/g, ' ').trim()
}

// These naming wrappers are review hints, never proof of product equivalence.
function withoutNamingWrapper(value: string): string {
  return value.replace(/^(jean lowe|monogram|la collection|les creations de monsieur dior) /, '')
    .replace(/ (sharp patchouli|new)$/, '')
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const previous = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = previous
    }
  }
  return row[b.length]
}

function pageKey(value?: string): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return `${url.hostname.toLowerCase().replace(/^www\./, '')}${url.pathname.replace(/\/$/, '')}`
  } catch { return undefined }
}

export function findDuplicateFragrances(fragrances: Fragrance[]): DuplicateCandidate[] {
  const prepared = fragrances.map((item) => ({ item, brand: brandKey(item.brand), name: nameKey(item) }))
  const candidates: DuplicateCandidate[] = []
  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) {
      const a = prepared[i], b = prepared[j]
      const sharedPage = (['fragrantica', 'parfumo'] as const).some((source) => {
        const key = pageKey(a.item.sourceUrls[source])
        return key && key === pageKey(b.item.sourceUrls[source])
      })
      if (!sharedPage && (!a.brand || a.brand !== b.brand)) continue
      const exact = a.name !== '' && a.name.replaceAll(' ', '') === b.name.replaceAll(' ', '')
      const baseA = baseName(a.name), baseB = baseName(b.name)
      const sameBase = baseA !== '' && baseA === baseB
      const contained = baseA !== '' && withoutNamingWrapper(baseA) === withoutNamingWrapper(baseB)
      const typo = Math.min(a.name.length, b.name.length) >= 6 &&
        Math.abs(a.name.length - b.name.length) <= 2 && editDistance(a.name, b.name) <= 2
      if (!sharedPage && !exact && !sameBase && !contained && !typo) continue
      const warnings: string[] = []
      if (words(a.item.variant ?? '') !== words(b.item.variant ?? '')) warnings.push('Variant fields differ. Confirm the concentration or edition.')
      if (!exact) warnings.push('Names include different qualifiers. These may be separate concentrations, editions, or releases.')
      for (const source of ['fragrantica', 'parfumo'] as const) {
        if (a.item.sourceUrls[source] && b.item.sourceUrls[source] && a.item.sourceUrls[source] !== b.item.sourceUrls[source]) {
          warnings.push(`Different ${source} URLs. Choose which page to keep.`)
        }
      }
      candidates.push({
        key: [a.item.id, b.item.id].sort().join(':'), left: a.item, right: b.item,
        confidence: (sharedPage || exact || sameBase) && warnings.length === 0 ? 'likely' : 'review',
        reason: sharedPage ? 'Same source page' : exact ? 'Same name after normalizing spelling and brand aliases' : sameBase ? 'Same name apart from concentration or year' : contained ? 'One name contains the other' : 'Possible spelling variation',
        warnings,
      })
    }
  }
  return candidates.sort((a, b) => Number(a.confidence === 'review') - Number(b.confidence === 'review') || a.left.brand.localeCompare(b.left.brand) || a.left.name.localeCompare(b.left.name))
}
