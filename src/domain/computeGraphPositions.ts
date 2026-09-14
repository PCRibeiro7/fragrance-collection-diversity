import cytoscape, { type ElementDefinition } from 'cytoscape'
import { similarityLayout } from './graphLayout'

export interface NodePosition {
  id: string
  position: { x: number; y: number }
}

// Large views call this only in a worker: the simulation is synchronous.
export function computeGraphPositions(elements: ElementDefinition[]): NodePosition[] {
  const cy = cytoscape({
    headless: true,
    styleEnabled: true,
    elements,
    layout: { name: 'preset' },
    style: [
      { selector: 'node', style: { width: 34, height: 34, 'border-width': 3 } },
      { selector: 'node[owned = 1]', style: { width: 52, height: 52, 'border-width': 4 } },
    ],
  })
  try {
    cy.layout(similarityLayout()).run()
    return cy.nodes().map((node) => ({ id: node.id(), position: { ...node.position() } }))
  } finally {
    cy.destroy()
  }
}
