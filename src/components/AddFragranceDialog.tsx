import { useState, type FormEvent } from 'react'
import { parseSimilarityList, type ParsedSimilarityLine } from '../domain/parser'
import type { SimilaritySource } from '../domain/types'
import { Modal } from './Modal'
import { saveFragranceWithRelationships } from '../data/repository'
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
  const [lists, setLists] = useState<Record<SimilaritySource, { text: string; rows: ParsedSimilarityLine[] }>>({
    fragrantica: { text: '', rows: [] }, parfumo: { text: '', rows: [] },
  })
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

    for (const source of ['fragrantica', 'parfumo'] as const) {
      const list = lists[source]
      if ((list.text.trim() && !list.rows.length) || list.rows.some((row) => !row.brand.trim() || !row.name.trim())) {
        setError(`Complete the brand and name for each ${source === 'fragrantica' ? 'Fragrantica' : 'Parfumo'} relationship.`)
        return
      }
    }
    try {
      setSaving(true)
      const fragrance = await saveFragranceWithRelationships({
        brand,
        name,
        variant,
        owned: true,
        sourceUrls: { fragrantica: fragranticaUrl, parfumo: parfumoUrl },
      }, (['fragrantica', 'parfumo'] as const).filter((source) => lists[source].rows.length > 0).map((source) => ({
        source,
        pageUrl: source === 'fragrantica' ? fragranticaUrl : parfumoUrl,
        targets: lists[source].rows,
      })))
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
            {saving ? 'Saving…' : 'Save fragrance and relationships'}
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
        <p className="review-help">Add similarity lists below to save the fragrance and its relationships together. Both lists are optional.</p>
        {(['fragrantica', 'parfumo'] as const).map((source) => (
          <div className="form-stack" key={source}>
            <label className="field">
              <span>{source === 'fragrantica' ? 'Fragrantica' : 'Parfumo'} relationships <em>optional</em></span>
              <textarea rows={4} value={lists[source].text}
                placeholder={'Brand | Fragrance\nBrand | Another fragrance'}
                onChange={(event) => {
                  const text = event.target.value
                  setLists((current) => ({ ...current, [source]: { text, rows: parseSimilarityList(text) } }))
                }} />
              <small>Paste a similarity list or enter one Brand | Fragrance per line. Check the parsed entries below before saving.</small>
            </label>
            {lists[source].rows.map((row) => (
              <div className="field-row" key={row.id}>
                {(['brand', 'name', 'variant'] as const).map((field) => (
                  <label className="field" key={field}>
                    <span>{field === 'brand' ? 'Brand' : field === 'name' ? 'Fragrance name' : 'Variant'}</span>
                    <input aria-label={`${source} ${field} for ${row.raw}`} value={row[field]}
                      onChange={(event) => setLists((current) => ({ ...current, [source]: {
                        ...current[source], rows: current[source].rows.map((item) => item.id === row.id ? { ...item, [field]: event.target.value } : item),
                      } }))} />
                  </label>
                ))}
              </div>
            ))}
          </div>
        ))}
        <p className="review-help">Exact brand, name, and variant matches reuse existing fragrances. Adding a list for an existing fragrance replaces that source's saved relationships.</p>
        {error && <p className="form-error">{error}</p>}
      </form>
    </Modal>
  )
}
