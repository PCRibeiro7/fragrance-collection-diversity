import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ScentMapDatabase } from './db'
import { upsertFragrance } from './repository'
import { readDatabaseSnapshot } from './useDatabaseSnapshot'

let database: ScentMapDatabase

beforeEach(() => {
  database = new ScentMapDatabase(`snapshot-test-${crypto.randomUUID()}`)
})

afterEach(async () => {
  await database.delete()
})

describe('database snapshot', () => {
  it('returns a newly added fragrance without requiring a createdAt index', async () => {
    const added = await upsertFragrance(
      { brand: 'Diptyque', name: 'Philosykos', owned: true },
      database,
    )

    const snapshot = await readDatabaseSnapshot(database)

    expect(snapshot.loading).toBe(false)
    expect(snapshot.fragrances).toEqual([added])
  })
})
