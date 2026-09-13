import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { db, type ScentMapDatabase } from './db'
import { readRecoveryState, stateFingerprint } from './duplicateDecisions'
import type { DuplicateDismissal, FragranceAlias, MergeEvent } from '../domain/types'

export interface DuplicateReviewState {
  dismissals: DuplicateDismissal[]
  aliases: FragranceAlias[]
  mergeEvents: MergeEvent[]
  undoEventId?: string
  canUndo: boolean
  loading: boolean
  error: string
}

export async function readDuplicateReviewState(database: ScentMapDatabase = db): Promise<DuplicateReviewState> {
  return database.transaction('r', database.allTables, async () => {
    const state = await readRecoveryState(database)
    const checkpoint = await database.undoCheckpoints.get('latest')
    const mergeEvents = await database.mergeEvents.toArray()
    return { dismissals: state.dismissals, aliases: state.aliases,
      mergeEvents: mergeEvents.sort((a, b) => b.mergedAt.localeCompare(a.mergedAt) || a.id.localeCompare(b.id)),
      undoEventId: checkpoint?.mergeEventId,
      canUndo: Boolean(checkpoint && stateFingerprint(state) === checkpoint.afterFingerprint), loading: false, error: '' }
  })
}

export function useDuplicateReviewState(): DuplicateReviewState {
  const [state, setState] = useState<DuplicateReviewState>({ dismissals: [], aliases: [], mergeEvents: [], canUndo: false, loading: true, error: '' })
  useEffect(() => {
    const subscription = liveQuery(() => readDuplicateReviewState()).subscribe({
      next: setState,
      error: (error) => setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : 'Could not load duplicate review history.' })),
    })
    return () => subscription.unsubscribe()
  }, [])
  return state
}
