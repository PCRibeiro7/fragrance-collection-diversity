import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { db, type ScentMapDatabase } from './db'
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

export async function readDatabaseSnapshot(
  database: ScentMapDatabase = db,
): Promise<DatabaseSnapshot> {
  const [fragrances, captures, observations] = await Promise.all([
    database.fragrances.toArray(),
    database.captures.toArray(),
    database.observations.toArray(),
  ])

  fragrances.sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
  )

  return { fragrances, captures, observations, loading: false }
}

export function useDatabaseSnapshot(): DatabaseSnapshot {
  const [snapshot, setSnapshot] = useState(initialSnapshot)

  useEffect(() => {
    const subscription = liveQuery(() => readDatabaseSnapshot()).subscribe({
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
