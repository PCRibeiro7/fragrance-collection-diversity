import { db, type ScentMapDatabase } from './db'
import { dismissalKey, readRecoveryState, writeRecoveryState, stateFingerprint } from './duplicateDecisions'
import { normalizeFragranceInput, identityKey } from '../domain/identity'
import type { MergeEvent, SourceUrls } from '../domain/types'

export async function mergeFragrances(
  keepId: string, removeId: string, choices: SourceUrls = {}, database: ScentMapDatabase = db,
): Promise<string> {
  return database.transaction('rw', database.allTables, async () => {
    if (keepId === removeId) throw new Error('Choose two different fragrances.')
    const before = await readRecoveryState(database)
    const keep = before.fragrances.find((item) => item.id === keepId)
    const remove = before.fragrances.find((item) => item.id === removeId)
    if (!keep || !remove) throw new Error('A fragrance no longer exists. Scan again.')
    const sourceUrls: SourceUrls = {}
    for (const source of ['fragrantica', 'parfumo'] as const) {
      const a = keep.sourceUrls[source], b = remove.sourceUrls[source]
      if (a && b && a !== b && choices[source] !== a && choices[source] !== b) {
        throw new Error(`Choose the ${source} URL to keep.`)
      }
      sourceUrls[source] = choices[source] === a || choices[source] === b ? choices[source] || a || b : a || b
    }
    const result = { ...keep, ...normalizeFragranceInput(keep), owned: keep.owned || remove.owned, sourceUrls, updatedAt: new Date().toISOString() }
    await database.fragrances.put(result)
    // Preserve individual captures and their dates/page URLs as evidence provenance.
    for (const capture of before.captures) {
      if (capture.rootFragranceId === removeId) await database.captures.put({ ...capture, rootFragranceId: keepId })
    }
    const seen = new Set<string>()
    for (const observation of before.observations) {
      if (![observation.fromFragranceId, observation.toFragranceId].some((id) => id === keepId || id === removeId)) continue
      const updated = { ...observation,
        fromFragranceId: observation.fromFragranceId === removeId ? keepId : observation.fromFragranceId,
        toFragranceId: observation.toFragranceId === removeId ? keepId : observation.toFragranceId,
      }
      const key = `${updated.captureId}:${updated.fromFragranceId}:${updated.toFragranceId}`
      if (updated.fromFragranceId === updated.toFragranceId || seen.has(key)) await database.observations.delete(updated.id)
      else { seen.add(key); await database.observations.put(updated) }
    }
    await database.fragrances.delete(removeId)
    const event: MergeEvent = {
      id: crypto.randomUUID(), mergedAt: result.updatedAt, kept: keep, removed: remove, result,
      currentSurvivorId: keepId,
      captureCount: before.captures.filter((item) => item.rootFragranceId === keepId || item.rootFragranceId === removeId).length,
      observationCount: before.observations.filter((item) => [item.fromFragranceId, item.toFragranceId].some((id) => id === keepId || id === removeId)).length,
    }
    const previousHistoryTargets = (await database.mergeEvents.where('currentSurvivorId').equals(removeId).toArray())
      .filter((item) => !item.undoneAt).map(({ id, currentSurvivorId }) => ({ id, currentSurvivorId }))
    for (const item of previousHistoryTargets) await database.mergeEvents.update(item.id, { currentSurvivorId: keepId })
    await database.mergeEvents.add(event)
    await database.aliases.where('fragranceId').equals(removeId).modify({ fragranceId: keepId })
    const aliasId = identityKey(remove)
    const priorAlias = await database.aliases.get(aliasId)
    if (priorAlias && priorAlias.fragranceId !== keepId) throw new Error('This previous name already resolves to another fragrance. Stop recognizing that name first.')
    if (aliasId !== identityKey(keep)) await database.aliases.put({ id: aliasId, identity: { brand: remove.brand, name: remove.name, variant: remove.variant }, fragranceId: keepId, mergeEventId: event.id })
    for (const item of before.dismissals) {
      if (item.leftId !== removeId && item.rightId !== removeId) continue
      await database.dismissals.delete(item.id)
      const leftId = item.leftId === removeId ? keepId : item.leftId
      const rightId = item.rightId === removeId ? keepId : item.rightId
      if (leftId !== rightId) await database.dismissals.put({ ...item, id: dismissalKey(leftId, rightId), leftId, rightId,
        left: item.leftId === removeId ? result : item.left, right: item.rightId === removeId ? result : item.right })
    }
    await database.undoCheckpoints.put({ id: 'latest', mergeEventId: event.id, before,
      afterFingerprint: stateFingerprint(await readRecoveryState(database)), previousHistoryTargets })
    return event.id
  })
}

export async function undoMerge(eventId: string, database: ScentMapDatabase = db): Promise<void> {
  await database.transaction('rw', database.allTables, async () => {
    const checkpoint = await database.undoCheckpoints.get('latest')
    const event = await database.mergeEvents.get(eventId)
    if (!checkpoint || checkpoint.mergeEventId !== eventId || !event || event.undoneAt) throw new Error('Only the latest merge has an undo checkpoint.')
    if (stateFingerprint(await readRecoveryState(database)) !== checkpoint.afterFingerprint) {
      throw new Error('The collection changed after this merge. Undo is unavailable to avoid overwriting newer edits.')
    }
    await writeRecoveryState(checkpoint.before, database)
    for (const item of checkpoint.previousHistoryTargets) await database.mergeEvents.update(item.id, { currentSurvivorId: item.currentSurvivorId })
    await database.mergeEvents.update(eventId, { undoneAt: new Date().toISOString() })
    await database.undoCheckpoints.clear()
  })
}
