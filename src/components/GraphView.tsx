import cytoscape, { type Core, type EventObject } from 'cytoscape'
import { useEffect, useMemo, useRef, useState } from 'react'
import { displayName } from '../domain/identity'
import { CLUSTER_COLORS } from '../domain/colors'
import { visibleGraphElements } from '../domain/graph'
import type { GraphModel, SelectedGraphItem } from '../domain/types'

interface GraphViewProps {
  model: GraphModel
  showContext: boolean
  clusterFocus: number | 'all'
  search: string
  fitSignal: number
  selected: SelectedGraphItem
  onSelect: (selection: SelectedGraphItem) => void
}

interface EdgeTooltip {
  left: number
  top: number
  title: string
  evidence: string[]
}

export function GraphView({
  model,
  showContext,
  clusterFocus,
  search,
  fitSignal,
  selected,
  onSelect,
}: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const [tooltip, setTooltip] = useState<EdgeTooltip | null>(null)
  const fragranceById = useMemo(
    () => new Map(model.nodes.map((node) => [node.id, node])),
    [model.nodes],
  )

  useEffect(() => {
    if (!containerRef.current) return
    const { nodes: visibleNodes, edges: visibleEdges } = visibleGraphElements(
      model,
      showContext,
      clusterFocus,
    )
    const clusterOrder = [...new Set(visibleNodes.map((node) => node.cluster))]
    const positions = new Map<string, { x: number; y: number }>()

    for (const [clusterIndex, cluster] of clusterOrder.entries()) {
      const members = visibleNodes.filter((node) => node.cluster === cluster)
      const column = clusterIndex % 3
      const row = Math.floor(clusterIndex / 3)
      const centerX = column * 340
      const centerY = row * 300
      members.forEach((node, index) => {
        const angle = (index / Math.max(members.length, 1)) * Math.PI * 2
        const radius = Math.max(55, Math.min(130, members.length * 13))
        positions.set(node.id, {
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
        })
      })
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements: [
        ...visibleNodes.map((node) => ({
          group: 'nodes' as const,
          data: {
            id: node.id,
            label: node.name,
            brand: node.brand,
            owned: node.owned ? 1 : 0,
            color: CLUSTER_COLORS[node.cluster % CLUSTER_COLORS.length],
          },
          position: positions.get(node.id),
        })),
        ...visibleEdges.map((edge) => ({
          group: 'edges' as const,
          data: {
            id: edge.id,
            source: edge.sourceId,
            target: edge.targetId,
            weight: edge.weight,
            weightLabel: edge.weight > 1 ? String(edge.weight) : '',
          },
        })),
      ],
      style: [
        {
          selector: 'node',
          style: {
            width: 34,
            height: 34,
            'background-color': '#fffdf8',
            'border-color': 'data(color)',
            'border-width': 3,
            label: 'data(label)',
            color: '#29251f',
            'font-family': 'Manrope, sans-serif',
            'font-size': 10,
            'font-weight': 600,
            'text-wrap': 'ellipsis',
            'text-max-width': '104px',
            'text-valign': 'bottom',
            'text-margin-y': 8,
            'overlay-opacity': 0,
          },
        },
        {
          selector: 'node[owned = 1]',
          style: {
            width: 52,
            height: 52,
            'background-color': 'data(color)',
            'border-color': '#fffdf8',
            'border-width': 4,
            'font-size': 11,
            'font-weight': 700,
          },
        },
        {
          selector: 'edge',
          style: {
            width: 'mapData(weight, 1, 4, 1.5, 6)',
            'line-color': '#a79c8c',
            'curve-style': 'bezier',
            opacity: 0.62,
            label: 'data(weightLabel)',
            'font-size': 9,
            color: '#6e6458',
            'text-background-color': '#f8f5ee',
            'text-background-opacity': 1,
            'text-background-padding': '2px',
            'overlay-opacity': 0,
          },
        },
        {
          selector: ':selected',
          style: {
            'border-color': '#1d1a16',
            'border-width': 4,
            'line-color': '#1d1a16',
            'target-arrow-color': '#1d1a16',
            opacity: 1,
          },
        },
        {
          selector: '.search-muted',
          style: { opacity: 0.14 },
        },
        {
          selector: '.search-hit',
          style: { 'border-color': '#111', 'border-width': 6, opacity: 1 },
        },
      ],
      minZoom: 0.25,
      maxZoom: 2.5,
      wheelSensitivity: 0.18,
    })

    cy.layout({
      name: 'cose',
      randomize: false,
      animate: false,
      nodeRepulsion: () => 6200,
      idealEdgeLength: (edge) => 120 - edge.data('weight') * 13,
      edgeElasticity: (edge) => 70 + edge.data('weight') * 20,
      gravity: 0.25,
      numIter: 650,
      padding: 54,
    }).run()

    const selectHandler = (event: EventObject) => {
      const target = event.target
      if (target === cy) onSelect(null)
      else if (target.isNode()) onSelect({ type: 'node', id: target.id() })
      else if (target.isEdge()) onSelect({ type: 'edge', id: target.id() })
    }
    const hoverHandler = (event: EventObject) => {
      const edge = model.edges.find((item) => item.id === event.target.id())
      if (!edge) return
      const position = event.renderedPosition ?? { x: 0, y: 0 }
      const left = fragranceById.get(edge.sourceId)
      const right = fragranceById.get(edge.targetId)
      setTooltip({
        left: position.x + 18,
        top: position.y + 18,
        title: `${left?.name ?? 'Unknown'} ↔ ${right?.name ?? 'Unknown'}`,
        evidence: edge.evidence.map((item) => {
          const from = fragranceById.get(item.fromFragranceId)
          const to = fragranceById.get(item.toFragranceId)
          return `${item.source === 'fragrantica' ? 'Fragrantica' : 'Parfumo'} · ${from?.name} → ${to?.name}`
        }),
      })
    }

    cy.on('tap', selectHandler)
    cy.on('mouseover', 'edge', hoverHandler)
    cy.on('mouseout', 'edge', () => setTooltip(null))
    cy.fit(undefined, 56)
    cyRef.current = cy

    return () => {
      cy.destroy()
      cyRef.current = null
    }
  }, [clusterFocus, fragranceById, model, onSelect, showContext])

  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.elements().removeClass('search-muted search-hit')
    const query = search.trim().toLocaleLowerCase()
    if (!query) return
    cy.nodes().addClass('search-muted')
    const matches = cy.nodes().filter((node) => {
      const fragrance = fragranceById.get(node.id())
      return fragrance ? displayName(fragrance).toLocaleLowerCase().includes(query) : false
    })
    matches.removeClass('search-muted').addClass('search-hit')
    matches.connectedEdges().removeClass('search-muted')
    if (matches.length) cy.animate({ fit: { eles: matches, padding: 100 }, duration: 250 })
  }, [fragranceById, search])

  useEffect(() => {
    const cy = cyRef.current
    if (cy) cy.animate({ fit: { eles: cy.elements(), padding: 56 }, duration: 250 })
  }, [fitSignal])

  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.elements().unselect()
    if (selected) cy.getElementById(selected.id).select()
  }, [selected])

  return (
    <div className="graph-stage">
      <div ref={containerRef} className="graph-canvas" aria-label="Fragrance similarity graph" />
      {tooltip && (
        <div className="edge-tooltip" style={{ left: tooltip.left, top: tooltip.top }}>
          <strong>{tooltip.title}</strong>
          {tooltip.evidence.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      )}
    </div>
  )
}
