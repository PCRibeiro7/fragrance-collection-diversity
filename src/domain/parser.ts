import { identityKey } from './identity'

export interface ParsedSimilarityLine {
  id: string
  raw: string
  brand: string
  name: string
  variant: string
}

export function parseSimilarityList(text: string): ParsedSimilarityLine[] {
  const seen = new Set<string>()
  const parsed: ParsedSimilarityLine[] = []

  const lines = text.split(/\r\n?|\n/).map((line) => line.trim()).filter(Boolean)
  const normalizeCardText = (value: string) => value.replace(/\s+/g, ' ').toLocaleLowerCase()
  const isCard = (index: number) => {
    const [heading, brand, name] = lines.slice(index, index + 3)
    return Boolean(
      heading && brand && name &&
      !heading.includes('|') &&
      normalizeCardText(heading).endsWith(` ${normalizeCardText(`${name} ${brand}`)}`),
    )
  }
  const cardIndexes = new Set(lines.flatMap((_, index) => isCard(index) ? [index] : []))
  const fragranticaMetadata = new Set<number>()
  const firstCardIndex = cardIndexes.values().next().value
  if (firstCardIndex !== undefined) {
    // The section heading and Suggest control precede the first card.
    // Their position stays the same when the interface language changes.
    const headerStart = Math.max(0, firstCardIndex - 2)
    if (lines.slice(headerStart, firstCardIndex).every((line) => !line.includes('|') && !/ by /i.test(line))) {
      for (let index = headerStart; index < firstCardIndex; index += 1) fragranticaMetadata.add(index)
    }
    for (const cardIndex of cardIndexes) {
      let index = cardIndex + 3
      while (!cardIndexes.has(index) && /^\d[\d.,\s]*k?$/i.test(lines[index] ?? '')) {
        fragranticaMetadata.add(index)
        index += 1
      }
      // Compare follows the votes, or ends a card that has no votes.
      // Keep explicit manual rows and Parfumo cards outside these slots.
      if (lines[index] && !lines[index].includes('|') && !/ by /i.test(lines[index]) && !cardIndexes.has(index) &&
        (index > cardIndex + 3 || index + 1 === lines.length || cardIndexes.has(index + 1) || lines[index + 1]?.includes('|'))) {
        fragranticaMetadata.add(index)
      }
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    if (fragranticaMetadata.has(index)) continue
    let raw = lines[index]
    // Parfumo copies a title followed by its visible name. Match the pair
    // before consuming either line so unrelated name-only rows remain intact.
    const byIndex = raw.toLocaleLowerCase().lastIndexOf(' by ')
    const title = raw.slice(0, byIndex).trim()
    const parfumoBrand = raw.slice(byIndex + 4).trim()
    const displayName = lines[index + 1]
    const normalizeTitle = (value: string) => value.replace(/[()]/g, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase()
    const aliases = title.split(/\s+\/\s+/)
    // A trailing qualifier can apply to every alias, e.g.
    // "Tuscany per Uomo / Etruscan (Eau de Toilette)".
    const sharedQualifier = title.match(/\s+(\([^()]+\))$/)?.[1]
    const titleNames = [title, ...aliases]
    if (aliases.length > 1 && sharedQualifier) {
      titleNames.push(...aliases.slice(0, -1).map((name) => `${name} ${sharedQualifier}`))
    }
    const parfumoCard = !raw.includes('|') && byIndex > 0 && parfumoBrand && displayName &&
      titleNames.some((name) => normalizeTitle(name) === normalizeTitle(displayName))
    if (parfumoCard) {
      raw = `${parfumoBrand} | ${displayName}`
      index += 1
    } else if (cardIndexes.has(index)) {
      raw = `${lines[index + 1]} | ${lines[index + 2]}`
      index += 2
    }

    const dividerIndex = raw.indexOf('|')
    const brand = dividerIndex >= 0 ? raw.slice(0, dividerIndex).trim() : ''
    const name = dividerIndex >= 0 ? raw.slice(dividerIndex + 1).trim() : raw
    if (!name) continue

    const key = identityKey({ brand, name })
    if (seen.has(key)) continue
    seen.add(key)

    parsed.push({
      id: `${index}-${key}`,
      raw,
      brand,
      name,
      variant: '',
    })
  }

  return parsed
}

function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0]
    previous[0] = leftIndex
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex]
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      )
      diagonal = above
    }
  }

  return previous[right.length]
}

export function similarityScore(left: string, right: string): number {
  const a = left.trim().toLocaleLowerCase()
  const b = right.trim().toLocaleLowerCase()
  if (!a && !b) return 1
  if (!a || !b) return 0
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length)
}
