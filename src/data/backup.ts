import { db, type ScentMapDatabase } from './db'
import type { BackupV1, Fragrance, SimilarityObservation, SourceCapture } from '../domain/types'

export interface BackupPreview {
  backup: BackupV1
  fragranceCount: number
  ownedCount: number
  captureCount: number
  observationCount: number
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

export async function createBackup(database: ScentMapDatabase = db): Promise<BackupV1> {
  const [fragrances, captures, observations] = await Promise.all([
    database.fragrances.toArray(),
    database.captures.toArray(),
    database.observations.toArray(),
  ])
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    fragrances,
    captures,
    observations,
  }
}

export function validateBackup(value: unknown): BackupPreview {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error('This is not a supported Scent Map backup (schema version 1 required).')
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

  const backup = value as unknown as BackupV1
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

  return {
    backup,
    fragranceCount: backup.fragrances.length,
    ownedCount: backup.fragrances.filter((item) => item.owned).length,
    captureCount: backup.captures.length,
    observationCount: backup.observations.length,
  }
}

export async function restoreBackup(
  backup: BackupV1,
  database: ScentMapDatabase = db,
): Promise<void> {
  validateBackup(backup)
  await database.transaction(
    'rw',
    database.fragrances,
    database.captures,
    database.observations,
    async () => {
      await database.observations.clear()
      await database.captures.clear()
      await database.fragrances.clear()
      await database.fragrances.bulkAdd(backup.fragrances)
      await database.captures.bulkAdd(backup.captures)
      await database.observations.bulkAdd(backup.observations)
    },
  )
}
