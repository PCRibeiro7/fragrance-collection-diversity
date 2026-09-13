import { db, type ScentMapDatabase } from './db'
import { dismissalKey, readRecoveryState, writeRecoveryState } from './duplicateDecisions'
import { identityKey } from '../domain/identity'
import type { BackupV1, BackupV2, DuplicateDismissal, FragranceAlias, MergeEvent, Fragrance, SimilarityObservation, SourceCapture } from '../domain/types'

export interface BackupPreview {
  backup: BackupV2
  fragranceCount: number
  ownedCount: number
  captureCount: number
  observationCount: number
  dismissalCount: number
  aliasCount: number
  mergeCount: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isString(value)
}

function isFragrance(value: unknown): value is Fragrance {
  if (!isRecord(value)) return false
  return (
    isString(value.id) &&
    isString(value.brand) &&
    isString(value.name) &&
    isOptionalString(value.variant) &&
    typeof value.owned === 'boolean' &&
    isRecord(value.sourceUrls) &&
    isOptionalString(value.sourceUrls.fragrantica) &&
    isOptionalString(value.sourceUrls.parfumo) &&
    isString(value.normalizedBrand) &&
    isString(value.normalizedName) &&
    isString(value.normalizedVariant) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  )
}

function isCapture(value: unknown): value is SourceCapture {
  if (!isRecord(value)) return false
  return (
    isString(value.id) &&
    isString(value.rootFragranceId) &&
    (value.source === 'fragrantica' || value.source === 'parfumo') &&
    isOptionalString(value.pageUrl) &&
    isString(value.capturedAt)
  )
}

function isObservation(value: unknown): value is SimilarityObservation {
  if (!isRecord(value)) return false
  return (
    isString(value.id) &&
    isString(value.captureId) &&
    isString(value.fromFragranceId) &&
    isString(value.toFragranceId) &&
    (value.source === 'fragrantica' || value.source === 'parfumo')
  )
}

function isDismissal(value: unknown): value is DuplicateDismissal {
  return isRecord(value) && isString(value.id) && isString(value.leftId) && isString(value.rightId) &&
    isFragrance(value.left) && isFragrance(value.right) && isString(value.dismissedAt) &&
    value.left.id === value.leftId && value.right.id === value.rightId && value.leftId !== value.rightId &&
    value.id === dismissalKey(value.leftId, value.rightId)
}

function isAlias(value: unknown): value is FragranceAlias {
  return isRecord(value) && isString(value.id) && isString(value.fragranceId) && isString(value.mergeEventId) &&
    isRecord(value.identity) && isString(value.identity.brand) && isString(value.identity.name) && isOptionalString(value.identity.variant) &&
    value.id === identityKey({ brand: value.identity.brand, name: value.identity.name, variant: value.identity.variant })
}

function isMergeEvent(value: unknown): value is MergeEvent {
  return isRecord(value) && isString(value.id) && isString(value.mergedAt) && isOptionalString(value.undoneAt) &&
    isFragrance(value.kept) && isFragrance(value.removed) && isFragrance(value.result) && isString(value.currentSurvivorId) &&
    value.kept.id !== value.removed.id && value.result.id === value.kept.id &&
    Number.isInteger(value.captureCount) && Number(value.captureCount) >= 0 &&
    Number.isInteger(value.observationCount) && Number(value.observationCount) >= 0
}

export async function createBackup(database: ScentMapDatabase = db): Promise<BackupV2> {
  return database.transaction('r', database.allTables, async () => ({
    schemaVersion: 2, exportedAt: new Date().toISOString(), ...await readRecoveryState(database),
    mergeEvents: await database.mergeEvents.toArray(),
  }))
}

export function validateBackup(value: unknown): BackupPreview {
  if (!isRecord(value) || (value.schemaVersion !== 1 && value.schemaVersion !== 2)) {
    throw new Error('This is not a supported Scent Map backup (schema version 1 or 2 required).')
  }
  if (
    !Array.isArray(value.fragrances) ||
    !value.fragrances.every(isFragrance) ||
    !Array.isArray(value.captures) ||
    !value.captures.every(isCapture) ||
    !Array.isArray(value.observations) ||
    !value.observations.every(isObservation) ||
    !isString(value.exportedAt)
  ) {
    throw new Error('The backup is incomplete or contains invalid records.')
  }

  if (value.schemaVersion === 2 && (
    !Array.isArray(value.dismissals) || !value.dismissals.every(isDismissal) ||
    !Array.isArray(value.aliases) || !value.aliases.every(isAlias) ||
    !Array.isArray(value.mergeEvents) || !value.mergeEvents.every(isMergeEvent)
  )) throw new Error('The backup contains invalid duplicate review metadata.')
  const backup: BackupV2 = value.schemaVersion === 1
    ? { ...(value as unknown as BackupV1), schemaVersion: 2, dismissals: [], aliases: [], mergeEvents: [] }
    : value as unknown as BackupV2
  const fragranceIds = new Set(backup.fragrances.map((item) => item.id))
  const captureIds = new Set(backup.captures.map((item) => item.id))
  const capturesById = new Map(backup.captures.map((item) => [item.id, item]))
  if (
    fragranceIds.size !== backup.fragrances.length ||
    captureIds.size !== backup.captures.length ||
    new Set(backup.observations.map((item) => item.id)).size !== backup.observations.length ||
    backup.captures.some((item) => !fragranceIds.has(item.rootFragranceId)) ||
    backup.observations.some(
      (item) => {
        const capture = capturesById.get(item.captureId)
        return !capture ||
        !fragranceIds.has(item.fromFragranceId) ||
        !fragranceIds.has(item.toFragranceId) ||
        item.fromFragranceId !== capture.rootFragranceId ||
        item.source !== capture.source
      },
    )
  ) {
    throw new Error('The backup contains broken fragrance or capture references.')
  }

  const eventIds = new Set(backup.mergeEvents.map((item) => item.id))
  if (eventIds.size !== backup.mergeEvents.length ||
    new Set(backup.dismissals.map((item) => item.id)).size !== backup.dismissals.length ||
    new Set(backup.aliases.map((item) => item.id)).size !== backup.aliases.length ||
    backup.dismissals.some((item) => !fragranceIds.has(item.leftId) || !fragranceIds.has(item.rightId)) ||
    backup.aliases.some((item) => !fragranceIds.has(item.fragranceId) || !eventIds.has(item.mergeEventId) || backup.mergeEvents.find((event) => event.id === item.mergeEventId)?.undoneAt)
  ) throw new Error('The backup contains broken duplicate review references.')

  return {
    backup,
    fragranceCount: backup.fragrances.length,
    ownedCount: backup.fragrances.filter((item) => item.owned).length,
    captureCount: backup.captures.length,
    observationCount: backup.observations.length,
    dismissalCount: backup.dismissals.length, aliasCount: backup.aliases.length, mergeCount: backup.mergeEvents.length,
  }
}

export async function restoreBackup(backup: BackupV1 | BackupV2, database: ScentMapDatabase = db): Promise<void> {
  const validated = validateBackup(backup).backup
  await database.transaction('rw', database.allTables, async () => {
    await writeRecoveryState(validated, database)
    await database.mergeEvents.clear()
    await database.mergeEvents.bulkAdd(validated.mergeEvents)
    await database.undoCheckpoints.clear()
  })
}
