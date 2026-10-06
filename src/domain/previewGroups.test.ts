import { describe, expect, it } from 'vitest'
import { buildGraphModel, groupOptions } from './graph'
import { identityKey } from './identity'
import { predictFragranceGroup } from './previewGroups'
import type { Fragrance, FragranceAlias, FragranceInput, SimilarityObservation, SimilaritySource } from './types'

function fragrance(id: string, owned = true): Fragrance {
  return {
    id, brand: 'Brand', name: id, owned, sourceUrls: {},
    normalizedBrand: 'brand', normalizedName: id.toLowerCase(), normalizedVariant: '',
    createdAt: '2026-01-01', updatedAt: '2026-01-01',
  }
}

function observation(from: string, to: string, source: SimilaritySource = 'fragrantica'): SimilarityObservation {
  return { id: `${source}:${from}:${to}`, captureId: 'capture', fromFragranceId: from, toFragranceId: to, source }
}

const candidate = { brand: 'Brand', name: 'Candidate' }
const input = (name: string): FragranceInput => ({ brand: 'Brand', name })

function simulate(
  fragrances: Fragrance[], observations: SimilarityObservation[],
  lists: Record<SimilaritySource, FragranceInput[]> = { fragrantica: [], parfumo: [] },
  options: { candidate?: FragranceInput; resolution?: number; sources?: SimilaritySource[]; aliases?: FragranceAlias[] } = {},
) {
  const enabledSources = new Set<SimilaritySource>(options.sources ?? ['fragrantica', 'parfumo'])
  const resolution = options.resolution ?? 1
  return predictFragranceGroup({
    candidate: options.candidate ?? candidate, lists, fragrances, observations,
    aliases: options.aliases ?? [], enabledSources, resolution,
    currentModel: buildGraphModel(fragrances, observations, enabledSources, resolution),
  })
}

describe('preview group simulation', () => {
  it('joins a current group, preserves its label, and leaves inputs unchanged', () => {
    const fragrances = [fragrance('a'), fragrance('b', false)]
    const observations = [observation('a', 'b')]
    const lists = { fragrantica: [input('a'), input('b')], parfumo: [] }
    const before = JSON.stringify({ fragrances, observations, lists })
    const result = simulate(fragrances, observations, lists)
    expect(result.status).toBe('existing')
    expect(result.members.map((item) => item.id)).toEqual(['a', 'b'])
    expect(result.currentGroups).toEqual([{ ...groupOptions(buildGraphModel(fragrances, observations))[0], partial: false }])
    expect(result).toMatchObject({ mergesGroups: false, splitsGroup: false })
    expect(JSON.stringify({ fragrances, observations, lists })).toBe(before)
  })

  it('creates a new group with deduplicated temporary context, ignoring self-links', () => {
    const result = simulate([fragrance('owned')], [], {
      fragrantica: [input('Unknown'), input('Unknown'), candidate], parfumo: [input('Unknown')],
    })
    expect(result.status).toBe('new')
    expect(result.currentGroups).toEqual([])
    expect(result.members).toHaveLength(1)
    expect(result.members[0]).toMatchObject({ name: 'Unknown', owned: false, temporary: true })
    expect(simulate([], [], { fragrantica: [candidate], parfumo: [] }).status).toBe('insufficient')
  })

  it('distinguishes insufficient evidence from a separate group at higher resolution', () => {
    const fragrances = [fragrance('a')]
    const lists = { fragrantica: [input('a')], parfumo: [] }
    expect(simulate(fragrances, []).status).toBe('insufficient')
    expect(simulate(fragrances, [], lists, { sources: ['parfumo'] }).status).toBe('insufficient')
    expect(simulate(fragrances, [], lists, { sources: [] }).status).toBe('insufficient')
    expect(simulate(fragrances, [], lists, { resolution: 0.4 }).status).toBe('existing')
    expect(simulate(fragrances, [], lists, { resolution: 2.5 }).status).toBe('new')
  })

  it('flags groups brought together by the candidate', () => {
    const fragrances = ['a', 'b', 'c', 'd'].map((id) => fragrance(id))
    const observations = [observation('a', 'b'), observation('c', 'd')]
    const result = simulate(fragrances, observations, {
      fragrantica: fragrances.map((item) => input(item.name)), parfumo: [],
    }, { resolution: 0.4 })
    expect(result.status).toBe('existing')
    expect(result.currentGroups).toHaveLength(2)
    expect(result).toMatchObject({ mergesGroups: true, splitsGroup: false })
    expect(result.members).toHaveLength(4)
  })

  it('flags partial membership when replacement splits an existing group', () => {
    const fragrances = ['a', 'b', 'c', 'd'].map((id) => fragrance(id))
    const observations = [observation('b', 'a'), observation('b', 'c'), observation('c', 'd')]
    const result = simulate(fragrances, observations, { fragrantica: [input('d')], parfumo: [] }, {
      candidate: input('b'), resolution: 0.4,
    })
    expect(result.status).toBe('existing')
    expect(result.splitsGroup).toBe(true)
    expect(result.currentGroups[0].partial).toBe(true)
    expect(result.members.map((item) => item.id)).not.toContain('a')
  })

  it('replaces only outgoing evidence of a pasted source and retains incoming and blank-source evidence', () => {
    const fragrances = ['a', 'b', 'c', 'd'].map((id) => fragrance(id))
    const observations = [observation('a', 'b'), observation('c', 'a'), observation('a', 'd', 'parfumo')]
    const lists = { fragrantica: [input('a')], parfumo: [] }
    expect(simulate(fragrances, observations, lists, { candidate: input('a'), sources: ['fragrantica'], resolution: 0.4 }).members.map((item) => item.id)).toEqual(['c'])
    expect(simulate(fragrances, observations, lists, { candidate: input('a'), sources: ['parfumo'], resolution: 0.4 }).members.map((item) => item.id)).toEqual(['d'])
    expect(simulate(fragrances, observations, undefined, { candidate: input('a'), resolution: 0.4 }).members.map((item) => item.id)).toEqual(['b', 'c', 'd'])
  })

  it('resolves merged candidate and relationship names, keeping concentrations distinct', () => {
    const fragrances = [fragrance('a'), fragrance('b')]
    const aliases = ['a', 'b'].map<FragranceAlias>((id) => ({
      id: identityKey(input(`Old ${id}`)), identity: input(`Old ${id}`), fragranceId: id, mergeEventId: 'merge',
    }))
    const result = simulate(fragrances, [], {
      fragrantica: [input('Old a'), input('Old b'), input('b'), { ...input('b'), variant: 'EDP' }], parfumo: [],
    }, { candidate: input('Old a'), aliases, resolution: 0.4 })
    expect(result.members).toHaveLength(2)
    expect(result.members[0]).toMatchObject({ id: 'b', temporary: false })
    expect(result.members[1]).toMatchObject({ name: 'b', variant: 'EDP', temporary: true })
  })

  it('keeps current cluster IDs when a temporary group renumbers simulated clusters', () => {
    const fragrances = [fragrance('w'), fragrance('z')]
    const result = simulate(fragrances, [], { fragrantica: [input('z')], parfumo: [] })
    // The preview ID makes z's group sort before w, reversing the simulated cluster numbers.
    expect(result.currentGroups[0]).toMatchObject({ cluster: 1, label: 'z', partial: false })
  })

  it('uses deterministic temporary identities without colliding with existing IDs', () => {
    const collision = fragrance(`preview:${identityKey(candidate)}`)
    collision.name = 'Other'
    const lists = { fragrantica: [input('New context')], parfumo: [] }
    const result = simulate([collision], [], lists)
    expect(result.status).toBe('new')
    expect(result.members).toHaveLength(1)
    expect(result.members[0].name).toBe('New context')
    expect(simulate([collision], [], lists)).toEqual(result)
  })
})
