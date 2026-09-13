import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ScentMapDatabase } from './db'
import { createBackup, validateBackup } from './backup'
import { mergeFragrances, undoMerge } from './merge'
import { replaceCapture, upsertFragrance, setOwned } from './repository'

let database: ScentMapDatabase
beforeEach(() => { database = new ScentMapDatabase(`merge-test-${crypto.randomUUID()}`) })
afterEach(async () => { await database.delete() })

describe('fragrance merges', () => {
  it('preserves ownership and capture provenance, redirects incoming evidence, removes self-links, and undoes exactly', async () => {
    const a = await upsertFragrance({ brand: 'Brand', name: 'Keep', owned: true, sourceUrls: { fragrantica: 'https://example.com/a' } }, database)
    const b = await upsertFragrance({ brand: 'Brand', name: 'Remove', owned: true, sourceUrls: { parfumo: 'https://example.com/b' } }, database)
    const c = await upsertFragrance({ brand: 'Brand', name: 'Other', owned: true }, database)
    await replaceCapture({ rootFragranceId: a.id, source: 'fragrantica', pageUrl: 'https://example.com/a', targets: [{ ...b, existingId: b.id }, { ...c, existingId: c.id }] }, database)
    await replaceCapture({ rootFragranceId: b.id, source: 'fragrantica', pageUrl: 'https://example.com/b', targets: [{ ...c, existingId: c.id }] }, database)
    await replaceCapture({ rootFragranceId: c.id, source: 'parfumo', targets: [{ ...a, existingId: a.id }, { ...b, existingId: b.id }] }, database)
    await setOwned(a.id, false, database)
    const before = await createBackup(database)
    const undo = await mergeFragrances(a.id, b.id, {}, database)
    const after = await createBackup(database)
    expect(validateBackup(after).fragranceCount).toBe(2)
    expect(after.fragrances.find((item) => item.id === a.id)).toMatchObject({ owned: true, sourceUrls: { fragrantica: 'https://example.com/a', parfumo: 'https://example.com/b' } })
    expect(after.captures).toHaveLength(3)
    expect(after.captures.map((item) => item.pageUrl)).toEqual(before.captures.map((item) => item.pageUrl))
    expect(after.observations).toHaveLength(3)
    expect(after.observations.every((item) => item.fromFragranceId !== b.id && item.toFragranceId !== b.id && item.fromFragranceId !== item.toFragranceId)).toBe(true)
    await undoMerge(undo, database)
    const restored = await createBackup(database)
    expect(restored.fragrances).toEqual(before.fragrances)
    expect(restored.captures).toEqual(before.captures)
    expect(restored.observations).toEqual(before.observations)
  })

  it('requires explicit URL conflict resolution without partially changing data', async () => {
    const a = await upsertFragrance({ brand: 'Brand', name: 'A', sourceUrls: { fragrantica: 'https://example.com/a' } }, database)
    const b = await upsertFragrance({ brand: 'Brand', name: 'B', sourceUrls: { fragrantica: 'https://example.com/b' } }, database)
    await expect(mergeFragrances(a.id, b.id, {}, database)).rejects.toThrow('Choose the fragrantica URL')
    expect(await database.fragrances.count()).toBe(2)
    await mergeFragrances(a.id, b.id, b.sourceUrls, database)
    expect((await database.fragrances.get(a.id))?.sourceUrls.fragrantica).toBe(b.sourceUrls.fragrantica)
  })

  it('rejects stale undo and missing or identical records', async () => {
    const a = await upsertFragrance({ brand: 'Brand', name: 'A' }, database)
    const b = await upsertFragrance({ brand: 'Brand', name: 'B' }, database)
    await expect(mergeFragrances(a.id, a.id, {}, database)).rejects.toThrow('different')
    await expect(mergeFragrances(a.id, 'missing', {}, database)).rejects.toThrow('no longer exists')
    const undo = await mergeFragrances(a.id, b.id, {}, database)
    await setOwned(a.id, true, database)
    await expect(undoMerge(undo, database)).rejects.toThrow('collection changed')
    expect((await database.fragrances.get(a.id))?.owned).toBe(true)
  })

  it('replaces all merged captures of one source while preserving the other source', async () => {
    const a = await upsertFragrance({ brand: 'Brand', name: 'A', owned: true }, database)
    const b = await upsertFragrance({ brand: 'Brand', name: 'B', owned: true }, database)
    for (const root of [a, b]) await replaceCapture({ rootFragranceId: root.id, source: 'fragrantica', targets: [{ brand: 'Target', name: root.name }] }, database)
    await replaceCapture({ rootFragranceId: a.id, source: 'parfumo', targets: [{ brand: 'Target', name: 'Other' }] }, database)
    await mergeFragrances(a.id, b.id, {}, database)
    await replaceCapture({ rootFragranceId: a.id, source: 'fragrantica', targets: [{ brand: 'Target', name: 'New' }] }, database)
    const backup = await createBackup(database)
    expect(validateBackup(backup).captureCount).toBe(2)
    expect(backup.observations).toHaveLength(2)
    expect(backup.fragrances.map((item) => item.name).sort()).toEqual(['A', 'New', 'Other'])
  })
})
