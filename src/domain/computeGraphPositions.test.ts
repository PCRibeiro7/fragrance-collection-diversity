import { describe, expect, it } from 'vitest'
import { computeGraphPositions } from './computeGraphPositions'

describe('background similarity layout', () => {
  it('pulls linked fragrances together from widely separated initial positions', () => {
    const positions = computeGraphPositions([
      { data: { id: 'a', owned: 1 }, position: { x: 0, y: 0 } },
      { data: { id: 'b', owned: 0 }, position: { x: 3000, y: 2000 } },
      { data: { id: 'ab', source: 'a', target: 'b', weight: 4 } },
    ])
    expect(positions.map((node) => node.id)).toEqual(['a', 'b'])
    const [a, b] = positions.map((node) => node.position)
    const distance = Math.hypot(a.x - b.x, a.y - b.y)
    expect(distance).toBeGreaterThan(0)
    expect(distance).toBeLessThan(300)
  })
})
