import { useState, type FormEvent } from 'react'
import { Modal } from './Modal'
import { upsertFragrance } from '../data/repository'
import { validateHttpUrl } from '../domain/identity'

interface AddFragranceDialogProps {
  onClose: () => void
  onSaved?: (id: string) => void
}

export function AddFragranceDialog({ onClose, onSaved }: AddFragranceDialogProps) {
  const [brand, setBrand] = useState('')
  const [name, setName] = useState('')
  const [variant, setVariant] = useState('')
  const [fragranticaUrl, setFragranticaUrl] = useState('')
  const [parfumoUrl, setParfumoUrl] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!brand.trim() || !name.trim()) {
      setError('Brand and fragrance name are required.')
      return
    }
    if (!validateHttpUrl(fragranticaUrl) || !validateHttpUrl(parfumoUrl)) {
      setError('Source links must be valid http or https URLs.')
      return
    }

    try {
      setSaving(true)
      const fragrance = await upsertFragrance({
        brand,
        name,
        variant,
        owned: true,
        sourceUrls: { fragrantica: fragranticaUrl, parfumo: parfumoUrl },
      })
      onSaved?.(fragrance.id)
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this fragrance.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Add to your collection"
      eyebrow="Owned fragrance"
      onClose={onClose}
      footer={
        <>
          <button className="button button--quiet" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button button--primary" type="submit" form="add-fragrance" disabled={saving}>
            {saving ? 'Saving…' : 'Add fragrance'}
          </button>
        </>
      }
    >
      <form id="add-fragrance" className="form-stack" onSubmit={handleSubmit}>
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
        <div className="source-fields">
          <label className="field">
            <span>Fragrantica page <em>optional</em></span>
            <input
              type="url"
              value={fragranticaUrl}
              onChange={(event) => setFragranticaUrl(event.target.value)}
              placeholder="https://www.fragrantica.com/perfume/…"
            />
          </label>
          <label className="field">
            <span>Parfumo page <em>optional</em></span>
            <input
              type="url"
              value={parfumoUrl}
              onChange={(event) => setParfumoUrl(event.target.value)}
              placeholder="https://www.parfumo.com/Perfumes/…"
            />
          </label>
        </div>
        {error && <p className="form-error">{error}</p>}
      </form>
    </Modal>
  )
}
