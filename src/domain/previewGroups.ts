import { resolveKnownIdentity } from '../data/duplicateDecisions'
import { buildGraphModel, directNeighborIds, groupOptions } from './graph'
import { displayName, identityKey, normalizeFragranceInput } from './identity'
import type { Fragrance, FragranceAlias, FragranceInput, GraphModel, SimilarityObservation, SimilaritySource } from './types'

export interface PreviewGroupPrediction {
  status: 'existing' | 'new' | 'insufficient'
  members: Array<Fragrance & { temporary: boolean }>
  currentGroups: Array<{ cluster: number; label: string; title: string; partial: boolean }>
  mergesGroups: boolean
  splitsGroup: boolean
  sources: SimilaritySource[]
  resolution: number
}

interface PreviewGroupInput {
  candidate: FragranceInput
  lists: Record<SimilaritySource, FragranceInput[]>
  fragrances: Fragrance[]
  aliases: FragranceAlias[]
  observations: SimilarityObservation[]
  currentModel: GraphModel
  enabledSources: Set<SimilaritySource>
  resolution: number
}

const SOURCES = ['fragrantica', 'parfumo'] as const

/** Builds a disposable map; never calls repository writes or modifies its inputs. */
export function predictFragranceGroup({
  candidate, lists, fragrances, aliases, observations, currentModel, enabledSources, resolution,
}: PreviewGroupInput): PreviewGroupPrediction {
  const reservedIds = new Set(fragrances.map((item) => item.id))
  const temporary = new Map<string, Fragrance>()
  function resolve(input: FragranceInput): Fragrance {
    const known = resolveKnownIdentity(input, fragrances, aliases)
    if (known) return known
    const key = identityKey(input)
    const previous = temporary.get(key)
    if (previous) return previous
    let id = `preview:${key}`
    while (reservedIds.has(id)) id = `preview:${id}`
    reservedIds.add(id)
    const item: Fragrance = {
      id, brand: input.brand.trim(), name: input.name.trim(), variant: input.variant?.trim() || undefined,
      owned: false, sourceUrls: {}, ...normalizeFragranceInput(input),
      createdAt: '1970-01-01T00:00:00.000Z', updatedAt: '1970-01-01T00:00:00.000Z',
    }
    temporary.set(key, item)
    return item
  }

  const root = resolve(candidate)
  const sources = SOURCES.filter((source) => enabledSources.has(source))
  const replacedSources = new Set(sources.filter((source) => lists[source].length > 0))
  const simulatedObservations = observations.filter((item) =>
    item.fromFragranceId !== root.id || !replacedSources.has(item.source),
  )
  for (const source of sources) {
    const targets = new Set(lists[source]
      .slice().sort((a, b) => identityKey(a).localeCompare(identityKey(b)))
      .map((input) => resolve(input).id))
    targets.delete(root.id)
    for (const target of targets) {
      simulatedObservations.push({
        id: `preview:${source}:${target}`, captureId: `preview:${source}`,
        fromFragranceId: root.id, toFragranceId: target, source,
      })
    }
  }

  const temporaryIds = new Set([...temporary.values()].map((item) => item.id))
  const simulatedModel = buildGraphModel(
    [...fragrances, ...[...temporary.values()].sort((a, b) => a.id.localeCompare(b.id))],
    simulatedObservations, enabledSources, resolution,
  )
  const cluster = simulatedModel.nodes.find((item) => item.id === root.id)!.cluster
  const hasEvidence = directNeighborIds(root.id, simulatedModel.edges).size > 0
  const members = hasEvidence ? simulatedModel.nodes
    .filter((item) => item.cluster === cluster && item.id !== root.id)
    .map((item) => ({ ...item, temporary: temporaryIds.has(item.id) }))
    .sort((a, b) => Number(b.owned) - Number(a.owned) || displayName(a).localeCompare(displayName(b)) || a.id.localeCompare(b.id)) : []
  const memberIds = new Set(members.map((item) => item.id))
  const currentGroups = groupOptions(currentModel).flatMap((option) => {
    const previousMembers = currentModel.nodes.filter((item) => item.cluster === option.cluster && item.id !== root.id)
    if (!previousMembers.some((item) => memberIds.has(item.id))) return []
    return [{ ...option, partial: previousMembers.some((item) => !memberIds.has(item.id)) }]
  })

  return {
    status: !hasEvidence ? 'insufficient' : currentGroups.length ? 'existing' : 'new',
    members, currentGroups,
    mergesGroups: currentGroups.length > 1,
    splitsGroup: currentGroups.some((group) => group.partial),
    sources, resolution,
  }
}
