import { useState, type FormEvent } from 'react'
import { useDuplicateReviewState } from '../data/useDuplicateReviewState'
import { FragranceIdentityConflict, updateFragrance } from '../data/repository'
import { displayName, validateHttpUrl } from '../domain/identity'
import type { Fragrance } from '../domain/types'
import { Modal } from './Modal'

interface Props {
  fragrance: Fragrance
  onClose: () => void
  onSaved: (id: string) => void
  onReviewDuplicate: (pair: [string, string]) => void
}

export function EditFragranceDialog({ fragrance, onClose, onSaved, onReviewDuplicate }: Props) {
  const reviewState = useDuplicateReviewState()
  const [brand, setBrand] = useState(fragrance.brand)
  const [name, setName] = useState(fragrance.name)
  const [variant, setVariant] = useState(fragrance.variant ?? '')
  const [fragranticaUrl, setFragranticaUrl] = useState(fragrance.sourceUrls.fragrantica ?? '')
  const [parfumoUrl, setParfumoUrl] = useState(fragrance.sourceUrls.parfumo ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [conflictId, setConflictId] = useState<string>()

  function clearError() {
    setError('')
    setConflictId(undefined)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    clearError()
    if (!brand.trim() || !name.trim()) {
      setError('Brand and fragrance name are required.')
      return
    }
    if (!validateHttpUrl(fragranticaUrl) || !validateHttpUrl(parfumoUrl)) {
      setError('Source links must be valid http or https URLs.')
      return
    }
    setSaving(true)
    try {
      const updated = await updateFragrance(fragrance.id, {
        brand, name, variant, sourceUrls: { fragrantica: fragranticaUrl, parfumo: parfumoUrl },
      })
      onSaved(updated.id)
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update this fragrance. Please try again.')
      if (caught instanceof FragranceIdentityConflict) setConflictId(caught.fragranceId)
    } finally {
      setSaving(false)
    }
  }

  return <Modal title="Edit fragrance" eyebrow={displayName(fragrance)} dismissDisabled={saving} onClose={() => { if (!saving) onClose() }} footer={<>
    <button className="button button--quiet" type="button" disabled={saving} onClick={onClose}>Cancel</button>
    <button className="button button--primary" type="submit" form="edit-fragrance" disabled={saving}>
      {saving ? 'Saving…' : 'Save changes'}
    </button>
  </>}>
    <form id="edit-fragrance" className="form-stack" onSubmit={save} noValidate>
      <div className="field-row">
        <label className="field"><span>Brand</span>
          <input autoFocus disabled={saving} value={brand} onChange={(event) => { setBrand(event.target.value); clearError() }} />
        </label>
        <label className="field field--grow"><span>Fragrance name</span>
          <input disabled={saving} value={name} onChange={(event) => { setName(event.target.value); clearError() }} />
        </label>
      </div>
      <label className="field"><span>Variant or concentration <em>optional</em></span>
        <input disabled={saving} value={variant} onChange={(event) => { setVariant(event.target.value); clearError() }} />
        <small>Variants remain distinct, so EDT and EDP will never be merged automatically.</small>
      </label>
      <label className="field"><span>Fragrantica page <em>optional</em></span>
        <input type="url" disabled={saving} value={fragranticaUrl} onChange={(event) => { setFragranticaUrl(event.target.value); clearError() }} />
      </label>
      <label className="field"><span>Parfumo page <em>optional</em></span>
        <input type="url" disabled={saving} value={parfumoUrl} onChange={(event) => { setParfumoUrl(event.target.value); clearError() }} />
      </label>
      <p className="review-help">Saved relationships and capture history are preserved. Clearing a source link removes it from this fragrance.</p>
      {reviewState.canUndo && <p className="review-help">Saving changes will make Undo latest merge unavailable to protect your edits.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {conflictId && <div className="form-stack">
        <p className="review-help">Review duplicate discards these unsaved edits and opens the two saved records for review.</p>
        <button className="button button--quiet" type="button" disabled={saving} onClick={() => onReviewDuplicate([fragrance.id, conflictId])}>Review duplicate</button>
      </div>}
    </form>
  </Modal>
}
