import cytoscape, { type Core, type EventObject } from 'cytoscape'
import { useEffect, useMemo, useRef, useState } from 'react'
import { displayName } from '../domain/identity'
import { CLUSTER_COLORS } from '../domain/colors'
import { edgeDirections, visibleGraphElements } from '../domain/graph'
import { graphLayout, groupedPositions } from '../domain/graphLayout'
import type { NodePosition } from '../domain/computeGraphPositions'
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
  const layoutCache = useMemo(() => {
    // A new model invalidates positions after data or source changes.
    return { model, views: new Map<string, NodePosition[]>() }
  }, [model])
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
    const positions = groupedPositions(visibleNodes)
    const viewKey = `${showContext}:${clusterFocus}`
    const cachedPositions = layoutCache.views.get(viewKey)
    for (const node of cachedPositions ?? []) positions.set(node.id, node.position)
    const layout = graphLayout(visibleNodes.length, visibleEdges.length)

    const cy = cytoscape({
      container: containerRef.current,
      layout,
      pixelRatio: 1,
      hideEdgesOnViewport: visibleNodes.length > 150,
      elements: [
        ...visibleNodes.map((node) => ({
          group: 'nodes' as const,
          classes: clusterFocus !== 'all' && node.cluster !== clusterFocus ? 'boundary' : '',
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
          classes: clusterFocus !== 'all' &&
            [edge.sourceId, edge.targetId].some((id) => fragranceById.get(id)?.cluster !== clusterFocus)
            ? 'boundary' : '',
          data: {
            id: edge.id,
            source: edge.sourceId,
            target: edge.targetId,
            weight: edge.weight,
            sourceArrow: edgeDirections(edge).reverse ? 'triangle' : 'none',
            targetArrow: edgeDirections(edge).forward ? 'triangle' : 'none',
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
            'min-zoomed-font-size': 7,
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
            'source-arrow-shape': (edge) => edge.data('sourceArrow'),
            'target-arrow-shape': (edge) => edge.data('targetArrow'),
            'source-arrow-color': '#827565',
            'target-arrow-color': '#827565',
            'arrow-scale': 1.3,
            'curve-style': 'bezier',
            opacity: 0.62,
            label: 'data(weightLabel)',
            'font-size': 9,
            'min-zoomed-font-size': 7,
            color: '#6e6458',
            'text-background-color': '#f8f5ee',
            'text-background-opacity': 1,
            'text-background-padding': '2px',
            'overlay-opacity': 0,
          },
        },
        {
          selector: 'node.boundary',
          style: { opacity: 0.45, 'border-style': 'dashed' },
        },
        {
          selector: 'edge.boundary',
          style: { opacity: 0.3, 'line-style': 'dashed' },
        },
        {
          selector: ':selected',
          style: {
            'border-color': '#1d1a16',
            'border-width': 4,
            'line-color': '#1d1a16',
            'target-arrow-color': '#1d1a16',
            'source-arrow-color': '#1d1a16',
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
      minZoom: 0.01,
      maxZoom: 2.5,
      wheelSensitivity: 3,
    })

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
      const { forward, reverse } = edgeDirections(edge)
      const direction = forward && reverse ? '↔' : forward ? '→' : '←'
      setTooltip({
        left: position.x + 18,
        top: position.y + 18,
        title: `${left?.name ?? 'Unknown'} ${direction} ${right?.name ?? 'Unknown'}`,
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

    let worker: Worker | undefined
    if (layout.name === 'preset' && !cachedPositions && typeof Worker !== 'undefined') {
      try {
        worker = new Worker(new URL('../domain/graphLayout.worker.ts', import.meta.url), { type: 'module' })
        worker.onmessage = (event: MessageEvent<NodePosition[]>) => {
          if (cy.destroyed()) return
          // Keep a few recently visited views so switching back is immediate.
          if (layoutCache.views.size >= 6) {
            layoutCache.views.delete(layoutCache.views.keys().next().value!)
          }
          layoutCache.views.set(viewKey, event.data)
          cy.batch(() => {
            for (const node of event.data) {
              cy.getElementById(node.id).position(node.position)
            }
          })
          cy.stop()
          const matches = cy.nodes('.search-hit')
          cy.fit(matches.length ? matches : cy.elements(), matches.length ? 100 : 56)
          setTooltip(null)
          worker?.terminate()
        }
        worker.onerror = () => worker?.terminate()
        worker.postMessage(cy.elements().jsons())
      } catch {
        // Keep the immediately usable preview if workers are unavailable.
        worker?.terminate()
      }
    }

    return () => {
      worker?.terminate()
      cy.destroy()
      cyRef.current = null
    }
  }, [clusterFocus, fragranceById, layoutCache, model, onSelect, showContext])

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
  }, [clusterFocus, fragranceById, model, onSelect, search, showContext])

  useEffect(() => {
    const cy = cyRef.current
    if (cy) cy.animate({ fit: { eles: cy.elements(), padding: 56 }, duration: 250 })
  }, [fitSignal])

  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.elements().unselect()
    if (selected) cy.getElementById(selected.id).select()
  }, [clusterFocus, fragranceById, model, onSelect, selected, showContext])

  return (
    <div className="graph-stage">
      <div ref={containerRef} className="graph-canvas" aria-label="Fragrance similarity graph" />
      {clusterFocus !== 'all' && visibleGraphElements(model, showContext, clusterFocus).nodes.some(
        (node) => node.cluster !== clusterFocus,
      ) && <div className="boundary-legend">Faded nodes connect to this group but belong to another group.</div>}
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
