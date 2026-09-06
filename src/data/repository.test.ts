import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ScentMapDatabase } from './db'
import { replaceCapture, upsertFragrance, saveFragranceWithRelationships } from './repository'

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

describe('combined fragrance save', () => {
  it('saves both sources together and reuses shared targets', async () => {
    const root = await saveFragranceWithRelationships({ brand: 'Root', name: 'One', owned: true }, [
      { source: 'fragrantica', targets: [{ brand: 'Shared', name: 'Target' }] },
      { source: 'parfumo', targets: [{ brand: 'Shared', name: 'Target' }] },
    ], database)
    expect(root.owned).toBe(true)
    expect(await database.fragrances.count()).toBe(2)
    expect(await database.captures.count()).toBe(2)
    expect(await database.observations.count()).toBe(2)
  })

  it('rolls back the fragrance and first source if the second source fails', async () => {
    await expect(saveFragranceWithRelationships({ brand: 'Root', name: 'One', owned: true }, [
      { source: 'fragrantica', targets: [{ brand: 'Brand', name: 'Target' }] },
      { source: 'parfumo', targets: [{ brand: '', name: 'Invalid' }] },
    ], database)).rejects.toThrow('both a brand and a name')
    expect(await database.fragrances.count()).toBe(0)
    expect(await database.captures.count()).toBe(0)
    expect(await database.observations.count()).toBe(0)
  })

  it('allows saving without relationships', async () => {
    await saveFragranceWithRelationships({ brand: 'Root', name: 'One', owned: true }, [], database)
    expect(await database.fragrances.count()).toBe(1)
    expect(await database.captures.count()).toBe(0)
  })
})
