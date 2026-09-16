import { ArrowLeft, ArrowRight, Check, Trash2 } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { resolveKnownIdentity } from '../data/duplicateDecisions'
import { saveFragranceWithRelationships } from '../data/repository'
import { useDatabaseSnapshot } from '../data/useDatabaseSnapshot'
import { useDuplicateReviewState } from '../data/useDuplicateReviewState'
import { displayName, identityKey, validateHttpUrl } from '../domain/identity'
import { parseSimilarityList, similarityScore, type ParsedSimilarityLine } from '../domain/parser'
import type { Fragrance, FragranceAlias, SimilaritySource } from '../domain/types'
import { Modal } from './Modal'

interface AddFragranceDialogProps {
  onClose: () => void
  onSaved?: (id: string) => void
}

interface ReviewRow extends ParsedSimilarityLine {
  existingId: string
  suggestions: Fragrance[]
}

type ReviewRows = Record<SimilaritySource, ReviewRow[]>

const SOURCES = ['fragrantica', 'parfumo'] as const

function sourceLabel(source: SimilaritySource): string {
  return source === 'fragrantica' ? 'Fragrantica' : 'Parfumo'
}

function findSuggestions(
  row: Pick<ReviewRow, 'brand' | 'name' | 'variant'>,
  fragrances: Fragrance[],
  aliases: FragranceAlias[],
): { exact?: Fragrance; suggestions: Fragrance[] } {
  const exact = row.brand ? resolveKnownIdentity(row, fragrances, aliases) : undefined
  const query = `${row.brand} ${row.name} ${row.variant}`.trim()
  const suggestions = fragrances
    .map((item) => ({ item, score: similarityScore(query, `${item.brand} ${item.name} ${item.variant ?? ''}`) }))
    .filter(({ item, score }) => item.id !== exact?.id && score >= 0.52)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map(({ item }) => item)
  return { exact, suggestions }
}

export function AddFragranceDialog({ onClose, onSaved }: AddFragranceDialogProps) {
  const reviewState = useDuplicateReviewState()
  const snapshot = useDatabaseSnapshot()
  const [brand, setBrand] = useState('')
  const [name, setName] = useState('')
  const [variant, setVariant] = useState('')
  const [fragranticaUrl, setFragranticaUrl] = useState('')
  const [parfumoUrl, setParfumoUrl] = useState('')
  const [lists, setLists] = useState<Record<SimilaritySource, { text: string; rows: ParsedSimilarityLine[] }>>({
    fragrantica: { text: '', rows: [] }, parfumo: { text: '', rows: [] },
  })
  const [reviewRows, setReviewRows] = useState<ReviewRows | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const resolved = resolveKnownIdentity({ brand, name, variant }, snapshot.fragrances, reviewState.aliases)
  const fragranceById = useMemo(
    () => new Map(snapshot.fragrances.map((fragrance) => [fragrance.id, fragrance])),
    [snapshot.fragrances],
  )
  const allReviewRows = reviewRows ? SOURCES.flatMap((source) => reviewRows[source]) : []
  const reviewedSources = reviewRows ? SOURCES.filter((source) => lists[source].rows.length > 0) : []

  function validateDetails(): boolean {
    setError('')
    if (!brand.trim() || !name.trim()) {
      setError('Brand and fragrance name are required.')
      return false
    }
    if (!validateHttpUrl(fragranticaUrl) || !validateHttpUrl(parfumoUrl)) {
      setError('Source links must be valid http or https URLs.')
      return false
    }
    const unparsedSource = SOURCES.find((source) => lists[source].text.trim() && !lists[source].rows.length)
    if (unparsedSource) {
      setError(`Add at least one recognizable ${sourceLabel(unparsedSource)} relationship or clear that list.`)
      return false
    }
    return true
  }

  function beginReview(event: FormEvent) {
    event.preventDefault()
    if (!validateDetails()) return

    if (!SOURCES.some((source) => lists[source].rows.length > 0)) {
      void save({ fragrantica: [], parfumo: [] })
      return
    }

    setReviewRows(Object.fromEntries(SOURCES.map((source) => [
      source,
      lists[source].rows.map((row) => {
        const matches = findSuggestions(row, snapshot.fragrances, reviewState.aliases)
        return { ...row, existingId: matches.exact?.id ?? '', suggestions: matches.suggestions }
      }),
    ])) as ReviewRows)
  }

  function updateRow(source: SimilaritySource, id: string, patch: Partial<ReviewRow>) {
    setReviewRows((current) => {
      if (!current) return null
      return {
        ...current,
        [source]: current[source].map((row) => {
          if (row.id !== id) return row
          const updated = { ...row, ...patch }
          if ('brand' in patch || 'name' in patch || 'variant' in patch) {
            const matches = findSuggestions(updated, snapshot.fragrances, reviewState.aliases)
            updated.existingId = matches.exact?.id ?? ''
            updated.suggestions = matches.suggestions
          }
          return updated
        }),
      }
    })
  }

  function removeRow(source: SimilaritySource, id: string) {
    if (saving) return
    setReviewRows((current) => current ? {
      ...current,
      [source]: current[source].filter((row) => row.id !== id),
    } : null)
    setError('')
  }

  async function save(rows: ReviewRows) {
    if (saving) return
    const rowsToSave = SOURCES.flatMap((source) => rows[source])
    if (rowsToSave.some((row) => !row.brand.trim() || !row.name.trim())) {
      setError('Complete the brand and fragrance name on every row.')
      return
    }

    try {
      setSaving(true)
      setError('')
      const fragrance = await saveFragranceWithRelationships({
        brand,
        name,
        variant,
        owned: true,
        sourceUrls: { fragrantica: fragranticaUrl, parfumo: parfumoUrl },
      }, SOURCES.filter((source) => lists[source].rows.length > 0).map((source) => ({
        source,
        pageUrl: source === 'fragrantica' ? fragranticaUrl : parfumoUrl,
        targets: rows[source].map((row) => ({
          brand: row.brand,
          name: row.name,
          variant: row.variant,
          existingId: row.existingId || undefined,
        })),
      })))
      onSaved?.(fragrance.id)
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this fragrance.')
    } finally {
      setSaving(false)
    }
  }

  function effectiveIdentity(row: ReviewRow): string {
    const selected = row.existingId ? fragranceById.get(row.existingId) : undefined
    return selected ? identityKey(selected) : identityKey(row)
  }

  const addedRows = reviewRows ? reviewedSources.flatMap((source) => {
    const currentKeys = new Set(snapshot.observations
      .filter((item) => item.fromFragranceId === resolved?.id && item.source === source)
      .flatMap((item) => {
        const fragrance = fragranceById.get(item.toFragranceId)
        return fragrance ? [identityKey(fragrance)] : []
      }))
    return reviewRows[source].filter((row) => !currentKeys.has(effectiveIdentity(row)))
  }) : []

  const removedItems = reviewRows && resolved ? reviewedSources.flatMap((source) => {
    const proposedKeys = new Set(reviewRows[source].map(effectiveIdentity))
    return snapshot.observations
      .filter((item) => item.fromFragranceId === resolved.id && item.source === source)
      .flatMap((item) => {
        const fragrance = fragranceById.get(item.toFragranceId)
        return fragrance && !proposedKeys.has(identityKey(fragrance)) ? [fragrance] : []
      })
  }) : []

  const totalParsed = SOURCES.reduce((total, source) => total + lists[source].rows.length, 0)
  const footer = reviewRows ? (
    <>
      <button className="button button--quiet" type="button" disabled={saving} onClick={() => {
        setReviewRows(null)
        setError('')
      }}>
        <ArrowLeft size={16} /> Back
      </button>
      <button className="button button--primary" type="button" disabled={saving || allReviewRows.length === 0} onClick={() => save(reviewRows)}>
        <Check size={16} /> {saving ? 'Saving…' : 'Save fragrance and relationships'}
      </button>
    </>
  ) : (
    <>
      <button className="button button--quiet" type="button" onClick={onClose}>Cancel</button>
      <button className="button button--primary" type="submit" form="add-fragrance" disabled={saving || reviewState.loading || snapshot.loading || Boolean(reviewState.error)}>
        {saving ? 'Saving…' : totalParsed ? <>Review {totalParsed} {totalParsed === 1 ? 'match' : 'matches'} <ArrowRight size={16} /></> : 'Save fragrance'}
      </button>
    </>
  )

  return (
    <Modal
      title={reviewRows ? 'Review identity matches' : 'Add to your collection'}
      eyebrow={reviewRows ? displayName({ brand, name, variant }) : 'Owned fragrance'}
      onClose={onClose}
      wide
      footer={footer}
    >
      {!reviewRows ? (
        <form id="add-fragrance" className="form-stack add-fragrance-form" onSubmit={beginReview}>
          {resolved && <p role="status">Will reuse {displayName(resolved)}. Its existing name and source links are retained when matching a previously merged name.</p>}
          <div className="field-row">
            <label className="field">
              <span>Brand</span>
              <input autoFocus value={brand} onChange={(event) => setBrand(event.target.value)} placeholder="Diptyque" />
            </label>
            <label className="field field--grow">
              <span>Fragrance name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Philosykos" />
            </label>
          </div>
          <label className="field">
            <span>Variant or concentration <em>optional</em></span>
            <input value={variant} onChange={(event) => setVariant(event.target.value)} placeholder="Eau de Parfum" />
            <small>Variants remain distinct, so EDT and EDP will never be merged automatically.</small>
          </label>
          <p className="review-help">Add similarity lists below to save the fragrance and its relationships together. Both lists are optional.</p>
          <div className="add-relationship-grid">
            {SOURCES.map((source) => (
              <section className="form-stack add-relationship-editor" key={source}>
                <h3>{sourceLabel(source)}</h3>
                <label className="field">
                  <span>{sourceLabel(source)} page <em>optional</em></span>
                  <input
                    type="url"
                    value={source === 'fragrantica' ? fragranticaUrl : parfumoUrl}
                    onChange={(event) => source === 'fragrantica' ? setFragranticaUrl(event.target.value) : setParfumoUrl(event.target.value)}
                    placeholder={source === 'fragrantica' ? 'https://www.fragrantica.com/perfume/…' : 'https://www.parfumo.com/Perfumes/…'}
                  />
                </label>
                <label className="field">
                  <span>{sourceLabel(source)} relationships <em>optional</em></span>
                  <textarea
                    rows={4}
                    value={lists[source].text}
                    placeholder={source === 'parfumo' ? 'Pure Vision by C\u00e2line\nPure Vision\nFantasme by Maison Alhambra\nFantasme' : 'Brand | Fragrance\nBrand | Another fragrance'}
                    onChange={(event) => {
                      const text = event.target.value
                      setLists((current) => ({ ...current, [source]: { text, rows: parseSimilarityList(text) } }))
                    }}
                  />
                  <small>{source === 'parfumo' && 'Copy directly from Parfumo, including the "Fragrance by Brand" lines and repeated names. '}Paste a similarity list or enter one Brand | Fragrance per line. Review and edit the matches next.</small>
                </label>
                {lists[source].rows.length > 0 && <p className="add-parsed-count">{lists[source].rows.length} parsed</p>}
              </section>
            ))}
          </div>
          <p className="review-help">Exact brand, name, and variant matches reuse existing fragrances. Adding a list for an existing fragrance replaces that source's saved relationships.</p>
          {(error || reviewState.error) && <p className="form-error">{error || reviewState.error}</p>}
        </form>
      ) : (
        <div className="review-layout">
          <div className="review-summary">
            <div><strong>{allReviewRows.length}</strong><span>in source lists</span></div>
            <div className="positive"><strong>+{addedRows.length}</strong><span>added</span></div>
            <div className="negative"><strong>−{removedItems.length}</strong><span>removed</span></div>
          </div>
          {(addedRows.length > 0 || removedItems.length > 0) && (
            <div className="change-preview">
              {addedRows.length > 0 && <span><b>Adding:</b> {addedRows.slice(0, 4).map((row) => row.name).join(', ')}{addedRows.length > 4 ? '…' : ''}</span>}
              {removedItems.length > 0 && <span><b>Removing:</b> {removedItems.slice(0, 4).map((item) => item.name).join(', ')}{removedItems.length > 4 ? '…' : ''}</span>}
            </div>
          )}
          {reviewedSources.map((source) => (
            <section className="add-review-source" key={source}>
              <h3>{sourceLabel(source)} <span>{reviewRows[source].length} {reviewRows[source].length === 1 ? 'relationship' : 'relationships'}</span></h3>
              <div className="review-table" role="table" aria-label={`${sourceLabel(source)} fragrance identities`}>
                <div className="review-table__header" role="row">
                  <span>Brand</span><span>Fragrance</span><span>Variant</span><span>Identity decision</span><span aria-label="Actions" />
                </div>
                {reviewRows[source].map((row) => {
                  const recognized = row.existingId ? fragranceById.get(row.existingId) : undefined
                  return (
                    <div className="review-row" role="row" key={row.id}>
                      <input aria-label={`${sourceLabel(source)} brand for ${row.raw}`} value={row.brand} placeholder="Required" onChange={(event) => updateRow(source, row.id, { brand: event.target.value })} />
                      <input aria-label={`${sourceLabel(source)} name for ${row.raw}`} value={row.name} onChange={(event) => updateRow(source, row.id, { name: event.target.value })} />
                      <input aria-label={`${sourceLabel(source)} variant for ${row.raw}`} value={row.variant} placeholder="Optional" onChange={(event) => updateRow(source, row.id, { variant: event.target.value })} />
                      <select aria-label={`${sourceLabel(source)} identity match for ${row.raw}`} value={row.existingId} onChange={(event) => updateRow(source, row.id, { existingId: event.target.value })}>
                        <option value="">Resolve exact name or create context</option>
                        {recognized && !row.suggestions.some((item) => item.id === recognized.id) && <option value={recognized.id}>Recognized · {displayName(recognized)}</option>}
                        {row.suggestions.map((item) => <option key={item.id} value={item.id}>Possible · {displayName(item)}</option>)}
                      </select>
                      <button className="review-row__remove" type="button" aria-label={`Remove ${sourceLabel(source)} row for ${row.raw}`} title="Remove row" disabled={saving} onClick={() => removeRow(source, row.id)}>
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
          {allReviewRows.length === 0 && <p className="review-help" role="status">No fragrances left to review. Go back to edit the pasted lists.</p>}
          <p className="review-help">Possible matches are never selected automatically. Recognized matches use an exact current or previously merged brand, name, and variant.</p>
          {(error || reviewState.error) && <p className="form-error">{error || reviewState.error}</p>}
        </div>
      )}
    </Modal>
  )
}
