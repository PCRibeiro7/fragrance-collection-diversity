import type { ElementDefinition } from 'cytoscape'
import { computeGraphPositions } from './computeGraphPositions'

self.onmessage = (event: MessageEvent<ElementDefinition[]>) => {
  self.postMessage(computeGraphPositions(event.data))
}
