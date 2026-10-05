import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScentMapDatabase } from './db'
import { createBackup, restoreBackup, validateBackup } from './backup'
import { keepSeparate, resolveKnownIdentity } from './duplicateDecisions'
import { mergeFragrances, undoMerge } from './merge'
import { readDuplicateReviewState } from './useDuplicateReviewState'
import { FragranceIdentityConflict, replaceCapture, updateFragrance, upsertFragrance } from './repository'
import { identityKey } from '../domain/identity'

let database: ScentMapDatabase
beforeEach(() => { database = new ScentMapDatabase(`edit-${crypto.randomUUID()}`) })
afterEach(async () => { vi.restoreAllMocks(); await database.delete() })
const add = (name: string, owned = true) => upsertFragrance({ brand: 'Brand', name, owned }, database)

describe('editing fragrances', () => {
  it.each([true, false])('updates details and normalization while preserving ownership (%s), evidence and capture provenance', async (owned) => {
    const root = await upsertFragrance({ brand: 'Brand', name: 'Original', variant: 'EDT', owned,
      sourceUrls: { fragrantica: 'https://example.com/old', parfumo: 'https://example.com/p' } }, database)
    const other = await add('Other')
    await replaceCapture({ rootFragranceId: root.id, source: 'fragrantica', pageUrl: root.sourceUrls.fragrantica,
      targets: [{ ...other, existingId: other.id }] }, database)
    await replaceCapture({ rootFragranceId: other.id, source: 'parfumo', pageUrl: 'https://example.com/captured',
      targets: [{ ...root, existingId: root.id }] }, database)
    const before = await createBackup(database)
    const edited = await updateFragrance(root.id, { brand: ' New Brand ', name: ' Corrected  Name ', variant: ' EDP ',
      sourceUrls: { fragrantica: ' https://example.org/new ', parfumo: ' ' } }, database)
    expect(edited).toMatchObject({ id: root.id, owned, createdAt: root.createdAt, brand: 'New Brand', name: 'Corrected  Name',
      variant: 'EDP', normalizedBrand: 'new brand', normalizedName: 'corrected name', normalizedVariant: 'edp',
      sourceUrls: { fragrantica: 'https://example.org/new', parfumo: undefined } })
    const after = await createBackup(database)
    expect(after.captures).toEqual(before.captures)
    expect(after.observations).toEqual(before.observations)
    expect(after.fragrances).toHaveLength(2)
    expect(resolveKnownIdentity(edited, after.fragrances, after.aliases)?.id).toBe(root.id)
    expect(resolveKnownIdentity(root, after.fragrances, after.aliases)).toBeUndefined()
  })

  it('clears optional fields and returns unchanged records without writing or resetting decisions', async () => {
    const root = await upsertFragrance({ brand: 'Brand', name: 'Root', variant: 'EDT',
      sourceUrls: { fragrantica: 'https://example.com/f', parfumo: 'https://example.com/p' } }, database)
    const cleared = await updateFragrance(root.id, { brand: root.brand, name: root.name, variant: ' ', sourceUrls: {} }, database)
    expect(cleared.variant).toBeUndefined()
    expect(cleared.sourceUrls.fragrantica).toBeUndefined()
    expect(cleared.sourceUrls.parfumo).toBeUndefined()
    const other = await add('Other')
    await keepSeparate(root.id, other.id, database)
    const put = vi.spyOn(database.fragrances, 'put')
    const unchanged = await updateFragrance(root.id, { brand: ' Brand ', name: ' Root ', variant: '',
      sourceUrls: { fragrantica: '', parfumo: ' ' } }, database)
    expect(unchanged).toEqual(cleared)
    expect(put).not.toHaveBeenCalled()
    expect(await database.dismissals.count()).toBe(1)
  })

  it('validates required names and HTTP URLs and rejects missing records without writes', async () => {
    const root = await add('Root')
    const before = await createBackup(database)
    for (const input of [{ brand: ' ', name: 'Root' }, { brand: 'Brand', name: ' ' },
      { brand: 'Brand', name: 'Root', sourceUrls: { fragrantica: 'javascript:alert(1)' } },
      { brand: 'Brand', name: 'Root', sourceUrls: { parfumo: 'not a url' } }]) {
      await expect(updateFragrance(root.id, input, database)).rejects.toThrow()
    }
    await expect(updateFragrance('missing', root, database)).rejects.toThrow('no longer exists')
    expect((await createBackup(database)).fragrances).toEqual(before.fragrances)
    await expect(updateFragrance(root.id, { brand: root.brand, name: root.name,
      sourceUrls: { fragrantica: 'http://other-domain.test/scent' } }, database)).resolves.toMatchObject({ id: root.id })
  })

  it('rejects normalized exact conflicts atomically and allows self matches and different concentrations', async () => {
    const root = await add('Root')
    const target = await add('Target')
    await keepSeparate(root.id, target.id, database)
    const before = await createBackup(database)
    await expect(updateFragrance(root.id, { brand: ' brand ', name: ' TARGET ' }, database)).rejects.toMatchObject({
      name: 'FragranceIdentityConflict', fragranceId: target.id,
    })
    const after = await createBackup(database)
    expect(after.fragrances).toEqual(before.fragrances)
    expect(after.dismissals).toEqual(before.dismissals)
    await expect(updateFragrance(root.id, { brand: 'BRAND', name: 'ROOT' }, database)).resolves.toMatchObject({ id: root.id })
    await expect(updateFragrance(root.id, { brand: 'Brand', name: 'Target', variant: 'EDP' }, database)).resolves.toMatchObject({ id: root.id })
    expect(await database.fragrances.count()).toBe(2)
  })

  it('preserves aliases and merge history, rejects foreign aliases and permits its own aliases', async () => {
    const root = await add('Root'), survivor = await add('Canonical'), old = await add('Old')
    await mergeFragrances(survivor.id, old.id, {}, database)
    await expect(updateFragrance(root.id, { brand: 'Brand', name: ' old ' }, database)).rejects.toBeInstanceOf(FragranceIdentityConflict)
    const before = await createBackup(database)
    await updateFragrance(survivor.id, { brand: 'Brand', name: 'Corrected' }, database)
    const after = await createBackup(database)
    expect(after.aliases).toEqual(before.aliases)
    expect(after.mergeEvents).toEqual(before.mergeEvents)
    expect(await database.aliases.get(identityKey(old))).toMatchObject({ fragranceId: survivor.id })
    expect(resolveKnownIdentity(old, after.fragrances, after.aliases)?.name).toBe('Corrected')
    expect(after.aliases).toHaveLength(1)
    await expect(updateFragrance(survivor.id, { brand: 'Brand', name: 'Old' }, database)).resolves.toMatchObject({ id: survivor.id })
  })

  it.each(['identity', 'source link'])('resets only affected keep-separate decisions after a changed %s', async (change) => {
    const a = await add('A'), b = await add('B'), c = await add('C')
    await keepSeparate(a.id, b.id, database)
    await keepSeparate(a.id, c.id, database)
    await keepSeparate(b.id, c.id, database)
    await updateFragrance(a.id, { brand: a.brand, name: change === 'identity' ? 'Corrected' : a.name,
      sourceUrls: change === 'source link' ? { parfumo: 'https://example.com/new' } : {} }, database)
    expect(await database.dismissals.toArray()).toEqual([expect.objectContaining({ leftId: b.id, rightId: c.id })])
  })

  it('rolls back the fragrance and decisions if resetting decisions fails', async () => {
    const root = await add('Root'), other = await add('Other')
    await keepSeparate(root.id, other.id, database)
    const before = await createBackup(database)
    vi.spyOn(database.dismissals, 'filter').mockImplementationOnce(() => { throw new Error('Storage failed') })
    await expect(updateFragrance(root.id, { brand: root.brand, name: 'Corrected' }, database)).rejects.toThrow('Storage failed')
    const after = await createBackup(database)
    expect(after.fragrances).toEqual(before.fragrances)
    expect(after.dismissals).toEqual(before.dismissals)
  })

  it('preserves undo for unchanged saves and invalidates it after a real edit', async () => {
    const a = await add('A'), b = await add('B')
    const event = await mergeFragrances(a.id, b.id, {}, database)
    const current = (await database.fragrances.get(a.id))!
    await updateFragrance(a.id, current, database)
    expect((await readDuplicateReviewState(database)).canUndo).toBe(true)
    await updateFragrance(a.id, { brand: a.brand, name: 'Corrected' }, database)
    expect((await readDuplicateReviewState(database)).canUndo).toBe(false)
    await expect(undoMerge(event, database)).rejects.toThrow('collection changed')
    expect((await database.fragrances.get(a.id))?.name).toBe('Corrected')
  })

  it('round-trips edited records, relationships, aliases and history in existing backups', async () => {
    const root = await add('Root'), old = await add('Old')
    await replaceCapture({ rootFragranceId: root.id, source: 'parfumo', pageUrl: 'https://example.com/history',
      targets: [{ brand: 'Context', name: 'Neighbor' }] }, database)
    await mergeFragrances(root.id, old.id, {}, database)
    await updateFragrance(root.id, { brand: 'New Brand', name: 'Corrected', sourceUrls: { parfumo: 'https://example.com/current' } }, database)
    const backup = await createBackup(database)
    const parsed = validateBackup(JSON.parse(JSON.stringify(backup))).backup
    await restoreBackup(parsed, database)
    const restored = await createBackup(database)
    expect(restored.fragrances).toEqual(parsed.fragrances)
    expect(restored.captures).toEqual(parsed.captures)
    expect(restored.observations).toEqual(parsed.observations)
    expect(restored.aliases).toEqual(parsed.aliases)
    expect(restored.mergeEvents).toEqual(parsed.mergeEvents)
  })
})
