import { describe, expect, it } from 'vitest'
import { identityKey, normalizeIdentityPart } from './identity'

describe('fragrance identity', () => {
  it('normalizes case, whitespace, unicode, and dash variants', () => {
    expect(normalizeIdentityPart('  Eau   de—Parfum ')).toBe('eau de-parfum')
  })

  it('keeps concentration variants distinct', () => {
    const edt = identityKey({ brand: 'Dior', name: 'Sauvage', variant: 'EDT' })
    const edp = identityKey({ brand: 'Dior', name: 'Sauvage', variant: 'EDP' })
    expect(edt).not.toBe(edp)
  })

  it('does not collapse similarly named flankers', () => {
    const original = identityKey({ brand: 'Dior', name: 'Homme' })
    const intense = identityKey({ brand: 'Dior', name: 'Homme Intense' })
    expect(original).not.toBe(intense)
  })
})
