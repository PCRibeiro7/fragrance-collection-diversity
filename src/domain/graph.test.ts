import { describe, expect, it } from 'vitest'
import { aggregateEdges, groupOptions, edgeDirections, buildGraphModel, findSharedNeighbors, visibleGraphElements } from './graph'
import type { Fragrance, SimilarityObservation } from './types'

const now = '2026-01-01T00:00:00.000Z'

function fragrance(id: string, owned = true): Fragrance {
  return {
    id,
    brand: 'Brand',
    name: id,
    owned,
    sourceUrls: {},
    normalizedBrand: 'brand',
    normalizedName: id.toLowerCase(),
    normalizedVariant: '',
    createdAt: now,
    updatedAt: now,
  }
}

function observation(
  id: string,
  from: string,
  to: string,
  source: 'fragrantica' | 'parfumo',
): SimilarityObservation {
  return { id, captureId: `capture-${id}`, fromFragranceId: from, toFragranceId: to, source }
}

describe('graph derivation', () => {
  it('counts unique source-direction evidence from one to four', () => {
    const edges = aggregateEdges([
      observation('1', 'a', 'b', 'fragrantica'),
      observation('2', 'b', 'a', 'fragrantica'),
      observation('3', 'a', 'b', 'parfumo'),
      observation('4', 'b', 'a', 'parfumo'),
      observation('duplicate', 'a', 'b', 'parfumo'),
    ])
    expect(edges).toHaveLength(1)
    expect(edges[0].weight).toBe(4)
    expect(edges[0].evidence).toHaveLength(4)
  })

  it('filters source evidence without changing the raw observations', () => {
    const observations = [
      observation('1', 'a', 'b', 'fragrantica'),
      observation('2', 'a', 'b', 'parfumo'),
    ]
    expect(aggregateEdges(observations, new Set(['parfumo']))[0].weight).toBe(1)
    expect(observations).toHaveLength(2)
  })

  it('keeps shared context indirect and places connected nodes in a community', () => {
    const fragrances = [fragrance('Owned A'), fragrance('Owned B'), fragrance('Context C', false)]
    const observations = [
      observation('1', 'Owned A', 'Context C', 'fragrantica'),
      observation('2', 'Owned B', 'Context C', 'fragrantica'),
    ]
    const model = buildGraphModel(fragrances, observations)

    expect(model.edges).toHaveLength(2)
    expect(model.edges.some((edge) => edge.id.includes('Owned A') && edge.id.includes('Owned B'))).toBe(false)
    expect(model.nodes.map((node) => node.cluster)).toEqual([0, 0, 0])
    expect(findSharedNeighbors('Owned A', fragrances, model.edges)).toEqual([
      { fragranceId: 'Owned B', sharedIds: ['Context C'] },
    ])
    expect(visibleGraphElements(model, false, 'all')).toMatchObject({
      nodes: [{ id: 'Owned A' }, { id: 'Owned B' }],
      edges: [],
    })
    expect(visibleGraphElements(model, true, 'all').edges).toHaveLength(2)
  })

  it('includes shared context even when owned fragrances are directly related', () => {
    const fragrances = [
      fragrance('Eros Energy'),
      fragrance('Aventus'),
      fragrance('Cedrat Boise', false),
      fragrance('Outlands'),
    ]
    const edges = aggregateEdges([
      observation('1', 'Eros Energy', 'Aventus', 'fragrantica'),
      observation('2', 'Aventus', 'Eros Energy', 'fragrantica'),
      observation('3', 'Eros Energy', 'Cedrat Boise', 'fragrantica'),
      observation('4', 'Aventus', 'Cedrat Boise', 'fragrantica'),
    ])

    expect(findSharedNeighbors('Eros Energy', fragrances, edges)).toEqual([
      { fragranceId: 'Aventus', sharedIds: ['Cedrat Boise'] },
    ])
    expect(findSharedNeighbors('Aventus', fragrances, edges)).toEqual([
      { fragranceId: 'Eros Energy', sharedIds: ['Cedrat Boise'] },
    ])
    expect(findSharedNeighbors('Outlands', fragrances, edges)).toEqual([])
  })

  it('derives arrow directions from evidence rather than sorted endpoints or weight', () => {
    const forward = aggregateEdges([
      observation('1', 'a', 'b', 'fragrantica'),
      observation('2', 'a', 'b', 'parfumo'),
    ])[0]
    expect(forward.weight).toBe(2)
    expect(edgeDirections(forward)).toEqual({ forward: true, reverse: false })

    const reverse = aggregateEdges([observation('1', 'b', 'a', 'fragrantica')])[0]
    expect(edgeDirections(reverse)).toEqual({ forward: false, reverse: true })

    const observations = [
      observation('1', 'a', 'b', 'fragrantica'),
      observation('2', 'b', 'a', 'parfumo'),
    ]
    expect(edgeDirections(aggregateEdges(observations)[0])).toEqual({
      forward: true, reverse: true,
    })
    expect(edgeDirections(aggregateEdges(observations, new Set(['parfumo']))[0])).toEqual({
      forward: false, reverse: true,
    })
  })

  it('handles an empty collection', () => {
    expect(buildGraphModel([], [])).toEqual({ nodes: [], edges: [], clusters: [] })
  })

  it('uses community resolution to calibrate broader versus separate groups', () => {
    const fragrances = [fragrance('a'), fragrance('b')]
    const observations = [observation('1', 'a', 'b', 'fragrantica')]

    expect(buildGraphModel(fragrances, observations, undefined, 0.4).clusters).toHaveLength(1)
    expect(buildGraphModel(fragrances, observations, undefined, 2.5).clusters).toHaveLength(2)
  })
})

describe('group navigation', () => {
  it('names groups using owned fragrances alphabetically and exposes every name', () => {
    const nodes = [fragrance('Eros Energy'), fragrance('Aventus'), fragrance('Explorer', false)]
      .map((node) => ({ ...node, cluster: 0 }))
    const model = { nodes, edges: [], clusters: [0] }
    expect(groupOptions(model)[0].label).toBe('Aventus + Eros Energy')
    nodes.push({ ...fragrance('Hacivat'), cluster: 0 })
    expect(groupOptions(model)[0]).toMatchObject({
      label: 'Aventus + Eros Energy + 1 more',
      title: 'Aventus + Eros Energy + Hacivat',
    })
  })

  it('disambiguates names across groups and labels context-only groups', () => {
    const nodes = [
      { ...fragrance('a'), name: 'Homme', brand: 'Dior', cluster: 0 },
      { ...fragrance('b', false), name: 'Homme', brand: 'Issey Miyake', cluster: 1 },
    ]
    expect(groupOptions({ nodes, edges: [], clusters: [0, 1] }).map((group) => group.label))
      .toEqual(['Dior \u00b7 Homme', 'Issey Miyake \u00b7 Homme (context only)'])
  })

  it('includes only direct boundary neighbors and respects the context toggle', () => {
    const nodes = ['a', 'b', 'c', 'd'].map((id, index) => ({
      ...fragrance(id, id !== 'c'), cluster: index === 0 ? 0 : 1,
    }))
    const edges = aggregateEdges([
      observation('1', 'a', 'b', 'fragrantica'),
      observation('2', 'c', 'a', 'fragrantica'),
      observation('3', 'b', 'c', 'fragrantica'),
      observation('4', 'b', 'd', 'fragrantica'),
    ])
    const model = { nodes, edges, clusters: [0, 1] }
    const focused = visibleGraphElements(model, true, 0)
    expect(focused.nodes.map((node) => node.id)).toEqual(['a', 'b', 'c'])
    expect(focused.edges).toHaveLength(2)
    expect(visibleGraphElements(model, false, 0).nodes.map((node) => node.id)).toEqual(['a', 'b'])
    expect(visibleGraphElements(model, false, 0).edges).toHaveLength(1)
    expect(visibleGraphElements(model, true, 'all').edges).toHaveLength(4)
    expect(visibleGraphElements(model, true, 99)).toEqual({ nodes: [], edges: [] })
  })
})
