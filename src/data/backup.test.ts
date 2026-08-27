import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createBackup, restoreBackup, validateBackup } from './backup'
import { ScentMapDatabase } from './db'
import { replaceCapture, upsertFragrance } from './repository'

let source: ScentMapDatabase
let destination: ScentMapDatabase

beforeEach(() => {
  source = new ScentMapDatabase(`backup-source-${crypto.randomUUID()}`)
  destination = new ScentMapDatabase(`backup-destination-${crypto.randomUUID()}`)
})

afterEach(async () => {
  await source.delete()
  await destination.delete()
})

describe('backup and restore', () => {
  it('round-trips all records through a validated versioned backup', async () => {
    const root = await upsertFragrance({ brand: 'Maison', name: 'Root', owned: true }, source)
    await replaceCapture({
      rootFragranceId: root.id,
      source: 'fragrantica',
      targets: [{ brand: 'Maison', name: 'Neighbor' }],
    }, source)

    const backup = await createBackup(source)
    const preview = validateBackup(JSON.parse(JSON.stringify(backup)))
    await restoreBackup(preview.backup, destination)

    expect(preview).toMatchObject({ fragranceCount: 2, ownedCount: 1, captureCount: 1, observationCount: 1 })
    expect(await destination.fragrances.toArray()).toEqual(await source.fragrances.toArray())
    expect(await destination.captures.toArray()).toEqual(await source.captures.toArray())
    expect(await destination.observations.toArray()).toEqual(await source.observations.toArray())
  })

  it('rejects broken references before touching the database', async () => {
    const invalid = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      fragrances: [],
      captures: [],
      observations: [{
        id: 'o', captureId: 'missing', fromFragranceId: 'a', toFragranceId: 'b', source: 'parfumo',
      }],
    }
    expect(() => validateBackup(invalid)).toThrow(/broken/i)
  })
})
