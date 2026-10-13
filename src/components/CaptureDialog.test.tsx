import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../data/db'
import { replaceCapture, upsertFragrance } from '../data/repository'
import { CaptureDialog } from './CaptureDialog'

beforeEach(async () => {
  await db.transaction('rw', db.allTables, async () => {
    for (const table of db.allTables) await table.clear()
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function beginReview(text: string) {
  await waitFor(() => expect(screen.getByText('Review matches')).toBeEnabled())
  fireEvent.change(screen.getByLabelText(/^Related fragrances/), { target: { value: text } })
  fireEvent.click(screen.getByText('Review matches'))
}

describe('capture review row removal', () => {
  it('removes incomplete and saved rows, preserves edits and matches, and saves only remaining rows', async () => {
    const root = await upsertFragrance({ brand: 'Root', name: 'Root', owned: true })
    const kept = await upsertFragrance({ brand: 'Brand', name: 'Kept', owned: true })
    const removed = await upsertFragrance({ brand: 'Brand', name: 'Removed', owned: true })
    const previous = await replaceCapture({ rootFragranceId: root.id, source: 'fragrantica', targets: [kept, removed] })
    const onClose = vi.fn()
    render(<CaptureDialog root={root} fragrances={[root, kept, removed]} captures={[previous.capture]} observations={previous.observations} onClose={onClose} />)
    await beginReview('Brand | Removed\nBrand | Kept\nBrand | New')
    fireEvent.change(screen.getByLabelText('Brand for Brand | New'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Variant for Brand | Kept'), { target: { value: 'Edited' } })
    fireEvent.change(screen.getByLabelText('Identity match for Brand | Kept'), { target: { value: kept.id } })
    fireEvent.click(screen.getByText('Replace source list'))
    expect(screen.getByText('Complete the brand and fragrance name on every row.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove row for Brand | New' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove row for Brand | Removed' }))
    expect(screen.queryByText('Complete the brand and fragrance name on every row.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Variant for Brand | Kept')).toHaveValue('Edited')
    expect(screen.getByLabelText('Identity match for Brand | Kept')).toHaveValue(kept.id)
    expect(screen.getByText('in new list').parentElement).toHaveTextContent('1in new list')
    expect(screen.getByText('added').parentElement).toHaveTextContent('+0added')
    expect(screen.getByText('removed').parentElement).toHaveTextContent('−1removed')
    expect(screen.getByText('Removing:').parentElement).toHaveTextContent('Removed')
    expect(await db.observations.count()).toBe(2)

    fireEvent.click(screen.getByText('Replace source list'))
    expect(screen.getByRole('button', { name: 'Remove row for Brand | Kept' })).toBeDisabled()
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect((await db.observations.toArray()).map((item) => item.toFragranceId)).toEqual([kept.id])
    expect((await db.fragrances.toArray()).some((item) => item.name === 'New')).toBe(false)
  })

  it('blocks an empty replacement and restores the original pasted text on Back', async () => {
    const root = await upsertFragrance({ brand: 'Root', name: 'Root', owned: true })
    render(<CaptureDialog root={root} fragrances={[root]} captures={[]} observations={[]} onClose={() => {}} />)
    await beginReview('Brand | Only')
    fireEvent.click(screen.getByRole('button', { name: 'Remove row for Brand | Only' }))
    expect(screen.getByRole('status')).toHaveTextContent('No fragrances left to review')
    expect(screen.getByText('Replace source list')).toBeDisabled()
    expect(await db.captures.count()).toBe(0)
    fireEvent.click(screen.getByText('Back'))
    expect(screen.getByLabelText(/^Related fragrances/)).toHaveValue('Brand | Only')
    fireEvent.click(screen.getByText('Review matches'))
    expect(screen.getByLabelText('Name for Brand | Only')).toHaveValue('Only')
  })

  it('rejects a different concentration, then reviews an unverified import before replacing the matching source', async () => {
    const root = await upsertFragrance({ brand: 'Diptyque', name: 'Philosykos', variant: 'Eau de Parfum', owned: true })
    const target = await upsertFragrance({ brand: 'Brand', name: 'Target', variant: 'Eau de Toilette' })
    const other = await replaceCapture({ rootFragranceId: root.id, source: 'parfumo', targets: [target] })
    const pageUrl = 'https://www.fragrantica.com/perfume/Diptyque/Philosykos-3865.html'
    const result = {
      source: 'fragrantica', pageUrl, fragrance: { brand: 'Diptyque', name: 'Philosykos', variant: 'Eau de Toilette' },
      similarities: [target], completeness: 'unknown', warnings: ['The total similarity count could not be verified.'], upstreamStatus: 200,
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ ok: true, result }))
      .mockResolvedValueOnce(Response.json({ ok: true, result: { ...result, fragrance: root, completeness: 'complete', advertisedTotal: 1, warnings: [] } }))
    vi.stubGlobal('fetch', fetchMock)
    const onClose = vi.fn()
    render(<CaptureDialog root={root} fragrances={[root, target]} captures={[other.capture]} observations={other.observations} onClose={onClose} />)

    fireEvent.change(screen.getByLabelText('Fragrance page URL'), { target: { value: pageUrl } })
    fireEvent.click(screen.getByRole('button', { name: 'Import link' }))
    await screen.findByRole('button', { name: 'Review imported similarities' })
    expect(screen.getByRole('button', { name: 'Review imported similarities' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('matching fragrance and concentration')
    expect(await db.observations.toArray()).toEqual(other.observations)
    fireEvent.click(screen.getByRole('button', { name: 'Import link' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Review imported similarities' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Review imported similarities' }))
    expect(screen.getByLabelText('Variant for Brand | Target (Eau de Toilette)')).toHaveValue('Eau de Toilette')
    expect(screen.getByRole('button', { name: 'Replace source list' })).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Variant for Brand | Target (Eau de Toilette)'), { target: { value: 'Eau de Parfum' } })
    expect(screen.getByRole('button', { name: 'Replace source list' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /I understand this Fragrantica list/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Replace source list' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect((await db.captures.toArray()).map((item) => item.source).sort()).toEqual(['fragrantica', 'parfumo'])
    expect((await db.observations.toArray()).filter((item) => item.source === 'parfumo')).toEqual(other.observations)
  })

  it('loads a Parfumo browser capture and requires acknowledgment while preserving the Fragrantica list', async () => {
    const root = await upsertFragrance({ brand: 'Diptyque', name: 'Philosykos', variant: 'Eau de Parfum', owned: true })
    const target = await upsertFragrance({ brand: 'Diptyque', name: 'Philosykos', variant: 'Eau de Toilette' })
    const other = await replaceCapture({ rootFragranceId: root.id, source: 'fragrantica', targets: [target] })
    const pageUrl = 'https://www.parfumo.com/Perfumes/Diptyque/Philosykos_Eau_de_Parfum'
    const fileText = JSON.stringify({ format: 'scent-map-fragrance-capture', version: 1, source: 'parfumo', pageUrl })
    const result = { source: 'parfumo', pageUrl, captureMethod: 'browser', fragrance: root, similarities: [target], completeness: 'unknown', warnings: ['Only loaded cards were captured.'] }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ ok: true, result: { ...result, source: 'fragrantica' } }))
      .mockResolvedValueOnce(Response.json({ ok: true, result }))
    vi.stubGlobal('fetch', fetchMock)
    const onClose = vi.fn()
    render(<CaptureDialog root={root} fragrances={[root, target]} captures={[other.capture]} observations={other.observations} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Parfumo' }))
    expect(screen.getByRole('button', { name: 'Load browser capture' })).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Browser capture file'), { target: { files: [{ size: fileText.length, text: async () => fileText }] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Use a Parfumo fragrance page for this source.')
    fireEvent.change(screen.getByLabelText('Browser capture file'), { target: { files: [{ size: fileText.length, text: async () => fileText }] } })
    await screen.findByRole('button', { name: 'Review imported similarities' })
    expect(fetchMock).toHaveBeenCalledWith('/.netlify/functions/import-fragrance-capture', expect.objectContaining({ body: fileText }))
    expect(await db.observations.toArray()).toEqual(other.observations)
    fireEvent.click(screen.getByRole('button', { name: 'Review imported similarities' }))
    expect(screen.getByLabelText('Variant for Diptyque | Philosykos (Eau de Toilette)')).toHaveValue('Eau de Toilette')
    expect(screen.getByRole('button', { name: 'Replace source list' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /I understand this Parfumo list/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Replace source list' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect((await db.captures.toArray()).map((item) => item.source).sort()).toEqual(['fragrantica', 'parfumo'])
    expect((await db.observations.toArray()).filter((item) => item.source === 'fragrantica')).toEqual(other.observations)
  })
})
