import type { LayoutOptions } from 'cytoscape'
import type { GraphModel } from './types'

// CoSE compares node pairs on every iteration. Bound that work even in a
// focused group, since one group can contain most of a large collection.
export function graphLayout(nodeCount: number, edgeCount: number): LayoutOptions {
  if (nodeCount > 150 || edgeCount > 400) {
    return { name: 'preset', fit: true, padding: 54 }
  }
  return similarityLayout()
}

export function similarityLayout(): LayoutOptions {
  return {
    name: 'cose',
    randomize: false,
    animate: false,
    nodeRepulsion: () => 6200,
    idealEdgeLength: (edge) => 120 - edge.data('weight') * 13,
    edgeElasticity: (edge) => 70 + edge.data('weight') * 20,
    gravity: 0.25,
    numIter: 650,
    padding: 54,
  }
}

// Spread members through circular clusters using a golden-angle spiral.
// Radius grows with group size, keeping spacing without a force simulation.
export function groupedPositions(nodes: GraphModel['nodes']) {
  const groups = new Map<number, GraphModel['nodes']>()
  for (const node of nodes) {
    const members = groups.get(node.cluster) ?? []
    members.push(node)
    groups.set(node.cluster, members)
  }
  const spacing = 85
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  const groupGap = 100
  const rowWidth = Math.max(600, Math.sqrt(nodes.length) * spacing * 2.5)
  const positions = new Map<string, { x: number; y: number }>()
  let x = 0
  let y = 0
  let rowHeight = 0
  for (const members of groups.values()) {
    const radius = spacing * Math.sqrt(members.length - 1)
    const width = radius * 2 + 150
    const height = radius * 2 + 110
    if (x > 0 && x + width > rowWidth) {
      x = 0
      y += rowHeight + groupGap
      rowHeight = 0
    }
    // Keep owned fragrances near the center of their context.
    const ordered = [...members.filter((node) => node.owned), ...members.filter((node) => !node.owned)]
    ordered.forEach((node, index) => {
      const distance = spacing * Math.sqrt(index)
      const angle = index * goldenAngle
      positions.set(node.id, {
        x: x + radius + Math.cos(angle) * distance,
        y: y + radius + Math.sin(angle) * distance,
      })
    })
    x += width + groupGap
    rowHeight = Math.max(rowHeight, height)
  }
  return positions
}
