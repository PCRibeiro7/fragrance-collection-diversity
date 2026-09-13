export type SimilaritySource = 'fragrantica' | 'parfumo'

export interface SourceUrls {
  fragrantica?: string
  parfumo?: string
}

export interface Fragrance {
  id: string
  brand: string
  name: string
  variant?: string
  owned: boolean
  sourceUrls: SourceUrls
  normalizedBrand: string
  normalizedName: string
  normalizedVariant: string
  createdAt: string
  updatedAt: string
}

export interface SourceCapture {
  id: string
  rootFragranceId: string
  source: SimilaritySource
  pageUrl?: string
  capturedAt: string
}

export interface SimilarityObservation {
  id: string
  captureId: string
  fromFragranceId: string
  toFragranceId: string
  source: SimilaritySource
}

export interface BackupV1 {
  schemaVersion: 1
  exportedAt: string
  fragrances: Fragrance[]
  captures: SourceCapture[]
  observations: SimilarityObservation[]
}

export interface FragranceInput {
  brand: string
  name: string
  variant?: string
  owned?: boolean
  sourceUrls?: SourceUrls
}

export interface CaptureTargetInput extends FragranceInput {
  existingId?: string
}

export interface ReplaceCaptureInput {
  rootFragranceId: string
  source: SimilaritySource
  pageUrl?: string
  targets: CaptureTargetInput[]
}

export interface AggregatedEvidence {
  source: SimilaritySource
  fromFragranceId: string
  toFragranceId: string
}

export interface AggregatedEdge {
  id: string
  sourceId: string
  targetId: string
  weight: number
  evidence: AggregatedEvidence[]
}

export interface GraphModel {
  nodes: Array<Fragrance & { cluster: number }>
  edges: AggregatedEdge[]
  clusters: number[]
}

export type SelectedGraphItem =
  | { type: 'node'; id: string }
  | { type: 'edge'; id: string }
  | null

export interface DuplicateDismissal {
  id: string
  leftId: string
  rightId: string
  left: Fragrance
  right: Fragrance
  dismissedAt: string
}

export interface FragranceAlias {
  id: string
  identity: Pick<Fragrance, 'brand' | 'name' | 'variant'>
  fragranceId: string
  mergeEventId: string
}

export interface MergeEvent {
  id: string
  mergedAt: string
  undoneAt?: string
  kept: Fragrance
  removed: Fragrance
  result: Fragrance
  currentSurvivorId: string
  captureCount: number
  observationCount: number
}

export interface RecoveryState {
  fragrances: Fragrance[]
  captures: SourceCapture[]
  observations: SimilarityObservation[]
  dismissals: DuplicateDismissal[]
  aliases: FragranceAlias[]
}

export interface UndoCheckpoint {
  id: 'latest'
  mergeEventId: string
  before: RecoveryState
  afterFingerprint: string
  previousHistoryTargets: Array<{ id: string; currentSurvivorId: string }>
}

export interface BackupV2 extends RecoveryState {
  schemaVersion: 2
  exportedAt: string
  mergeEvents: MergeEvent[]
}
