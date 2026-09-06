import { ArrowLeft, ArrowRight, Check, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { replaceCapture } from '../data/repository'
import { displayName, identityKey, validateHttpUrl } from '../domain/identity'
import { parseSimilarityList, similarityScore } from '../domain/parser'
import type {
  Fragrance,
  SimilarityObservation,
  SimilaritySource,
  SourceCapture,
} from '../domain/types'
import { Modal } from './Modal'

interface CaptureDialogProps {
  root: Fragrance
  initialSource?: SimilaritySource
  fragrances: Fragrance[]
  captures: SourceCapture[]
  observations: SimilarityObservation[]
  onClose: () => void
}

interface ReviewRow {
  id: string
  raw: string
  brand: string
  name: string
  variant: string
  existingId: string
  suggestions: Fragrance[]
}

function findSuggestions(
  brand: string,
  name: string,
  variant: string,
  fragrances: Fragrance[],
): { exact?: Fragrance; suggestions: Fragrance[] } {
  const key = identityKey({ brand, name, variant })
  const exact = brand ? fragrances.find((item) => identityKey(item) === key) : undefined
  const query = `${brand} ${name} ${variant}`.trim()
  const suggestions = fragrances
    .map((item) => ({ item, score: similarityScore(query, `${item.brand} ${item.name} ${item.variant ?? ''}`) }))
    .filter(({ item, score }) => item.id !== exact?.id && score >= 0.52)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ item }) => item)
  return { exact, suggestions }
}

export function CaptureDialog({
  root,
  initialSource = 'fragrantica',
  fragrances,
  captures,
  observations,
  onClose,
}: CaptureDialogProps) {
  const [source, setSource] = useState<SimilaritySource>(initialSource)
  const [pageUrl, setPageUrl] = useState(root.sourceUrls[initialSource] ?? '')
  const [text, setText] = useState('')
  const [rows, setRows] = useState<ReviewRow[] | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const currentCapture = captures.find(
    (capture) => capture.rootFragranceId === root.id && capture.source === source,
  )
  const currentTargetIds = useMemo(
    () =>
      new Set(
        currentCapture
          ? observations
              .filter((observation) => observation.captureId === currentCapture.id)
              .map((observation) => observation.toFragranceId)
          : [],
      ),
    [currentCapture, observations],
  )
  const fragranceById = useMemo(
    () => new Map(fragrances.map((fragrance) => [fragrance.id, fragrance])),
    [fragrances],
  )

  function changeSource(next: SimilaritySource) {
    setSource(next)
    setPageUrl(root.sourceUrls[next] ?? '')
    setRows(null)
    setError('')
  }

  function beginReview() {
    setError('')
    if (!validateHttpUrl(pageUrl)) {
      setError('The source page must be a valid http or https URL.')
      return
    }
    const parsed = parseSimilarityList(text)
    if (!parsed.length) {
      setError('Paste at least one related fragrance before continuing.')
      return
    }
    setRows(
      parsed.map((line) => {
        const matches = findSuggestions(line.brand, line.name, line.variant, fragrances)
        return {
          ...line,
          existingId: matches.exact?.id ?? '',
          suggestions: matches.suggestions,
        }
      }),
    )
  }

  function updateRow(id: string, patch: Partial<ReviewRow>) {
    setRows((current) =>
      current?.map((row) => {
        if (row.id !== id) return row
        const updated = { ...row, ...patch }
        if ('brand' in patch || 'name' in patch || 'variant' in patch) {
          const matches = findSuggestions(updated.brand, updated.name, updated.variant, fragrances)
          updated.existingId = matches.exact?.id ?? ''
          updated.suggestions = matches.suggestions
        }
        return updated
      }) ?? null,
    )
  }

  const proposedKeys = new Set(
    (rows ?? []).map((row) => {
      const selectedExisting = row.existingId ? fragranceById.get(row.existingId) : undefined
      return selectedExisting ? identityKey(selectedExisting) : identityKey(row)
    }),
  )
  const currentKeys = new Set(
    [...currentTargetIds].map((id) => {
      const item = fragranceById.get(id)
      return item ? identityKey(item) : id
    }),
  )
  const addedRows = (rows ?? []).filter(
    (row) => {
      const selectedExisting = row.existingId ? fragranceById.get(row.existingId) : undefined
      return !currentKeys.has(selectedExisting ? identityKey(selectedExisting) : identityKey(row))
    },
  )
  const removedItems = [...currentTargetIds]
    .filter((id) => {
      const item = fragranceById.get(id)
      return !proposedKeys.has(item ? identityKey(item) : id)
    })
    .map((id) => fragranceById.get(id))
    .filter((item): item is Fragrance => Boolean(item))

  async function save() {
    if (!rows) return
    if (rows.some((row) => !row.brand.trim() || !row.name.trim())) {
      setError('Complete the brand and fragrance name on every row.')
      return
    }
    try {
      setSaving(true)
      setError('')
      await replaceCapture({
        rootFragranceId: root.id,
        source,
        pageUrl,
        targets: rows.map((row) => ({
          brand: row.brand,
          name: row.name,
          variant: row.variant,
          existingId: row.existingId || undefined,
        })),
      })
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not replace this capture.')
    } finally {
      setSaving(false)
    }
  }

  const footer = rows ? (
    <>
      <button className="button button--quiet" type="button" onClick={() => setRows(null)}>
        <ArrowLeft size={16} /> Back
      </button>
      <button className="button button--primary" type="button" disabled={saving} onClick={save}>
        <Check size={16} /> {saving ? 'Saving…' : 'Replace source list'}
      </button>
    </>
  ) : (
    <>
      <button className="button button--quiet" type="button" onClick={onClose}>
        Cancel
      </button>
      <button className="button button--primary" type="button" onClick={beginReview}>
        Review matches <ArrowRight size={16} />
      </button>
    </>
  )

  return (
    <Modal
      title={rows ? 'Review identity matches' : 'Capture similarity list'}
      eyebrow={displayName(root)}
      onClose={onClose}
      footer={footer}
      wide={Boolean(rows)}
    >
      {!rows ? (
        <div className="form-stack">
          <div className="segmented" aria-label="Similarity source">
            <button
              type="button"
              className={source === 'fragrantica' ? 'active' : ''}
              onClick={() => changeSource('fragrantica')}
            >
              Fragrantica
            </button>
            <button
              type="button"
              className={source === 'parfumo' ? 'active' : ''}
              onClick={() => changeSource('parfumo')}
            >
              Parfumo
            </button>
          </div>
          <div className="capture-status-note">
            <Sparkles size={17} />
            <span>
              {currentCapture
                ? `Replacing ${currentTargetIds.size} saved relationships from ${new Date(currentCapture.capturedAt).toLocaleDateString()}.`
                : 'No list has been captured from this source yet.'}
            </span>
          </div>
          <label className="field">
            <span>Source page <em>optional</em></span>
            <input type="url" value={pageUrl} onChange={(event) => setPageUrl(event.target.value)} />
          </label>
          <label className="field">
            <span>Related fragrances</span>
            <textarea
              autoFocus
              rows={11}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={'Diptyque | Philosykos\nPremier Figuier\nHermès | Un Jardin en Méditerranée'}
            />
            <small>
              Paste Fragrantica's "This perfume reminds me of" section directly, including vote counts and Compare labels.
              You can also enter one <code>Brand | Fragrance</code> per line. Review and edit the matches next.
            </small>
          </label>
          <div className="privacy-note">
            This app does not visit or scrape either source. Only the text you enter is stored locally.
          </div>
        </div>
      ) : (
        <div className="review-layout">
          <div className="review-summary">
            <div><strong>{rows.length}</strong><span>in new list</span></div>
            <div className="positive"><strong>+{addedRows.length}</strong><span>added</span></div>
            <div className="negative"><strong>−{removedItems.length}</strong><span>removed</span></div>
          </div>
          {(addedRows.length > 0 || removedItems.length > 0) && (
            <div className="change-preview">
              {addedRows.length > 0 && <span><b>Adding:</b> {addedRows.slice(0, 4).map((row) => row.name).join(', ')}{addedRows.length > 4 ? '…' : ''}</span>}
              {removedItems.length > 0 && <span><b>Removing:</b> {removedItems.slice(0, 4).map((item) => item.name).join(', ')}{removedItems.length > 4 ? '…' : ''}</span>}
            </div>
          )}
          <div className="review-table" role="table" aria-label="Parsed fragrance identities">
            <div className="review-table__header" role="row">
              <span>Brand</span><span>Fragrance</span><span>Variant</span><span>Identity decision</span>
            </div>
            {rows.map((row) => (
              <div className="review-row" role="row" key={row.id}>
                <input
                  aria-label={`Brand for ${row.raw}`}
                  value={row.brand}
                  placeholder="Required"
                  onChange={(event) => updateRow(row.id, { brand: event.target.value })}
                />
                <input
                  aria-label={`Name for ${row.raw}`}
                  value={row.name}
                  onChange={(event) => updateRow(row.id, { name: event.target.value })}
                />
                <input
                  aria-label={`Variant for ${row.raw}`}
                  value={row.variant}
                  placeholder="Optional"
                  onChange={(event) => updateRow(row.id, { variant: event.target.value })}
                />
                <select
                  aria-label={`Identity match for ${row.raw}`}
                  value={row.existingId}
                  onChange={(event) => updateRow(row.id, { existingId: event.target.value })}
                >
                  <option value="">Create as new context</option>
                  {row.existingId && !row.suggestions.some((item) => item.id === row.existingId) && (
                    <option value={row.existingId}>
                      Exact · {displayName(fragranceById.get(row.existingId)!)}
                    </option>
                  )}
                  {row.suggestions.map((item) => (
                    <option key={item.id} value={item.id}>Possible · {displayName(item)}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <p className="review-help">Possible matches are never selected automatically. Exact matches require the same normalized brand, name, and variant.</p>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
    </Modal>
  )
}
