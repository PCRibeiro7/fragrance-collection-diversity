import type { FragranceInput, SimilaritySource } from './types'
import { identityKey } from './identity'
import type { ParsedSimilarityLine } from './parser'

export interface FragrancePageImport {
  source: SimilaritySource
  pageUrl: string
  fragrance: FragranceInput
  similarities: FragranceInput[]
  completeness: 'complete' | 'partial' | 'unknown'
  advertisedTotal?: number
  warnings: string[]
  upstreamStatus?: number
  captureMethod?: 'browser'
}

export type FragranceBrowserCapture = {
  version: 1
  pageUrl: string
  capturedAt: string
  identityHtml: string
  similarityHtml: string
} & ({ format: 'scent-map-fragrance-capture'; source: SimilaritySource }
  | { format: 'scent-map-fragrantica-capture'; source?: 'fragrantica' })

export type FragranceImportErrorCode =
  | 'invalid_request' | 'method_not_allowed' | 'unsupported_url'
  | 'blocked' | 'challenge' | 'rate_limited' | 'timeout'
  | 'too_large' | 'redirect_limit' | 'network_error' | 'upstream_error' | 'parse_failed'

export interface FragranceImportFailure {
  code: FragranceImportErrorCode
  message: string
  source?: SimilaritySource
  pageUrl?: string
  upstreamStatus?: number
}

export type FragranceImportResponse =
  | { ok: true; result: FragrancePageImport }
  | { ok: false; error: FragranceImportFailure }

export function importedSimilarityRows(result: FragrancePageImport): ParsedSimilarityLine[] {
  return result.similarities.map((item, index) => ({
    id: `${index}-${identityKey(item)}`,
    raw: `${item.brand} | ${item.name}${item.variant ? ` (${item.variant})` : ''}`,
    brand: item.brand,
    name: item.name,
    variant: item.variant ?? '',
  }))
}
