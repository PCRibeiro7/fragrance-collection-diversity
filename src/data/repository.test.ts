import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ScentMapDatabase } from './db'
import { replaceCapture, upsertFragrance } from './repository'

let database: ScentMapDatabase

beforeEach(() => {
  database = new ScentMapDatabase(`repository-test-${crypto.randomUUID()}`)
})

afterEach(async () => {
  await database.delete()
})

describe('capture repository', () => {
  it('promotes an exact context identity without duplicating it', async () => {
    await upsertFragrance({ brand: 'Diptyque', name: 'Philosykos' }, database)
    const owned = await upsertFragrance({ brand: ' diptyque ', name: '  PHILOSYKOS', owned: true }, database)

    expect(await database.fragrances.count()).toBe(1)
    expect(owned.owned).toBe(true)
  })

  it('atomically replaces one source while preserving the other', async () => {
    const root = await upsertFragrance({ brand: 'Root', name: 'One', owned: true }, database)
    await replaceCapture({
      rootFragranceId: root.id,
      source: 'fragrantica',
      targets: [{ brand: 'Brand', name: 'Old target' }],
    }, database)
    await replaceCapture({
      rootFragranceId: root.id,
      source: 'parfumo',
      targets: [{ brand: 'Brand', name: 'Parfumo target' }],
    }, database)
    await replaceCapture({
      rootFragranceId: root.id,
      source: 'fragrantica',
      targets: [{ brand: 'Brand', name: 'New target' }],
    }, database)

    const observations = await database.observations.toArray()
    const targets = new Map((await database.fragrances.toArray()).map((item) => [item.id, item.name]))
    expect(observations).toHaveLength(2)
    expect(observations.map((item) => [item.source, targets.get(item.toFragranceId)]).sort()).toEqual([
      ['fragrantica', 'New target'],
      ['parfumo', 'Parfumo target'],
    ])
    expect((await database.fragrances.toArray()).some((item) => item.name === 'Old target')).toBe(false)
  })

  it('deduplicates repeated targets and discards self-links', async () => {
    const root = await upsertFragrance({ brand: 'Root', name: 'One', owned: true }, database)
    await replaceCapture({
      rootFragranceId: root.id,
      source: 'fragrantica',
      targets: [
        { brand: 'Brand', name: 'Target' },
        { brand: 'brand', name: 'target' },
        { existingId: root.id, brand: root.brand, name: root.name },
      ],
    }, database)
    expect(await database.observations.count()).toBe(1)
  })
})
