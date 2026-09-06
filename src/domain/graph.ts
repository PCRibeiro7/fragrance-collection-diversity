import { UndirectedGraph } from 'graphology'
import louvain from 'graphology-communities-louvain'
import type {
  AggregatedEdge,
  Fragrance,
  GraphModel,
  SimilarityObservation,
  SimilaritySource,
} from './types'

const SOURCE_ORDER: Record<SimilaritySource, number> = {
  fragrantica: 0,
  parfumo: 1,
}

function pairKey(left: string, right: string): string {
  return left < right ? `${left}\u001f${right}` : `${right}\u001f${left}`
}

export function aggregateEdges(
  observations: SimilarityObservation[],
  enabledSources: Set<SimilaritySource> = new Set(['fragrantica', 'parfumo']),
): AggregatedEdge[] {
  const byPair = new Map<string, AggregatedEdge>()
  const evidenceSeen = new Set<string>()

  for (const observation of observations) {
    if (!enabledSources.has(observation.source)) continue
    if (observation.fromFragranceId === observation.toFragranceId) continue

    const [sourceId, targetId] = [observation.fromFragranceId, observation.toFragranceId].sort()
    const key = pairKey(sourceId, targetId)
    const evidenceKey = `${observation.source}:${observation.fromFragranceId}:${observation.toFragranceId}`
    if (evidenceSeen.has(evidenceKey)) continue
    evidenceSeen.add(evidenceKey)

    const edge = byPair.get(key) ?? {
      id: key,
      sourceId,
      targetId,
      weight: 0,
      evidence: [],
    }
    edge.evidence.push({
      source: observation.source,
      fromFragranceId: observation.fromFragranceId,
      toFragranceId: observation.toFragranceId,
    })
    edge.weight = edge.evidence.length
    byPair.set(key, edge)
  }

  return [...byPair.values()]
    .map((edge) => ({
      ...edge,
      evidence: edge.evidence.sort(
        (a, b) =>
          SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source] ||
          a.fromFragranceId.localeCompare(b.fromFragranceId),
      ),
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

export function edgeDirections(edge: AggregatedEdge) {
  return {
    forward: edge.evidence.some(
      (item) => item.fromFragranceId === edge.sourceId && item.toFragranceId === edge.targetId,
    ),
    reverse: edge.evidence.some(
      (item) => item.fromFragranceId === edge.targetId && item.toFragranceId === edge.sourceId,
    ),
  }
}

function detectCommunities(fragrances: Fragrance[], edges: AggregatedEdge[]): Map<string, number> {
  if (!fragrances.length) return new Map()
  const graph = new UndirectedGraph()
  for (const fragrance of fragrances) graph.addNode(fragrance.id)
  for (const edge of edges) {
    graph.addEdge(edge.sourceId, edge.targetId, { weight: edge.weight })
  }

  const raw = louvain(graph, {
    getEdgeWeight: 'weight',
    randomWalk: false,
    resolution: 1,
  }) as Record<string, string | number>

  const members = new Map<string, string[]>()
  for (const fragrance of fragrances) {
    const community = String(raw[fragrance.id] ?? fragrance.id)
    const group = members.get(community) ?? []
    group.push(fragrance.id)
    members.set(community, group)
  }

  const stableGroups = [...members.values()]
    .map((ids) => ids.sort())
    .sort((a, b) => a[0].localeCompare(b[0]))
  const stable = new Map<string, number>()
  stableGroups.forEach((ids, index) => ids.forEach((id) => stable.set(id, index)))
  return stable
}

export function buildGraphModel(
  fragrances: Fragrance[],
  observations: SimilarityObservation[],
  enabledSources: Set<SimilaritySource> = new Set(['fragrantica', 'parfumo']),
): GraphModel {
  const edges = aggregateEdges(observations, enabledSources)
  const communities = detectCommunities(fragrances, edges)
  const nodes = fragrances.map((fragrance) => ({
    ...fragrance,
    cluster: communities.get(fragrance.id) ?? 0,
  }))
  return {
    nodes,
    edges,
    clusters: [...new Set(nodes.map((node) => node.cluster))].sort((a, b) => a - b),
  }
}

export function visibleGraphElements(
  model: GraphModel,
  showContext: boolean,
  clusterFocus: number | 'all',
): { nodes: GraphModel['nodes']; edges: AggregatedEdge[] } {
  const eligible = model.nodes.filter((node) => showContext || node.owned)
  const focusedIds = new Set(eligible
    .filter((node) => clusterFocus === 'all' || node.cluster === clusterFocus)
    .map((node) => node.id))
  const visibleIds = new Set(focusedIds)
  for (const edge of model.edges) {
    if (focusedIds.has(edge.sourceId)) visibleIds.add(edge.targetId)
    if (focusedIds.has(edge.targetId)) visibleIds.add(edge.sourceId)
  }
  const nodes = eligible.filter((node) => visibleIds.has(node.id))
  const nodeIds = new Set(nodes.map((node) => node.id))
  return {
    nodes,
    edges: model.edges.filter((edge) =>
      nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId) &&
      (focusedIds.has(edge.sourceId) || focusedIds.has(edge.targetId)),
    ),
  }
}

export function directNeighborIds(nodeId: string, edges: AggregatedEdge[]): Set<string> {
  const neighbors = new Set<string>()
  for (const edge of edges) {
    if (edge.sourceId === nodeId) neighbors.add(edge.targetId)
    if (edge.targetId === nodeId) neighbors.add(edge.sourceId)
  }
  return neighbors
}

export interface SharedNeighborResult {
  fragranceId: string
  sharedIds: string[]
}

export function findSharedNeighbors(
  nodeId: string,
  fragrances: Fragrance[],
  edges: AggregatedEdge[],
): SharedNeighborResult[] {
  const selectedNeighbors = directNeighborIds(nodeId, edges)
  return fragrances
    .filter((item) => item.owned && item.id !== nodeId)
    .map((item) => ({
      fragranceId: item.id,
      sharedIds: [...directNeighborIds(item.id, edges)].filter((id) => selectedNeighbors.has(id)),
    }))
    .filter((result) => result.sharedIds.length > 0)
    .sort((a, b) => b.sharedIds.length - a.sharedIds.length)
}

export function groupOptions(model: GraphModel) {
  const shortName = (node: Fragrance) =>
    `${node.name}${node.variant ? ` (${node.variant})` : ''}`
  const names = new Map<string, number>()
  for (const node of model.nodes) {
    const key = shortName(node).toLocaleLowerCase()
    names.set(key, (names.get(key) ?? 0) + 1)
  }
  const labelFor = (node: Fragrance) =>
    (names.get(shortName(node).toLocaleLowerCase()) ?? 0) > 1
      ? `${node.brand} \u00b7 ${shortName(node)}` : shortName(node)
  return model.clusters.map((cluster) => {
    const members = model.nodes.filter((node) => node.cluster === cluster)
    const owned = members.filter((node) => node.owned)
    const labels = (owned.length ? owned : members)
      .sort((a, b) => shortName(a).localeCompare(shortName(b)) ||
        a.brand.localeCompare(b.brand) || a.id.localeCompare(b.id))
      .map(labelFor)
    const suffix = owned.length ? '' : ' (context only)'
    return {
      cluster,
      label: labels.slice(0, 2).join(' + ') +
        (labels.length > 2 ? ` + ${labels.length - 2} more` : '') + suffix,
      title: labels.join(' + ') + suffix,
    }
  }).sort((a, b) => a.label.localeCompare(b.label))
}
