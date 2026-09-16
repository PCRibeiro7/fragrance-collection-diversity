import { directNeighborIds } from './graph'
import type { AggregatedEdge, Fragrance, SimilaritySource } from './types'

export type RedundancyLevel = 'high' | 'medium' | 'low' | 'insufficient'

export interface PreviewMatch {
  fragranceId: string
  directSources: SimilaritySource[]
  sharedIds: string[]
  profileOverlap: number
  level: Exclude<RedundancyLevel, 'insufficient'>
}

export interface PreviewAnalysis {
  level: RedundancyLevel
  evidenceCount: number
  directOwnedCount: number
  matches: PreviewMatch[]
}

interface PreviewAnalysisInput {
  candidateId?: string
  relationshipIdsBySource: Record<SimilaritySource, string[]>
  fragrances: Fragrance[]
  edges: AggregatedEdge[]
}

const LEVEL_ORDER: Record<Exclude<RedundancyLevel, 'insufficient'>, number> = {
  high: 3,
  medium: 2,
  low: 1,
}

function levelForMatch(directSourceCount: number, sharedCount: number, profileOverlap: number): PreviewMatch['level'] {
  if (
    directSourceCount >= 2 ||
    (directSourceCount >= 1 && sharedCount >= 2) ||
    (sharedCount >= 2 && profileOverlap >= 0.6) ||
    (sharedCount >= 3 && profileOverlap >= 0.4)
  ) return 'high'
  if (directSourceCount >= 1 || sharedCount >= 2 || (sharedCount >= 1 && profileOverlap >= 0.25)) {
    return 'medium'
  }
  return 'low'
}

export function analyzeFragrancePreview({
  candidateId,
  relationshipIdsBySource,
  fragrances,
  edges,
}: PreviewAnalysisInput): PreviewAnalysis {
  const sourceByNeighbor = new Map<string, Set<SimilaritySource>>()
  const addEvidence = (id: string, source: SimilaritySource) => {
    if (id === candidateId) return
    const sources = sourceByNeighbor.get(id) ?? new Set<SimilaritySource>()
    sources.add(source)
    sourceByNeighbor.set(id, sources)
  }

  for (const source of ['fragrantica', 'parfumo'] as const) {
    for (const id of relationshipIdsBySource[source]) addEvidence(id, source)
  }

  if (candidateId) {
    for (const edge of edges) {
      const neighborId = edge.sourceId === candidateId
        ? edge.targetId
        : edge.targetId === candidateId ? edge.sourceId : undefined
      if (!neighborId) continue
      for (const evidence of edge.evidence) addEvidence(neighborId, evidence.source)
    }
  }

  const candidateNeighbors = new Set(sourceByNeighbor.keys())
  if (!candidateNeighbors.size) {
    return { level: 'insufficient', evidenceCount: 0, directOwnedCount: 0, matches: [] }
  }

  const matches = fragrances
    .filter((fragrance) => fragrance.owned && fragrance.id !== candidateId)
    .map<PreviewMatch>((fragrance) => {
      const ownedNeighbors = directNeighborIds(fragrance.id, edges)
      if (candidateId) ownedNeighbors.delete(candidateId)
      const candidateProfile = new Set(candidateNeighbors)
      candidateProfile.delete(fragrance.id)
      const sharedIds = [...candidateProfile]
        .filter((id) => ownedNeighbors.has(id))
        .sort()
      const union = new Set([...candidateProfile, ...ownedNeighbors])
      const profileOverlap = union.size ? sharedIds.length / union.size : 0
      const directSources = [...(sourceByNeighbor.get(fragrance.id) ?? [])]
      return {
        fragranceId: fragrance.id,
        directSources,
        sharedIds,
        profileOverlap,
        level: levelForMatch(directSources.length, sharedIds.length, profileOverlap),
      }
    })
    .filter((match) => match.directSources.length > 0 || match.sharedIds.length > 0)
    .sort((left, right) =>
      LEVEL_ORDER[right.level] - LEVEL_ORDER[left.level] ||
      right.directSources.length - left.directSources.length ||
      right.sharedIds.length - left.sharedIds.length ||
      right.profileOverlap - left.profileOverlap ||
      left.fragranceId.localeCompare(right.fragranceId),
    )

  return {
    level: matches[0]?.level ?? 'low',
    evidenceCount: candidateNeighbors.size,
    directOwnedCount: matches.filter((match) => match.directSources.length > 0).length,
    matches,
  }
}
