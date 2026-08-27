import { describe, expect, it } from 'vitest'
import { parseSimilarityList, similarityScore } from './parser'

describe('similarity list parser', () => {
  it('parses brand pipes, permits name-only rows, and ignores blanks', () => {
    expect(parseSimilarityList('Diptyque | Philosykos\n\nPremier Figuier')).toMatchObject([
      { brand: 'Diptyque', name: 'Philosykos' },
      { brand: '', name: 'Premier Figuier' },
    ])
  })

  it('deduplicates normalized identities', () => {
    expect(parseSimilarityList('Dior | Sauvage\n dior|  sauvage ')).toHaveLength(1)
  })

  it('only offers fuzzy similarity as a score, never an identity decision', () => {
    expect(similarityScore('Dior Sauvage', 'Dior Sauvage EDP')).toBeGreaterThan(0.7)
    expect(similarityScore('Dior Sauvage', 'Guerlain Shalimar')).toBeLessThan(0.5)
  })
})
