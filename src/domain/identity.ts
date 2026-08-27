import type { Fragrance, FragranceInput } from './types'

export function normalizeIdentityPart(value?: string): string {
  return (value ?? '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\s+/g, ' ')
}

export function identityKey(input: Pick<FragranceInput, 'brand' | 'name' | 'variant'>): string {
  return [input.brand, input.name, input.variant ?? ''].map(normalizeIdentityPart).join('\u001f')
}

export function fragranceIdentityKey(fragrance: Fragrance): string {
  return [
    fragrance.normalizedBrand,
    fragrance.normalizedName,
    fragrance.normalizedVariant,
  ].join('\u001f')
}

export function displayName(fragrance: Pick<Fragrance, 'brand' | 'name' | 'variant'>): string {
  return `${fragrance.brand} · ${fragrance.name}${fragrance.variant ? ` (${fragrance.variant})` : ''}`
}

export function normalizeFragranceInput(input: FragranceInput) {
  return {
    normalizedBrand: normalizeIdentityPart(input.brand),
    normalizedName: normalizeIdentityPart(input.name),
    normalizedVariant: normalizeIdentityPart(input.variant),
  }
}

export function validateHttpUrl(value?: string): boolean {
  if (!value?.trim()) return true
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
