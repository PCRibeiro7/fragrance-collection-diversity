import Dexie, { type EntityTable } from 'dexie'
import type { Fragrance, SimilarityObservation, SourceCapture, DuplicateDismissal, FragranceAlias, MergeEvent, UndoCheckpoint } from '../domain/types'

export class ScentMapDatabase extends Dexie {
  fragrances!: EntityTable<Fragrance, 'id'>
  captures!: EntityTable<SourceCapture, 'id'>
  observations!: EntityTable<SimilarityObservation, 'id'>

  dismissals!: EntityTable<DuplicateDismissal, 'id'>
  aliases!: EntityTable<FragranceAlias, 'id'>
  mergeEvents!: EntityTable<MergeEvent, 'id'>
  undoCheckpoints!: EntityTable<UndoCheckpoint, 'id'>

  get collectionTables() { return [this.fragrances, this.captures, this.observations, this.dismissals, this.aliases] }
  get allTables() { return [...this.collectionTables, this.mergeEvents, this.undoCheckpoints] }

  constructor(name = 'scent-map') {
    super(name)
    this.version(1).stores({
      fragrances:
        'id, owned, normalizedBrand, normalizedName, normalizedVariant, [normalizedBrand+normalizedName+normalizedVariant]',
      captures: 'id, rootFragranceId, source, [rootFragranceId+source], capturedAt',
      observations: 'id, captureId, fromFragranceId, toFragranceId, source',
    })
    this.version(2).stores({
      dismissals: 'id, leftId, rightId',
      aliases: 'id, fragranceId, mergeEventId',
      mergeEvents: 'id, mergedAt, currentSurvivorId',
      undoCheckpoints: 'id',
    })
  }
}

export const db = new ScentMapDatabase()
