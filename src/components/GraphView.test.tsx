import { act, cleanup, render } from '@testing-library/react'
import cytoscape, { type Core, type CytoscapeOptions } from 'cytoscape'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GraphModel } from '../domain/types'
import { GraphView } from './GraphView'

vi.mock('cytoscape', async (importOriginal) => {
  const { default: original } = await importOriginal<{ default: typeof cytoscape }>()
  return {
    default: vi.fn((options: CytoscapeOptions) => {
      const cy = original({ ...options, container: undefined, headless: true, styleEnabled: true })
      vi.spyOn(cy, 'animate').mockReturnValue(cy)
      return cy
    }),
  }
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function modelWithNodes(count: number): GraphModel {
  return {
    nodes: Array.from({ length: count }, (_, index) => ({
      id: `node-${index}`, name: `Fragrance ${index}`, brand: 'Brand',
      normalizedName: `fragrance ${index}`, normalizedBrand: 'brand', normalizedVariant: '',
      owned: index % 10 === 0, sourceUrls: {}, createdAt: '', updatedAt: '',
      cluster: index % 5,
    })),
    edges: Array.from({ length: count - 1 }, (_, index) => ({
      id: `edge-${index}`, sourceId: `node-${index}`, targetId: `node-${index + 1}`,
      weight: 1, evidence: [{ source: 'fragrantica', fromFragranceId: `node-${index}`, toFragranceId: `node-${index + 1}` }],
    })),
    clusters: [0, 1, 2, 3, 4],
  }
}

function lastGraph(): Core {
  return vi.mocked(cytoscape).mock.results.at(-1)!.value
}

function lastLayout() {
  // Cytoscape also has an extension-registration overload taking a string.
  const options = vi.mocked(cytoscape).mock.calls.at(-1)![0] as unknown as CytoscapeOptions
  return options.layout?.name
}

describe('graph rendering performance', () => {
  it('applies background positions, preserves selection, caches views and stops obsolete workers', () => {
    const workers: FakeWorker[] = []
    class FakeWorker {
      onmessage?: (event: { data: { id: string; position: { x: number; y: number } }[] }) => void
      postMessage = vi.fn()
      terminate = vi.fn()
      constructor() { workers.push(this) }
    }
    vi.stubGlobal('Worker', FakeWorker)
    const props = { model: modelWithNodes(1000), showContext: true, clusterFocus: 'all' as const, search: 'Fragrance 0', fitSignal: 0, selected: { type: 'node' as const, id: 'node-0' }, onSelect: vi.fn() }
    const { rerender, unmount } = render(<GraphView {...props} />)
    expect(lastLayout()).toBe('preset')
    expect(workers[0].postMessage.mock.calls[0][0]).toHaveLength(1999)
    const result = props.model.nodes.map((node, index) => ({ id: node.id, position: { x: index * 10, y: index * 20 } }))
    act(() => workers[0].onmessage?.({ data: result }))
    expect(lastGraph().getElementById('node-0').position()).toEqual(result[0].position)
    expect(lastGraph().getElementById('node-0').selected()).toBe(true)
    expect(lastGraph().getElementById('node-0').hasClass('search-hit')).toBe(true)
    expect(workers[0].terminate).toHaveBeenCalled()

    rerender(<GraphView {...props} clusterFocus={0} />)
    expect(workers).toHaveLength(2)
    const obsoleteGraph = lastGraph()
    rerender(<GraphView {...props} />)
    expect(workers[1].terminate).toHaveBeenCalled()
    expect(obsoleteGraph.destroyed()).toBe(true)
    expect(workers).toHaveLength(2)
    expect(lastGraph().getElementById('node-1').position()).toEqual(result[1].position)
    act(() => workers[1].onmessage?.({ data: [] }))
    expect(lastGraph().nodes()).toHaveLength(1000)
    unmount()
  })

  it('loads every node and link in a large overview without a force layout', () => {
    const model = modelWithNodes(1000)
    const props = { model, showContext: true, clusterFocus: 'all' as const, search: '', fitSignal: 0, selected: null, onSelect: vi.fn() }
    const { rerender } = render(<GraphView {...props} />)
    const cy = lastGraph()
    expect(lastLayout()).toBe('preset')
    expect(cy.nodes()).toHaveLength(1000)
    expect(cy.edges()).toHaveLength(999)
    const positions = cy.nodes().map((node) => node.position())
    expect(positions.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true)
    expect(new Set(positions.map(({ x, y }) => `${x},${y}`)).size).toBe(1000)

    rerender(<GraphView {...props} clusterFocus={0} />)
    expect(cy.destroyed()).toBe(true)
    // Boundary neighbors can make even a focused group large.
    expect(lastLayout()).toBe('preset')
    rerender(<GraphView {...props} />)
    expect(lastGraph().nodes()).toHaveLength(1000)
    expect(lastGraph().getElementById('node-0').position()).toEqual(positions[0])
  })

  it('keeps the force layout for small views and restores search and selection after filtering', () => {
    const props = { model: modelWithNodes(20), showContext: true, clusterFocus: 'all' as const, search: 'Fragrance 0', fitSignal: 0, selected: { type: 'node' as const, id: 'node-0' }, onSelect: vi.fn() }
    const { rerender } = render(<GraphView {...props} />)
    expect(lastLayout()).toBe('cose')
    rerender(<GraphView {...props} showContext={false} />)
    const node = lastGraph().getElementById('node-0')
    expect(lastGraph().nodes()).toHaveLength(2)
    expect(node.selected()).toBe(true)
    expect(node.hasClass('search-hit')).toBe(true)
  })
})
