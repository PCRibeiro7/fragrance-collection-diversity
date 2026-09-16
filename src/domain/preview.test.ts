import { describe, expect, it } from 'vitest'
import { aggregateEdges } from './graph'
import { analyzeFragrancePreview } from './preview'
import type { Fragrance, SimilarityObservation } from './types'

const now = '2026-01-01T00:00:00.000Z'

function fragrance(id: string, owned = true): Fragrance {
  return {
    id, brand: 'Brand', name: id, owned, sourceUrls: {},
    normalizedBrand: 'brand', normalizedName: id.toLowerCase(), normalizedVariant: '',
    createdAt: now, updatedAt: now,
  }
}

function observation(id: string, from: string, to: string, source: 'fragrantica' | 'parfumo' = 'fragrantica'): SimilarityObservation {
  return { id, captureId: `capture-${id}`, fromFragranceId: from, toFragranceId: to, source }
}

describe('fragrance preview analysis', () => {
  it('marks two-source direct evidence as highly redundant', () => {
    const fragrances = [fragrance('owned'), fragrance('context', false)]
    const result = analyzeFragrancePreview({
      relationshipIdsBySource: { fragrantica: ['owned'], parfumo: ['owned'] },
      fragrances,
      edges: [],
    })

    expect(result).toMatchObject({ level: 'high', evidenceCount: 1, directOwnedCount: 1 })
    expect(result.matches[0]).toMatchObject({ fragranceId: 'owned', directSources: ['fragrantica', 'parfumo'] })
  })

  it('finds shared context and ranks the closest owned fragrance', () => {
    const fragrances = [
      fragrance('close'), fragrance('far'), fragrance('cedar', false), fragrance('musk', false),
    ]
    const edges = aggregateEdges([
      observation('1', 'close', 'cedar'),
      observation('2', 'close', 'musk'),
      observation('3', 'far', 'musk'),
    ])
    const result = analyzeFragrancePreview({
      relationshipIdsBySource: { fragrantica: ['cedar', 'musk'], parfumo: [] },
      fragrances,
      edges,
    })

    expect(result.level).toBe('high')
    expect(result.matches.map((match) => match.fragranceId)).toEqual(['close', 'far'])
    expect(result.matches[0]).toMatchObject({ sharedIds: ['cedar', 'musk'], profileOverlap: 1 })
  })

  it('uses graph evidence when the candidate already exists as context', () => {
    const fragrances = [fragrance('owned'), fragrance('candidate', false)]
    const edges = aggregateEdges([
      observation('1', 'owned', 'candidate', 'fragrantica'),
      observation('2', 'candidate', 'owned', 'parfumo'),
    ])
    const result = analyzeFragrancePreview({
      candidateId: 'candidate',
      relationshipIdsBySource: { fragrantica: [], parfumo: [] },
      fragrances,
      edges,
    })

    expect(result).toMatchObject({ level: 'high', evidenceCount: 1, directOwnedCount: 1 })
  })

  it('distinguishes low overlap from missing evidence', () => {
    const fragrances = [fragrance('owned'), fragrance('unconnected', false)]
    expect(analyzeFragrancePreview({
      relationshipIdsBySource: { fragrantica: ['unconnected'], parfumo: [] }, fragrances, edges: [],
    }).level).toBe('low')
    expect(analyzeFragrancePreview({
      relationshipIdsBySource: { fragrantica: [], parfumo: [] }, fragrances, edges: [],
    }).level).toBe('insufficient')
  })
})
