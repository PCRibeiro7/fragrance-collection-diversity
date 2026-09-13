import { db, type ScentMapDatabase } from './db'
import { identityKey } from '../domain/identity'
import type { Fragrance, FragranceAlias, FragranceInput, RecoveryState } from '../domain/types'

export function dismissalKey(leftId: string, rightId: string): string {
  return JSON.stringify([leftId, rightId].sort())
}

export async function keepSeparate(leftId: string, rightId: string, database: ScentMapDatabase = db): Promise<void> {
  await database.transaction('rw', database.fragrances, database.dismissals, async () => {
    const [left, right] = await database.fragrances.bulkGet([leftId, rightId])
    if (!left || !right || leftId === rightId) throw new Error('These fragrances are no longer available for review.')
    await database.dismissals.put({ id: dismissalKey(leftId, rightId), leftId, rightId, left, right, dismissedAt: new Date().toISOString() })
  })
}

export async function reviewAgain(id: string, database: ScentMapDatabase = db): Promise<void> {
  await database.dismissals.delete(id)
}

export async function forgetAlias(id: string, database: ScentMapDatabase = db): Promise<void> {
  await database.aliases.delete(id)
}

export function resolveKnownIdentity(input: FragranceInput, fragrances: Fragrance[], aliases: FragranceAlias[]): Fragrance | undefined {
  const key = identityKey(input)
  return fragrances.find((item) => identityKey(item) === key) ??
    fragrances.find((item) => item.id === aliases.find((alias) => alias.id === key)?.fragranceId)
}

// Call within the same transaction that deletes fragrances, including orphan cleanup.
export async function cleanupReviewReferences(database: ScentMapDatabase): Promise<void> {
  const ids = new Set(await database.fragrances.toCollection().primaryKeys())
  await database.aliases.filter((item) => !ids.has(item.fragranceId)).delete()
  await database.dismissals.filter((item) => !ids.has(item.leftId) || !ids.has(item.rightId)).delete()
}

export async function readRecoveryState(database: ScentMapDatabase): Promise<RecoveryState> {
  const [fragrances, captures, observations, dismissals, aliases] = await Promise.all([
    database.fragrances.toArray(), database.captures.toArray(), database.observations.toArray(),
    database.dismissals.toArray(), database.aliases.toArray(),
  ])
  return { fragrances, captures, observations, dismissals, aliases }
}

export function stateFingerprint(state: RecoveryState): string {
  // Sort records and object keys so export/import serialization order cannot affect equality.
  function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => [key, canonical(v)]))
    return value
  }
  return JSON.stringify(canonical(Object.fromEntries(Object.entries(state).map(([key, records]) => [key, [...records].sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id))]))))
}

export async function writeRecoveryState(state: RecoveryState, database: ScentMapDatabase): Promise<void> {
  await database.observations.clear()
  await database.captures.clear()
  await database.fragrances.clear()
  await database.aliases.clear()
  await database.dismissals.clear()
  await database.fragrances.bulkAdd(state.fragrances)
  await database.captures.bulkAdd(state.captures)
  await database.observations.bulkAdd(state.observations)
  await database.dismissals.bulkAdd(state.dismissals)
  await database.aliases.bulkAdd(state.aliases)
}
