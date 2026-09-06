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

  it('extracts all 20 fragrances from a Fragrantica section with blank lines and votes', () => {
    const entries = [
      ['Montblanc', 'Explorer', 693, 472],
      ['Creed', 'Aventus', 699, 495],
      ['Creed', 'Aventus Cologne', 613, 327],
      ['Armaf', 'Club de Nuit Intense Man', 469, 344],
      ['Maison Alhambra', 'Jubilant Vitality', 100, 16],
      ['Dora The Explorer', 'Dora and Boots', 396, 648],
      ['Armaf', 'Club de Nuit Intense Man Parfum', 128, 167],
      ['In The Box', 'Citrus Craving', 49, 11],
      ['Zara', 'Vibrant Leather Eau de Parfum', 71, 61],
      ['Al Haramain Perfumes', "L'Aventure", 85, 102],
      ['Manoard', 'Energy', 22, 11],
      ['Mancera', 'Cedrat Boise', 140, 253],
      ['Nishane', 'Hacivat', 76, 127],
      ['Afnan', 'Supremacy Not Only Intense', 81, 140],
      ['Rayhaan', 'Adonis Icarus', 38, 55],
      ['Natura', 'Essencial Sentir', 34, 48],
      ['Goldfield & Banks Australia', 'Bohemian Lime', 80, 141],
      ['Pendora Scents', 'Vivant Sunlit', 10, 4],
      ['Dior', 'Dior Homme Cologne 2022', 33, 52],
      ['Armaf', 'Odyssey Limoni Fresh', 43, 74],
    ] as const
    const text = ['This perfume reminds me of', 'Suggest', ...entries.flatMap(
      ([brand, name, up, down]) => [`perfume ${name} ${brand}`, brand, name, up, down, 'Compare'],
    )].join('\r\n\r\n')

    expect(parseSimilarityList(text).map(({ brand, name }) => ({ brand, name }))).toEqual(
      entries.map(([brand, name]) => ({ brand, name })),
    )
  })

  it('ignores abbreviated vote counts in the Aventus related fragrance list', () => {
    const entries = [
      ['Armaf', 'Club de Nuit Intense Man', '6.1k', '935'],
      ['Montblanc', 'Explorer', '3.9k', '677'],
      ['Al Haramain Perfumes', "L'Aventure", '1.4k', '318'],
      ['Zara', 'Vibrant Leather Eau de Parfum', '1.2k', '228'],
      ['Afnan', 'Supremacy Silver', '1.2k', '293'],
      ['Afnan', 'Supremacy Not Only Intense', '907', '269'],
      ['Creed', 'Aventus Cologne', '826', '208'],
      ['Armaf', 'Club de Nuit Intense Man Limited Edition Parfum', '738', '84'],
      ['Loewe', 'Esencia pour Homme Eau de Parfum', '644', '92'],
      ['Armaf', 'Club de Nuit Intense Man Parfum', '617', '77'],
      ['Tiziana Terenzi', 'Orion', '700', '267'],
      ['Reyane Tradition', 'Insurrection II Pure', '682', '257'],
      ['Creed', 'Absolu Aventus 2023', '657', '212'],
      ['Nishane', 'Hacivat', '1.3k', '1.6k'],
      ['Vilhelm Parfumerie', 'Morning Chess', '608', '178'],
      ['Versace', 'Eros Energy', '699', '495'],
      ['Zara', 'Vibrant Leather', '486', '194'],
      ['Rasasi', 'Rumz Al Rasasi 9325 Pour Lui', '400', '69'],
      ['Fragrance One', 'Office For Men', '504', '323'],
      ['Mancera', 'Cedrat Boise', '1.6k', '2.5k'],
    ]
    const text = ['This perfume reminds me of', 'Suggest', ...entries.flatMap(
      ([brand, name, up, down]) => [`perfume ${name} ${brand}`, brand, name, up, down, 'Compare'],
    )].join('\r\n\r\n')

    expect(parseSimilarityList(text).map(({ brand, name }) => ({ brand, name }))).toEqual(
      entries.map(([brand, name]) => ({ brand, name })),
    )
  })

  it('preserves abbreviated-count text when it is a fragrance name', () => {
    expect(parseSimilarityList('6.1k')).toMatchObject([{ brand: '', name: '6.1k' }])
    expect(parseSimilarityList('perfume 6.1k Example\nExample\n6.1k\n1.2k\nCompare'))
      .toMatchObject([{ brand: 'Example', name: '6.1k' }])
  })

  it('supports cards without votes and deduplicates cards and manual rows together', () => {
    expect(parseSimilarityList(
      'perfume Explorer Montblanc\nMontblanc\nExplorer\nCompare\nMontblanc | Explorer\nCreed | Aventus',
    )).toMatchObject([
      { brand: 'Montblanc', name: 'Explorer' },
      { brand: 'Creed', name: 'Aventus' },
    ])
  })

  it('preserves numeric and interface-like names in manual lists', () => {
    expect(parseSimilarityList('212\nCompare\nSuggest')).toMatchObject([
      { name: '212' }, { name: 'Compare' }, { name: 'Suggest' },
    ])
  })

  it('only offers fuzzy similarity as a score, never an identity decision', () => {
    expect(similarityScore('Dior Sauvage', 'Dior Sauvage EDP')).toBeGreaterThan(0.7)
    expect(similarityScore('Dior Sauvage', 'Guerlain Shalimar')).toBeLessThan(0.5)
  })
})
