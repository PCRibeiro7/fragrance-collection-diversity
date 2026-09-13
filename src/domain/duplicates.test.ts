import { describe, expect, it } from 'vitest'
import { findDuplicateFragrances } from './duplicates'
import { normalizeFragranceInput } from './identity'
import type { Fragrance, FragranceInput } from './types'

function fragrance(input: FragranceInput): Fragrance {
  return { id: crypto.randomUUID(), owned: false, sourceUrls: {}, createdAt: '', updatedAt: '', ...input, ...normalizeFragranceInput(input) }
}

function scan(a: FragranceInput, b: FragranceInput) {
  return findDuplicateFragrances([fragrance(a), fragrance(b)])
}

describe('duplicate suggestions', () => {
  it.each([
    ['Al Haramain', 'Haramain Amber Oud Aqua Dubai', 'Al Haramain Perfumes', 'Amber Oud Aqua Dubai'],
    ['Alezz', 'Hersh 2', 'Alezz Oud', 'Hersh 2'],
    ['Jo Milano', 'Game of Spades Fullhouse', 'Jo Milano Paris', 'Game of Spades Full House'],
    ['Lattafa Perfumes', 'Art of Arabia I', 'Lattafa Pride', 'Art of Arabia I'],
    ['Hermès', 'Terre d’Hermès', 'Hermes', "Terre d'Hermes"],
  ])('recognizes brand and spelling aliases for %s', (brand, name, otherBrand, otherName) => {
    expect(scan({ brand, name }, { brand: otherBrand, name: otherName })[0].confidence).toBe('likely')
  })

  it.each([
    ['Marwa', 'Marwa Eau de Parfum'],
    ['Azzaro pour Homme Intense', 'Azzaro Pour Homme Intense (2015)'],
    ['Scent EDT', 'Scent EDP'],
  ])('requires review of qualifiers: %s and %s', (name, otherName) => {
    const [candidate] = scan({ brand: 'Brand', name }, { brand: 'Brand', name: otherName })
    expect(candidate.confidence).toBe('review')
    expect(candidate.warnings.length).toBeGreaterThan(0)
  })

  it('flags differing variant fields even with identical names', () => {
    expect(scan({ brand: 'Brand', name: 'Scent', variant: 'EDT' }, { brand: 'Brand', name: 'Scent', variant: 'EDP' })[0].confidence).toBe('review')
  })

  it('does not suggest unrelated brands or names', () => {
    expect(scan({ brand: 'One', name: 'Legend' }, { brand: 'Two', name: 'Legend' })).toEqual([])
    expect(scan({ brand: 'Creed', name: 'Aventus' }, { brand: 'Creed', name: 'Green Irish Tweed' })).toEqual([])
    expect(scan({ brand: 'Zara', name: 'Sunrise on the Red Sand Dunes' }, { brand: 'Zara', name: 'Sunrise on the Red Sand Dunes Intense' })).toEqual([])
  })

  it('uses matching source pages despite different names, but warns about conflicting URLs', () => {
    const page = 'https://www.fragrantica.com/perfume/Brand/Scent-123.html'
    expect(scan({ brand: 'One', name: 'Scent', sourceUrls: { fragrantica: page } }, { brand: 'Two', name: 'Other', sourceUrls: { fragrantica: page } })).toHaveLength(1)
    expect(scan({ brand: 'One', name: 'Scent', sourceUrls: { fragrantica: page } }, { brand: 'One', name: 'Scent', sourceUrls: { fragrantica: page + '?other' } })[0].confidence).toBe('review')
  })
})
