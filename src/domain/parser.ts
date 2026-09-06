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
  const isCard = (index: number) => {
    const [heading, brand, name] = lines.slice(index, index + 3)
    return Boolean(
      heading && brand && name &&
      /^perfume\s+/i.test(heading) &&
      heading.replace(/^perfume\s+/i, '').toLocaleLowerCase() ===
        `${name} ${brand}`.toLocaleLowerCase(),
    )
  }
  const fragranticaPaste = lines.some((_, index) => isCard(index))

  for (let index = 0; index < lines.length; index += 1) {
    let raw = lines[index]
    if (fragranticaPaste && isCard(index)) {
      raw = `${lines[index + 1]} | ${lines[index + 2]}`
      index += 2
    } else if (fragranticaPaste && /^(?:This perfume reminds me of|Suggest|Compare|\d[\d.,\s]*k?)$/i.test(raw)) {
      continue
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
