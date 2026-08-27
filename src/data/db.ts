import Dexie, { type EntityTable } from 'dexie'
import type { Fragrance, SimilarityObservation, SourceCapture } from '../domain/types'

export class ScentMapDatabase extends Dexie {
  fragrances!: EntityTable<Fragrance, 'id'>
  captures!: EntityTable<SourceCapture, 'id'>
  observations!: EntityTable<SimilarityObservation, 'id'>

  constructor(name = 'scent-map') {
    super(name)
    this.version(1).stores({
      fragrances:
        'id, owned, normalizedBrand, normalizedName, normalizedVariant, [normalizedBrand+normalizedName+normalizedVariant]',
      captures: 'id, rootFragranceId, source, [rootFragranceId+source], capturedAt',
      observations: 'id, captureId, fromFragranceId, toFragranceId, source',
    })
  }
}

export const db = new ScentMapDatabase()
