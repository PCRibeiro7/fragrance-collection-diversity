import { cleanupReviewReferences } from './duplicateDecisions'
import { db, type ScentMapDatabase } from './db'
import { fragranceIdentityKey, identityKey, normalizeFragranceInput } from '../domain/identity'
import type {
  CaptureTargetInput,
  Fragrance,
  FragranceInput,
  ReplaceCaptureInput,
  SimilarityObservation,
  SourceCapture,
} from '../domain/types'

function uuid(): string {
  return crypto.randomUUID()
}

function cleanInput(input: FragranceInput): FragranceInput {
  return {
    ...input,
    brand: input.brand.trim(),
    name: input.name.trim(),
    variant: input.variant?.trim() || undefined,
    sourceUrls: {
      fragrantica: input.sourceUrls?.fragrantica?.trim() || undefined,
      parfumo: input.sourceUrls?.parfumo?.trim() || undefined,
    },
  }
}

export async function upsertFragrance(
  input: FragranceInput,
  database: ScentMapDatabase = db,
): Promise<Fragrance> {
  return database.transaction('rw', database.fragrances, database.aliases, async () => {
    const clean = cleanInput(input)
    const normalized = normalizeFragranceInput(clean)
    const existing = await database.fragrances
      .where('[normalizedBrand+normalizedName+normalizedVariant]')
      .equals([normalized.normalizedBrand, normalized.normalizedName, normalized.normalizedVariant])
      .first()
    const now = new Date().toISOString()

    const alias = existing ? undefined : await database.aliases.get(identityKey(clean))
    const aliasTarget = alias ? await database.fragrances.get(alias.fragranceId) : undefined
    if (aliasTarget) {
      const updated = { ...aliasTarget, owned: Boolean(aliasTarget.owned || clean.owned),
        sourceUrls: { fragrantica: aliasTarget.sourceUrls.fragrantica || clean.sourceUrls?.fragrantica,
          parfumo: aliasTarget.sourceUrls.parfumo || clean.sourceUrls?.parfumo }, updatedAt: now }
      await database.fragrances.put(updated)
      return updated
    }

    if (existing) {
      const updated: Fragrance = {
        ...existing,
        brand: clean.brand,
        name: clean.name,
        variant: clean.variant,
        owned: Boolean(existing.owned || clean.owned),
        sourceUrls: {
          fragrantica: clean.sourceUrls?.fragrantica || existing.sourceUrls.fragrantica,
          parfumo: clean.sourceUrls?.parfumo || existing.sourceUrls.parfumo,
        },
        ...normalized,
        updatedAt: now,
      }
      await database.fragrances.put(updated)
      return updated
    }

    const fragrance: Fragrance = {
      id: uuid(),
      brand: clean.brand,
      name: clean.name,
      variant: clean.variant,
      owned: clean.owned ?? false,
      sourceUrls: clean.sourceUrls ?? {},
      ...normalized,
      createdAt: now,
      updatedAt: now,
    }
    await database.fragrances.add(fragrance)
    return fragrance
  })
}

async function resolveTarget(
  target: CaptureTargetInput,
  identityMap: Map<string, Fragrance>,
  database: ScentMapDatabase,
): Promise<Fragrance> {
  if (target.existingId) {
    const existing = await database.fragrances.get(target.existingId)
    if (!existing) throw new Error(`The selected fragrance no longer exists: ${target.existingId}`)
    return existing
  }

  const existing = identityMap.get(identityKey(target))
  if (existing) return existing

  const created = await upsertFragrance({ ...target, owned: false }, database)
  identityMap.set(fragranceIdentityKey(created), created)
  return created
}

export async function replaceCapture(
  input: ReplaceCaptureInput,
  database: ScentMapDatabase = db,
): Promise<{ capture: SourceCapture; observations: SimilarityObservation[] }> {
  return database.transaction(
    'rw',
    database.collectionTables,
    async () => {
      const root = await database.fragrances.get(input.rootFragranceId)
      if (!root) throw new Error('The collection fragrance no longer exists.')

      const allFragrances = await database.fragrances.toArray()
      const identityMap = new Map(allFragrances.map((item) => [fragranceIdentityKey(item), item]))
      const targetById = new Map<string, Fragrance>()

      for (const target of input.targets) {
        if (!target.brand.trim() || !target.name.trim()) {
          throw new Error('Every related fragrance needs both a brand and a name.')
        }
        const resolved = await resolveTarget(target, identityMap, database)
        if (resolved.id !== root.id) targetById.set(resolved.id, resolved)
      }

      const previous = await database.captures
        .where('[rootFragranceId+source]')
        .equals([input.rootFragranceId, input.source])
        .toArray()
      const capture: SourceCapture = {
        id: previous[0]?.id ?? uuid(),
        rootFragranceId: input.rootFragranceId,
        source: input.source,
        pageUrl: input.pageUrl?.trim() || undefined,
        capturedAt: new Date().toISOString(),
      }

      for (const item of previous) {
        await database.observations.where('captureId').equals(item.id).delete()
        await database.captures.delete(item.id)
      }
      await database.captures.put(capture)

      const observations = [...targetById.values()].map<SimilarityObservation>((target) => ({
        id: uuid(),
        captureId: capture.id,
        fromFragranceId: root.id,
        toFragranceId: target.id,
        source: input.source,
      }))
      await database.observations.bulkAdd(observations)

      const [currentFragrances, currentObservations, currentCaptures] = await Promise.all([
        database.fragrances.toArray(),
        database.observations.toArray(),
        database.captures.toArray(),
      ])
      const referencedIds = new Set(
        currentObservations.flatMap((observation) => [
          observation.fromFragranceId,
          observation.toFragranceId,
        ]),
      )
      const captureRootIds = new Set(currentCaptures.map((item) => item.rootFragranceId))
      const orphanIds = currentFragrances
        .filter(
          (item) => !item.owned && !referencedIds.has(item.id) && !captureRootIds.has(item.id),
        )
        .map((item) => item.id)
      if (orphanIds.length) await database.fragrances.bulkDelete(orphanIds)

      await cleanupReviewReferences(database)
      return { capture, observations }
    },
  )
}

export async function setOwned(
  fragranceId: string,
  owned: boolean,
  database: ScentMapDatabase = db,
): Promise<void> {
  await database.fragrances.update(fragranceId, {
    owned,
    updatedAt: new Date().toISOString(),
  })
}

export async function saveFragranceWithRelationships(
  input: FragranceInput,
  lists: Omit<ReplaceCaptureInput, 'rootFragranceId'>[],
  database: ScentMapDatabase = db,
): Promise<Fragrance> {
  return database.transaction('rw', database.collectionTables, async () => {
    const fragrance = await upsertFragrance(input, database)
    for (const list of lists) {
      await replaceCapture({ ...list, rootFragranceId: fragrance.id }, database)
    }
    return fragrance
  })
}

export async function deleteFragrance(
  fragranceId: string,
  database: ScentMapDatabase = db,
): Promise<void> {
  await database.transaction('rw', database.collectionTables, async () => {
    const fragrance = await database.fragrances.get(fragranceId)
    if (!fragrance) return
    const relatedIds = new Set<string>()
    if (fragrance.owned) {
      const observations = await database.observations
        .where('fromFragranceId').equals(fragranceId)
        .or('toFragranceId').equals(fragranceId).toArray()
      for (const observation of observations) {
        relatedIds.add(observation.fromFragranceId)
        relatedIds.add(observation.toFragranceId)
      }
      relatedIds.delete(fragranceId)
    }

    await database.observations.where('fromFragranceId').equals(fragranceId).delete()
    await database.observations.where('toFragranceId').equals(fragranceId).delete()
    await database.captures.where('rootFragranceId').equals(fragranceId).delete()
    await database.fragrances.delete(fragranceId)

    if (relatedIds.size) {
      const [related, observations, captures] = await Promise.all([
        database.fragrances.bulkGet([...relatedIds]),
        database.observations.toArray(),
        database.captures.toArray(),
      ])
      const referencedIds = new Set(observations.flatMap((item) => [item.fromFragranceId, item.toFragranceId]))
      const captureRootIds = new Set(captures.map((item) => item.rootFragranceId))
      const orphanIds = related.flatMap((item) =>
        item && !item.owned && !referencedIds.has(item.id) && !captureRootIds.has(item.id) ? [item.id] : [],
      )
      await database.fragrances.bulkDelete(orphanIds)
    }
    await cleanupReviewReferences(database)
  })
}
