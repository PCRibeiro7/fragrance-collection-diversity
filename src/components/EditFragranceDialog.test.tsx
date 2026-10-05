import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../data/db'
import * as repository from '../data/repository'
import { mergeFragrances } from '../data/merge'
import type { Fragrance } from '../domain/types'
import { EditFragranceDialog } from './EditFragranceDialog'

let fragrance: Fragrance
beforeEach(async () => {
  await db.transaction('rw', db.allTables, async () => { for (const table of db.allTables) await table.clear() })
  fragrance = await repository.upsertFragrance({ brand: 'Brand', name: 'Original', variant: 'EDP', owned: true,
    sourceUrls: { fragrantica: 'https://example.com/f', parfumo: 'https://example.com/p' } })
})
afterEach(cleanup)

function show() {
  const callbacks = { onClose: vi.fn(), onSaved: vi.fn(), onReviewDuplicate: vi.fn() }
  render(<EditFragranceDialog fragrance={fragrance} {...callbacks} />)
  return callbacks
}
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

describe('edit fragrance dialog', () => {
  it('prefills all five fields and cancels without saving', async () => {
    const { onClose, onSaved } = show()
    expect(screen.getByLabelText('Brand')).toHaveValue('Brand')
    expect(screen.getByLabelText('Fragrance name')).toHaveValue('Original')
    expect(screen.getByLabelText(/Variant or concentration/)).toHaveValue('EDP')
    expect(screen.getByLabelText(/Fragrantica page/)).toHaveValue('https://example.com/f')
    expect(screen.getByLabelText(/Parfumo page/)).toHaveValue('https://example.com/p')
    fireEvent.change(screen.getByLabelText('Fragrance name'), { target: { value: 'Unsaved' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(onSaved).not.toHaveBeenCalled()
    expect(await db.fragrances.get(fragrance.id)).toEqual(fragrance)
  })

  it('validates names and links inline and saves cleared optional fields', async () => {
    const { onSaved, onClose } = show()
    fireEvent.change(screen.getByLabelText('Brand'), { target: { value: ' ' } })
    save()
    expect(screen.getByRole('alert')).toHaveTextContent('Brand and fragrance name are required')
    fireEvent.change(screen.getByLabelText('Brand'), { target: { value: ' Brand ' } })
    fireEvent.change(screen.getByLabelText(/Parfumo page/), { target: { value: 'ftp://example.com' } })
    save()
    expect(screen.getByRole('alert')).toHaveTextContent('http or https')
    fireEvent.change(screen.getByLabelText('Fragrance name'), { target: { value: ' Corrected ' } })
    for (const label of [/Variant or concentration/, /Fragrantica page/, /Parfumo page/]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value: '' } })
    }
    save()
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(fragrance.id))
    expect(onClose).toHaveBeenCalledOnce()
    expect(await db.fragrances.get(fragrance.id)).toMatchObject({ name: 'Corrected', variant: undefined,
      sourceUrls: { fragrantica: undefined, parfumo: undefined } })
  })

  it('disables fields and dismissal while saving, and retains values after a storage failure', async () => {
    let rejectSave!: (error: Error) => void
    vi.spyOn(repository, 'updateFragrance').mockReturnValueOnce(new Promise((_, reject) => { rejectSave = reject }))
    const { onClose, onSaved } = show()
    fireEvent.change(screen.getByLabelText('Fragrance name'), { target: { value: 'Corrected' } })
    save()
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
    for (const field of screen.getAllByRole('textbox')) expect(field).toBeDisabled()
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!)
    expect(onClose).not.toHaveBeenCalled()
    rejectSave(new Error('Storage failed'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Storage failed')
    expect(screen.getByLabelText('Fragrance name')).toHaveValue('Corrected')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('shows the conflicting saved identity and opens pair review only on request', async () => {
    const target = await repository.upsertFragrance({ brand: 'Brand', name: 'Target' })
    const { onReviewDuplicate, onClose } = show()
    fireEvent.change(screen.getByLabelText('Fragrance name'), { target: { value: 'Target' } })
    fireEvent.change(screen.getByLabelText(/Variant or concentration/), { target: { value: '' } })
    save()
    expect(await screen.findByRole('alert')).toHaveTextContent(/Brand.*Target/)
    expect(onReviewDuplicate).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(await db.fragrances.get(fragrance.id)).toEqual(fragrance)
    fireEvent.click(screen.getByRole('button', { name: 'Review duplicate' }))
    expect(onReviewDuplicate).toHaveBeenCalledWith([fragrance.id, target.id])
  })

  it('clears stale conflict actions when details change', async () => {
    await repository.upsertFragrance({ brand: 'Brand', name: 'Target' })
    show()
    fireEvent.change(screen.getByLabelText('Fragrance name'), { target: { value: 'Target' } })
    fireEvent.change(screen.getByLabelText(/Variant or concentration/), { target: { value: '' } })
    save()
    await screen.findByRole('button', { name: 'Review duplicate' })
    fireEvent.change(screen.getByLabelText('Fragrance name'), { target: { value: 'Distinct' } })
    expect(screen.queryByRole('button', { name: 'Review duplicate' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('explains the undo consequence when a merge can still be undone', async () => {
    const other = await repository.upsertFragrance({ brand: 'Brand', name: 'Old' })
    await mergeFragrances(fragrance.id, other.id)
    show()
    expect(await screen.findByText(/Saving changes will make Undo latest merge unavailable/)).toBeInTheDocument()
  })
})
