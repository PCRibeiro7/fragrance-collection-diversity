import { ArrowLeft, CircleHelp, Eye, Link2, Network } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { resolveKnownIdentity } from '../data/duplicateDecisions'
import { useDuplicateReviewState } from '../data/useDuplicateReviewState'
import { aggregateEdges } from '../domain/graph'
import { displayName, identityKey } from '../domain/identity'
import { parseSimilarityList, type ParsedSimilarityLine } from '../domain/parser'
import { analyzeFragrancePreview, type PreviewAnalysis, type RedundancyLevel } from '../domain/preview'
import type { Fragrance, SimilarityObservation, SimilaritySource } from '../domain/types'
import { Modal } from './Modal'

interface PreviewFragranceDialogProps {
  fragrances: Fragrance[]
  observations: SimilarityObservation[]
  onClose: () => void
}

interface PreviewResult {
  analysis: PreviewAnalysis
  candidateLabel: string
  existing?: Fragrance
  inputCount: number
  matchedCount: number
}

const SOURCES = ['fragrantica', 'parfumo'] as const

const VERDICTS: Record<RedundancyLevel, { title: string; summary: string }> = {
  high: {
    title: 'High redundancy signal',
    summary: 'This candidate strongly overlaps at least one fragrance you already own.',
  },
  medium: {
    title: 'Some meaningful overlap',
    summary: 'This candidate shares notable territory with your collection, but may still add a different angle.',
  },
  low: {
    title: 'Low observed redundancy',
    summary: 'The mapped evidence does not closely overlap your owned fragrances.',
  },
  insufficient: {
    title: 'Not enough mapped evidence',
    summary: 'Add a similarity list, or capture more of the fragrances already on your map, for a useful comparison.',
  },
}

export function PreviewFragranceDialog({ fragrances, observations, onClose }: PreviewFragranceDialogProps) {
  const reviewState = useDuplicateReviewState()
  const [brand, setBrand] = useState('')
  const [name, setName] = useState('')
  const [variant, setVariant] = useState('')
  const [lists, setLists] = useState<Record<SimilaritySource, { text: string; rows: ParsedSimilarityLine[] }>>({
    fragrantica: { text: '', rows: [] },
    parfumo: { text: '', rows: [] },
  })
  const [error, setError] = useState('')
  const [result, setResult] = useState<PreviewResult>()
  const edges = useMemo(() => aggregateEdges(observations), [observations])

  function updateRow(source: SimilaritySource, id: string, field: 'brand' | 'name' | 'variant', value: string) {
    setLists((current) => ({
      ...current,
      [source]: {
        ...current[source],
        rows: current[source].rows.map((row) => row.id === id ? { ...row, [field]: value } : row),
      },
    }))
  }

  function handlePreview(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!brand.trim() || !name.trim()) {
      setError('Brand and fragrance name are required.')
      return
    }
    if (SOURCES.some((source) => lists[source].rows.some((row) => !row.brand.trim() || !row.name.trim()))) {
      setError('Complete the brand and fragrance name on every relationship row.')
      return
    }

    const candidate = resolveKnownIdentity({ brand, name, variant }, fragrances, reviewState.aliases)
    const relationshipIdsBySource = Object.fromEntries(SOURCES.map((source) => [
      source,
      lists[source].rows.flatMap((row) => {
        const resolved = resolveKnownIdentity(row, fragrances, reviewState.aliases)
        return resolved ? [resolved.id] : []
      }),
    ])) as Record<SimilaritySource, string[]>
    const inputKeys = new Set(SOURCES.flatMap((source) => lists[source].rows.map(identityKey)))
    const matchedIds = new Set(SOURCES.flatMap((source) => relationshipIdsBySource[source]))

    if (!inputKeys.size && !candidate) {
      setError('Paste at least one similarity list for a fragrance that is not on the map yet.')
      return
    }

    setResult({
      analysis: analyzeFragrancePreview({
        candidateId: candidate?.id,
        relationshipIdsBySource,
        fragrances,
        edges,
      }),
      candidateLabel: displayName({ brand: brand.trim(), name: name.trim(), variant: variant.trim() || undefined }),
      existing: candidate,
      inputCount: inputKeys.size,
      matchedCount: matchedIds.size,
    })
  }

  if (result) {
    const verdict = result.existing?.owned
      ? { title: 'Already in your collection', summary: `${displayName(result.existing)} is already marked as owned.` }
      : VERDICTS[result.analysis.level]
    const fragrancesById = new Map(fragrances.map((fragrance) => [fragrance.id, fragrance]))
    return (
      <Modal
        title={result.candidateLabel}
        eyebrow="Collection preview"
        onClose={onClose}
        wide
        footer={
          <>
            <button className="button button--quiet" type="button" onClick={() => setResult(undefined)}><ArrowLeft size={15} /> Edit inputs</button>
            <button className="button button--primary" type="button" onClick={onClose}>Close preview</button>
          </>
        }
      >
        <div className="preview-results">
          <section className={`preview-verdict preview-verdict--${result.existing?.owned ? 'high' : result.analysis.level}`}>
            <div className="preview-verdict__icon"><Eye size={24} /></div>
            <div><p className="eyebrow">Read-only assessment</p><h3>{verdict.title}</h3><p>{verdict.summary}</p></div>
          </section>

          <div className="preview-stats">
            <div><Network size={16} /><strong>{result.analysis.evidenceCount}</strong><span>mapped relationships</span></div>
            <div><Link2 size={16} /><strong>{result.analysis.directOwnedCount}</strong><span>direct owned overlaps</span></div>
            <div><CircleHelp size={16} /><strong>{result.matchedCount}/{result.inputCount}</strong><span>pasted names matched</span></div>
          </div>

          {result.analysis.matches.length > 0 ? (
            <section className="preview-section">
              <h3>Closest fragrances in your collection</h3>
              <div className="preview-match-list">
                {result.analysis.matches.slice(0, 5).map((match) => {
                  const fragrance = fragrancesById.get(match.fragranceId)
                  if (!fragrance) return null
                  const shared = match.sharedIds.flatMap((id) => {
                    const item = fragrancesById.get(id)
                    return item ? [item.name] : []
                  })
                  return (
                    <article key={match.fragranceId}>
                      <div className="preview-match__heading">
                        <div><strong>{fragrance.name}</strong><span>{fragrance.brand}{fragrance.variant ? ` · ${fragrance.variant}` : ''}</span></div>
                        <span className={`preview-level preview-level--${match.level}`}>{match.level}</span>
                      </div>
                      {match.directSources.length > 0 && <p>Directly listed on {match.directSources.map((source) => source === 'fragrantica' ? 'Fragrantica' : 'Parfumo').join(' + ')}.</p>}
                      {shared.length > 0 && <p>Shared context: {shared.join(', ')}.</p>}
                      {match.sharedIds.length > 0 && <small>{Math.round(match.profileOverlap * 100)}% known-profile overlap</small>}
                    </article>
                  )
                })}
              </div>
            </section>
          ) : (
            <p className="preview-empty">No direct or shared relationships connect this candidate to an owned fragrance in the current map.</p>
          )}

          {result.inputCount > result.matchedCount && (
            <p className="preview-note"><CircleHelp size={15} /> {result.inputCount - result.matchedCount} pasted {result.inputCount - result.matchedCount === 1 ? 'name is' : 'names are'} not on the map yet, so they cannot contribute to shared-context analysis.</p>
          )}
          {!fragrances.some((fragrance) => fragrance.owned) && <p className="preview-note">Add at least one owned fragrance before using this comparison.</p>}
          <p className="preview-caveat">This is an evidence summary, not a scent verdict. Missing links and unmatched names mean unknown—not unique.</p>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      title="Preview a fragrance"
      eyebrow="Before you buy"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="button button--quiet" type="button" onClick={onClose}>Cancel</button>
          <button className="button button--primary" type="submit" form="preview-fragrance" disabled={reviewState.loading || Boolean(reviewState.error)}><Eye size={16} /> Check redundancy</button>
        </>
      }
    >
      <form id="preview-fragrance" className="form-stack" onSubmit={handlePreview}>
        <p className="preview-intro">Compare a candidate with your collection without saving it. Similarity lists make the preview much more useful.</p>
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
        </label>

        <div className="preview-list-grid">
          {SOURCES.map((source) => (
            <section className="preview-list" key={source}>
              <label className="field">
                <span>{source === 'fragrantica' ? 'Fragrantica' : 'Parfumo'} relationships <em>optional</em></span>
                <textarea
                  aria-label={`${source === 'fragrantica' ? 'Fragrantica' : 'Parfumo'} relationships`}
                  rows={6}
                  value={lists[source].text}
                  placeholder={source === 'parfumo' ? 'Fragrance by Brand\nFragrance' : 'Brand | Fragrance'}
                  onChange={(event) => {
                    const text = event.target.value
                    setLists((current) => ({ ...current, [source]: { text, rows: parseSimilarityList(text) } }))
                  }}
                />
                <small>Paste the candidate’s “similar perfumes” list. Nothing is saved.</small>
              </label>
              {lists[source].rows.length > 0 && <p className="preview-parsed-count">{lists[source].rows.length} parsed</p>}
              {lists[source].rows.map((row) => (
                <div className="preview-row" key={row.id}>
                  <input aria-label={`${source} brand for ${row.raw}`} value={row.brand} placeholder="Brand" onChange={(event) => updateRow(source, row.id, 'brand', event.target.value)} />
                  <input aria-label={`${source} name for ${row.raw}`} value={row.name} placeholder="Fragrance" onChange={(event) => updateRow(source, row.id, 'name', event.target.value)} />
                  <input aria-label={`${source} variant for ${row.raw}`} value={row.variant} placeholder="Variant" onChange={(event) => updateRow(source, row.id, 'variant', event.target.value)} />
                </div>
              ))}
            </section>
          ))}
        </div>
        <p className="preview-note"><CircleHelp size={15} /> Exact brand, name, and variant matches connect pasted names to the existing map. Unmatched names remain read-only and are reported in the result.</p>
        {(error || reviewState.error) && <p className="form-error">{error || reviewState.error}</p>}
      </form>
    </Modal>
  )
}
