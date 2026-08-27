import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { db } from './db'
import type { Fragrance, SimilarityObservation, SourceCapture } from '../domain/types'

export interface DatabaseSnapshot {
  fragrances: Fragrance[]
  captures: SourceCapture[]
  observations: SimilarityObservation[]
  loading: boolean
}

const initialSnapshot: DatabaseSnapshot = {
  fragrances: [],
  captures: [],
  observations: [],
  loading: true,
}

export function useDatabaseSnapshot(): DatabaseSnapshot {
  const [snapshot, setSnapshot] = useState(initialSnapshot)

  useEffect(() => {
    const subscription = liveQuery(async () => {
      const [fragrances, captures, observations] = await Promise.all([
        db.fragrances.orderBy('createdAt').toArray(),
        db.captures.toArray(),
        db.observations.toArray(),
      ])
      return { fragrances, captures, observations, loading: false }
    }).subscribe({
      next: setSnapshot,
      error: (error) => {
        console.error(error)
        setSnapshot((current) => ({ ...current, loading: false }))
      },
    })

    return () => subscription.unsubscribe()
  }, [])

  return snapshot
}
