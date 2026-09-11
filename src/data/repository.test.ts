import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ScentMapDatabase } from './db'
import { deleteFragrance, replaceCapture, upsertFragrance, saveFragranceWithRelationships } from './repository'

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

describe('fragrance deletion', () => {
  it('removes orphan context fragrances and evidence while preserving shared context and captures', async () => {
    const deleted = await upsertFragrance({ brand: 'Brand', name: 'Delete', owned: true }, database)
    const kept = await upsertFragrance({ brand: 'Brand', name: 'Keep', owned: true }, database)
    await replaceCapture({ rootFragranceId: deleted.id, source: 'fragrantica', targets: [
      { existingId: kept.id, brand: kept.brand, name: kept.name },
      { brand: 'Context', name: 'Orphan' },
      { brand: 'Context', name: 'Shared' },
    ] }, database)
    const incoming = await replaceCapture({ rootFragranceId: kept.id, source: 'parfumo', targets: [
      { existingId: deleted.id, brand: deleted.brand, name: deleted.name },
      { brand: 'Context', name: 'Shared' },
    ] }, database)
    const before = await database.fragrances.toArray()

    await deleteFragrance(deleted.id, database)

    expect(await database.fragrances.toArray()).toEqual(before.filter((item) => item.id !== deleted.id && item.name !== 'Orphan'))
    expect(await database.captures.toArray()).toEqual([incoming.capture])
    expect(await database.observations.toArray()).toEqual(incoming.observations.filter((item) => item.toFragranceId !== deleted.id))
  })

  it('deletes a context fragrance and permits deleting the last fragrance', async () => {
    const root = await upsertFragrance({ brand: 'Brand', name: 'Root', owned: true }, database)
    const { capture, observations } = await replaceCapture({ rootFragranceId: root.id, source: 'parfumo', targets: [
      { brand: 'Context', name: 'Target' },
    ] }, database)
    await deleteFragrance(observations[0].toFragranceId, database)
    expect(await database.observations.count()).toBe(0)
    expect(await database.captures.toArray()).toEqual([capture])
    expect(await database.fragrances.toArray()).toEqual([root])
    await deleteFragrance(root.id, database)
    await deleteFragrance(root.id, database)
    expect(await database.fragrances.count()).toBe(0)
    expect(await database.captures.count()).toBe(0)
  })
})

describe('orphan cleanup on owned deletion', () => {
  it('preserves owned neighbors, context with captures, and unrelated standalone context', async () => {
    const root = await upsertFragrance({ brand: 'Brand', name: 'Root', owned: true }, database)
    const owned = await upsertFragrance({ brand: 'Brand', name: 'Owned', owned: true }, database)
    const { observations } = await replaceCapture({ rootFragranceId: root.id, source: 'fragrantica', targets: [
      { ...owned, existingId: owned.id },
      { brand: 'Context', name: 'With capture' },
      { brand: 'Context', name: 'Orphan' },
    ] }, database)
    const contextId = observations[1].toFragranceId
    await replaceCapture({ rootFragranceId: contextId, source: 'parfumo', targets: [] }, database)
    const unrelated = await upsertFragrance({ brand: 'Context', name: 'Unrelated' }, database)
    await deleteFragrance(root.id, database)
    expect((await database.fragrances.toArray()).map((item) => item.id).sort()).toEqual([owned.id, contextId, unrelated.id].sort())
    expect(await database.observations.count()).toBe(0)
    expect((await database.captures.toArray()).map((item) => item.rootFragranceId)).toEqual([contextId])
  })

  it('removes all orphan targets across sources when deleting the last owned fragrance', async () => {
    const root = await saveFragranceWithRelationships({ brand: 'Brand', name: 'Root', owned: true }, [
      { source: 'fragrantica', targets: [{ brand: 'Context', name: 'One' }] },
      { source: 'parfumo', targets: [{ brand: 'Context', name: 'Two' }] },
    ], database)
    await deleteFragrance(root.id, database)
    expect(await database.fragrances.count()).toBe(0)
    expect(await database.captures.count()).toBe(0)
    expect(await database.observations.count()).toBe(0)
  })
})
