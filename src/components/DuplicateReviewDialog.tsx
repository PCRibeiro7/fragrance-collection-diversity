import { useMemo, useState } from 'react'
import { findDuplicateFragrances, type DuplicateCandidate } from '../domain/duplicates'
import { displayName } from '../domain/identity'
import type { Fragrance, SimilarityObservation, SourceCapture, SourceUrls } from '../domain/types'
import { useDuplicateReviewState } from '../data/useDuplicateReviewState'
import { dismissalKey, keepSeparate, reviewAgain } from '../data/duplicateDecisions'
import { mergeFragrances, undoMerge } from '../data/merge'
import { Modal } from './Modal'

interface Props {
  fragrances: Fragrance[]
  captures: SourceCapture[]
  observations: SimilarityObservation[]
  onClose: () => void
  onMerged: () => void
  onSelectFragrance?: (id: string) => void
  initialEventId?: string
}

export function DuplicateReviewDialog({ fragrances, captures, observations, onClose, onMerged, onSelectFragrance, initialEventId }: Props) {
  const candidates = useMemo(() => findDuplicateFragrances(fragrances), [fragrances])
  const persisted = useDuplicateReviewState()
  const [tab, setTab] = useState<'suggestions' | 'separate' | 'history'>(initialEventId ? 'history' : 'suggestions')
  const [eventFilter, setEventFilter] = useState(initialEventId)
  const dismissed = new Set(persisted.dismissals.map((item) => item.id))
  const [review, setReview] = useState<DuplicateCandidate | null>(null)
  const [keepId, setKeepId] = useState('')
  const [choices, setChoices] = useState<SourceUrls>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const visible = persisted.loading ? [] : candidates.filter((candidate) => !dismissed.has(dismissalKey(candidate.left.id, candidate.right.id)))
  const conflicts = review ? (['fragrantica', 'parfumo'] as const).filter((source) =>
    review.left.sourceUrls[source] && review.right.sourceUrls[source] && review.left.sourceUrls[source] !== review.right.sourceUrls[source],
  ) : []

  function openReview(candidate: DuplicateCandidate) {
    setReview(candidate)
    setKeepId(candidate.right.owned && !candidate.left.owned ? candidate.right.id : candidate.left.id)
    setChoices({})
    setError('')
  }

  async function merge() {
    if (!review || busy) return
    setBusy(true)
    setError('')
    try {
      await mergeFragrances(keepId, keepId === review.left.id ? review.right.id : review.left.id, choices)
      setReview(null)
      setMessage('Fragrances merged and recorded in history. Undo remains available after reopening the app until collection data changes.')
      onMerged()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Merge failed.') }
    finally { setBusy(false) }
  }

  async function revert() {
    if (!persisted.undoEventId || busy) return
    setBusy(true)
    setError('')
    try {
      await undoMerge(persisted.undoEventId)
      setMessage('Merge undone.')
      onMerged()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Undo failed.') }
    finally { setBusy(false) }
  }

  async function decide(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try { await action() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save this decision.') }
    finally { setBusy(false) }
  }

  return <Modal title={review ? 'Review merge' : 'Find duplicate fragrances'} eyebrow="Collection cleanup" wide onClose={() => { if (!busy) onClose() }}
    footer={<>
      {review ? <>
        <button className="button button--quiet" disabled={busy} onClick={() => setReview(null)}>Back to suggestions</button>
        <button className="button button--primary" disabled={busy || conflicts.some((source) => !choices[source])} onClick={merge}>{busy ? 'Merging…' : 'Confirm merge'}</button>
      </> : <button className="button button--quiet" disabled={busy} onClick={onClose}>Done</button>}
    </>}>
    {(error || persisted.error) && <p role="alert" className="form-error">{error || persisted.error}</p>}
    {message && <p role="status">{message}</p>}
    {persisted.undoEventId && !review && <div>
      <button className="button button--quiet" disabled={busy || !persisted.canUndo} onClick={revert}>Undo latest merge</button>
      {!persisted.canUndo && <p>Undo is unavailable because collection data changed after this merge.</p>}
    </div>}
    {!review && <div className="segmented duplicate-tabs" role="tablist" aria-label="Duplicate review">
      {([['suggestions', 'Suggestions', visible.length], ['separate', 'Kept separate', persisted.dismissals.length], ['history', 'Merge history', persisted.mergeEvents.length]] as const).map(([value, label, count]) =>
        <button key={value} type="button" role="tab" id={`tab-${value}`} aria-controls="duplicate-panel" aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const buttons = Array.from(event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
          const index = buttons.indexOf(event.currentTarget)
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
          buttons[next].focus(); buttons[next].click()
        }} className={tab === value ? 'active' : ''} disabled={busy} onClick={() => { setTab(value); setEventFilter(undefined) }}>{label} ({count})</button>)}
    </div>}
    {persisted.loading && <p role="status">Loading saved review decisions...</p>}
    {review ? <div className="form-stack">
      <p>{review.reason}. Choose the record whose brand, name, and variant you want to keep.</p>
      {review.warnings.map((warning) => <p className="duplicate-warning" key={warning}>{warning}</p>)}
      <fieldset className="duplicate-options"><legend>Keep this identity</legend>
        {[review.left, review.right].map((item) => <label className="duplicate-option" key={item.id}>
          <input type="radio" name="keep-fragrance" value={item.id} checked={keepId === item.id} onChange={() => setKeepId(item.id)} disabled={busy} />
          <span><strong>{displayName(item)}</strong><small>{item.owned ? 'Owned' : 'Context'} · {captures.filter((capture) => capture.rootFragranceId === item.id).length} captures · {observations.filter((observation) => observation.fromFragranceId === item.id || observation.toFragranceId === item.id).length} recorded references</small><small>ID: {item.id}</small>
            {Object.entries(item.sourceUrls).filter(([, url]) => url).map(([source, url]) => <small key={source}>{source}: {url}</small>)}
          </span>
        </label>)}
      </fieldset>
      {conflicts.map((source) => <label className="field" key={source}><span>Keep {source} URL</span>
        <select value={choices[source] ?? ''} disabled={busy} onChange={(event) => setChoices({ ...choices, [source]: event.target.value })}>
          <option value="">Choose a source page</option>
          {[review.left, review.right].map((item) => <option key={item.id} value={item.sourceUrls[source]}>{item.sourceUrls[source]}</option>)}
        </select>
      </label>)}
      <p>Ownership is kept if either record is owned. Source links fill empty fields. All captures, dates, page URLs, and incoming and outgoing evidence are retained. Links to itself and repeated targets within a capture are removed.</p>
      <p>The other fragrance record is removed. Only the chosen identity and source URLs remain on the fragrance. History retains the original identities. Undo restores the previous records if collection data has not changed since the merge.</p>
    </div> : <div className="form-stack" role="tabpanel" id="duplicate-panel" aria-labelledby={`tab-${tab}`}>
      {tab === 'separate' ? <>
        <p>These pairs stay separate until you choose Review again. Editing names or source URLs does not reset your decision.</p>
        {!persisted.dismissals.length && !persisted.loading && <p>No pairs marked as separate yet.</p>}
        {persisted.dismissals.map((item) => <article className="duplicate-card" key={item.id}>
          <strong>{displayName(fragrances.find((f) => f.id === item.leftId) ?? item.left)}</strong>
          <strong>{displayName(fragrances.find((f) => f.id === item.rightId) ?? item.right)}</strong>
          <small>Kept separate {new Date(item.dismissedAt).toLocaleString()}</small>
          <button className="button button--quiet" disabled={busy} onClick={() => decide(() => reviewAgain(item.id))}>Review again</button>
        </article>)}
      </> : tab === 'history' ? <>
        <p>Permanent history starts with merges made after this feature was added. Earlier merges cannot be reconstructed.</p>
        {eventFilter && <button className="button button--quiet" onClick={() => setEventFilter(undefined)}>Show all merge history</button>}
        {!persisted.mergeEvents.length && !persisted.loading && <p>No recorded merges yet.</p>}
        {persisted.mergeEvents.filter((event) => !eventFilter || event.id === eventFilter).map((event) => <article className="duplicate-card" key={event.id}>
          <strong>{displayName(event.removed)} &rarr; {displayName(event.kept)}</strong>
          <small>{new Date(event.mergedAt).toLocaleString()} {event.undoneAt ? `Undone ${new Date(event.undoneAt).toLocaleString()}` : 'Merged'}</small>
          <p>Before: removed record {event.removed.owned ? 'owned' : 'context'}; kept record {event.kept.owned ? 'owned' : 'context'}. After: {event.result.owned ? 'owned' : 'context'}.</p>
          <p>{event.captureCount} captures and {event.observationCount} recorded references involved.</p>
          <details><summary>Original records and source URL choices</summary>
            {([['Removed', event.removed], ['Kept before merge', event.kept], ['Result', event.result]] as const).map(([label, item]) => {
              return <div key={label}><strong>{label}: {displayName(item)}</strong><small>ID: {item.id}</small>
                {(['fragrantica', 'parfumo'] as const).map((source) => <p key={source}>{source}: {item.sourceUrls[source] || 'Not set'}</p>)}</div>
            })}
          </details>
          {!event.undoneAt && (fragrances.some((item) => item.id === event.currentSurvivorId)
            ? <button className="button button--quiet" onClick={() => onSelectFragrance?.(event.currentSurvivorId)}>View current fragrance</button>
            : <p>The surviving fragrance was deleted.</p>)}
        </article>)}
      </> : <>

      <p>Scanned {fragrances.length} owned and context fragrances. {visible.length} possible duplicate pairs. Suggestions compare names, brand aliases, and source pages; they do not verify product identity. Nothing is merged automatically.</p>
      <p>Concentrations, flankers, and release years may identify different products. Review these differences before merging.</p>
      {!persisted.loading && !visible.length && <p>{candidates.length ? 'All current suggestions have been reviewed or marked as separate.' : 'No likely duplicates found. Different names or unknown brand aliases can still hide duplicates.'}</p>}
      {visible.map((candidate) => <article className="duplicate-card" key={candidate.key}>
        <span className="eyebrow">{candidate.confidence === 'likely' ? 'Likely duplicate' : 'Needs review'}</span>
        <strong>{displayName(candidate.left)}</strong><strong>{displayName(candidate.right)}</strong>
        <p>{candidate.reason}</p>
        {candidate.warnings.map((warning) => <small className="duplicate-warning" key={warning}>{warning}</small>)}
        <div className="duplicate-actions"><button className="button button--primary" disabled={busy || persisted.loading || Boolean(persisted.error)} onClick={() => openReview(candidate)}>Review merge</button>
          <button className="button button--quiet" disabled={busy || persisted.loading || Boolean(persisted.error)} onClick={() => decide(() => keepSeparate(candidate.left.id, candidate.right.id))}>Keep separate</button></div>
      </article>)}
      </>}
    </div>}
  </Modal>
}
