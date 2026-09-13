import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScentMapDatabase } from './db'
import { createBackup, restoreBackup, validateBackup } from './backup'
import { keepSeparate, reviewAgain, forgetAlias } from './duplicateDecisions'
import { mergeFragrances, undoMerge } from './merge'
import { readDuplicateReviewState } from './useDuplicateReviewState'
import { deleteFragrance, replaceCapture, upsertFragrance } from './repository'
import { identityKey } from '../domain/identity'

let database: ScentMapDatabase
beforeEach(() => { database = new ScentMapDatabase(`decisions-${crypto.randomUUID()}`) })
afterEach(async () => { vi.restoreAllMocks(); await database.delete() })
const add = (name: string, owned = true) => upsertFragrance({ brand: 'Brand', name, owned }, database)

describe('persistent decisions and history', () => {
  it('keeps decisions after database reopen and identity edits until explicitly reset', async () => {
    const a = await add('One'), b = await add('Two')
    await keepSeparate(a.id, b.id, database)
    database.close(); await database.open()
    await database.fragrances.update(a.id, { name: 'Renamed' })
    const [decision] = await database.dismissals.toArray()
    expect(decision.left.name).toBe('One')
    await keepSeparate(b.id, a.id, database)
    expect(await database.dismissals.count()).toBe(1)
    await reviewAgain(decision.id, database)
    expect(await database.dismissals.count()).toBe(0)
  })

  it('redirects decisions and aliases through chains; undo restores both and prior history targets', async () => {
    const a = await add('A'), b = await add('B'), c = await add('C'), d = await add('D')
    await keepSeparate(a.id, d.id, database)
    await keepSeparate(b.id, d.id, database)
    await keepSeparate(a.id, b.id, database)
    const first = await mergeFragrances(a.id, b.id, {}, database)
    expect(await database.dismissals.count()).toBe(1)
    const second = await mergeFragrances(c.id, a.id, {}, database)
    expect((await database.aliases.toArray()).every((alias) => alias.fragranceId === c.id)).toBe(true)
    expect((await database.mergeEvents.get(first))?.currentSurvivorId).toBe(c.id)
    database.close(); await database.open()
    expect((await readDuplicateReviewState(database)).canUndo).toBe(true)
    await undoMerge(second, database)
    expect((await database.mergeEvents.get(second))?.undoneAt).toBeTruthy()
    expect((await database.mergeEvents.get(first))?.currentSurvivorId).toBe(a.id)
    expect((await database.aliases.get(identityKey(b)))?.fragranceId).toBe(a.id)
    expect(await database.undoCheckpoints.count()).toBe(0)
    await expect(undoMerge(first, database)).rejects.toThrow('latest')
  })

  it('retains audit history while cleaning deleted aliases and decisions', async () => {
    const a = await add('A'), b = await add('B'), c = await add('C')
    await mergeFragrances(a.id, b.id, {}, database)
    await keepSeparate(a.id, c.id, database)
    await deleteFragrance(a.id, database)
    expect(await database.aliases.count()).toBe(0)
    expect(await database.dismissals.count()).toBe(0)
    expect(await database.mergeEvents.count()).toBe(1)
    expect(() => validateBackup({})).toThrow()
    expect(validateBackup(await createBackup(database)).mergeCount).toBe(1)
  })

  it('cleans metadata when orphan cleanup removes a survivor', async () => {
    const root = await add('Root'), a = await add('A', false), b = await add('B', false)
    await mergeFragrances(a.id, b.id, {}, database)
    await keepSeparate(root.id, a.id, database)
    await replaceCapture({ rootFragranceId: root.id, source: 'parfumo', targets: [] }, database)
    expect(await database.aliases.count()).toBe(0)
    expect(await database.dismissals.count()).toBe(0)
    expect(await database.mergeEvents.count()).toBe(1)
  })

  it('rejects undo after a later dismissal without overwriting it', async () => {
    const a = await add('A'), b = await add('B'), c = await add('C')
    const event = await mergeFragrances(a.id, b.id, {}, database)
    await keepSeparate(a.id, c.id, database)
    await expect(undoMerge(event, database)).rejects.toThrow('collection changed')
    expect(await database.dismissals.count()).toBe(1)
  })

  it('rolls back all merge changes if recording history fails', async () => {
    const a = await add('A'), b = await add('B')
    const before = await createBackup(database)
    vi.spyOn(database.mergeEvents, 'add').mockRejectedValueOnce(new Error('Storage failed'))
    await expect(mergeFragrances(a.id, b.id, {}, database)).rejects.toThrow('Storage failed')
    const after = await createBackup(database)
    expect(after.fragrances).toEqual(before.fragrances)
    expect(after.aliases).toEqual([])
    expect(await database.undoCheckpoints.count()).toBe(0)
  })
})

describe('recognized names', () => {
  it('reuses aliases without renaming or overwriting links, promotes ownership, and distinguishes variants', async () => {
    const a = await upsertFragrance({ brand: 'Brand', name: 'Canonical', sourceUrls: { fragrantica: 'https://example.com/canonical' } }, database)
    const b = await add('Old', false)
    await mergeFragrances(a.id, b.id, {}, database)
    const result = await upsertFragrance({ ...b, owned: true, sourceUrls: { fragrantica: 'https://example.com/old', parfumo: 'https://example.com/new' } }, database)
    expect(result).toMatchObject({ id: a.id, name: 'Canonical', owned: true, sourceUrls: { fragrantica: 'https://example.com/canonical', parfumo: 'https://example.com/new' } })
    const variant = await upsertFragrance({ brand: 'Brand', name: 'Old', variant: 'EDT' }, database)
    expect(variant.id).not.toBe(a.id)
    await forgetAlias(identityKey(b), database)
    expect((await add('Old')).id).not.toBe(a.id)
  })

  it('resolves captured aliases and gives explicit selections and current identities precedence', async () => {
    const root = await add('Root'), a = await add('Canonical'), b = await add('Old'), explicit = await add('Explicit')
    await mergeFragrances(a.id, b.id, {}, database)
    const capture = await replaceCapture({ rootFragranceId: root.id, source: 'fragrantica', targets: [{ brand: b.brand, name: b.name }, { ...b, existingId: explicit.id }] }, database)
    expect(capture.observations.map((item) => item.toFragranceId).sort()).toEqual([a.id, explicit.id].sort())
    await database.fragrances.add(b)
    expect((await upsertFragrance(b, database)).id).toBe(b.id)
  })
})

describe('metadata backups and migration', () => {
  it('exports metadata without undo and restores v2 atomically, while accepting v1', async () => {
    const a = await add('A'), b = await add('B'), c = await add('C')
    await keepSeparate(a.id, c.id, database)
    await mergeFragrances(a.id, b.id, {}, database)
    const backup = await createBackup(database)
    expect(backup.schemaVersion).toBe(2)
    expect(backup).not.toHaveProperty('undoCheckpoints')
    expect(validateBackup(backup)).toMatchObject({ dismissalCount: 1, aliasCount: 1, mergeCount: 1 })
    await restoreBackup(JSON.parse(JSON.stringify(backup)), database)
    expect(await database.undoCheckpoints.count()).toBe(0)
    expect((await createBackup(database)).aliases).toEqual(backup.aliases)
    await restoreBackup({ schemaVersion: 1, exportedAt: '', fragrances: backup.fragrances, captures: backup.captures, observations: backup.observations }, database)
    expect(await database.mergeEvents.count()).toBe(0)
    expect(await database.aliases.count()).toBe(0)
    expect(await database.dismissals.count()).toBe(0)
  })

  it('rejects malformed or dangling metadata before replacing data', async () => {
    const a = await add('A'), b = await add('B')
    await mergeFragrances(a.id, b.id, {}, database)
    const backup = await createBackup(database)
    const invalid = { ...backup, aliases: backup.aliases.map((alias) => ({ ...alias, fragranceId: 'missing' })) }
    await expect(restoreBackup(invalid, database)).rejects.toThrow('broken duplicate')
    expect(await database.fragrances.count()).toBe(1)
    expect(() => validateBackup({ ...backup, mergeEvents: [{ ...backup.mergeEvents[0], observationCount: -1 }] })).toThrow('invalid duplicate')
  })

  it('upgrades a version 1 database without changing existing records', async () => {
    const legacy = new Dexie(database.name)
    legacy.version(1).stores({ fragrances: 'id, owned, normalizedBrand, normalizedName, normalizedVariant, [normalizedBrand+normalizedName+normalizedVariant]', captures: 'id, rootFragranceId, source, [rootFragranceId+source], capturedAt', observations: 'id, captureId, fromFragranceId, toFragranceId, source' })
    await legacy.open()
    const record = { id: 'old', brand: 'Brand', name: 'Original' }
    await legacy.table('fragrances').add(record)
    legacy.close()
    await database.open()
    expect(await database.fragrances.get('old')).toEqual(record)
    expect(await database.aliases.count()).toBe(0)
    expect(await database.mergeEvents.count()).toBe(0)
  })
})
