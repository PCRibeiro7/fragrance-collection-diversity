import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../data/db'
import { replaceCapture, upsertFragrance } from '../data/repository'
import { AddFragranceDialog } from './AddFragranceDialog'

beforeEach(async () => {
  await db.transaction('rw', db.allTables, async () => {
    for (const table of db.allTables) await table.clear()
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('add fragrance identity review', () => {
  it('reviews both source lists, preserves explicit matches and saves only remaining rows', async () => {
    const known = await upsertFragrance({ brand: 'Known Brand', name: 'Known', owned: true })
    const onClose = vi.fn()
    const onSaved = vi.fn()
    render(<AddFragranceDialog onClose={onClose} onSaved={onSaved} />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save fragrance' })).toBeEnabled())
    fireEvent.change(screen.getByPlaceholderText('Diptyque'), { target: { value: 'Root Brand' } })
    fireEvent.change(screen.getByPlaceholderText('Philosykos'), { target: { value: 'Root Name' } })
    fireEvent.change(screen.getByLabelText(/Fragrantica relationships/), {
      target: { value: 'Known Brand | Known\nNew Brand | New Name' },
    })
    fireEvent.change(screen.getByLabelText(/Parfumo relationships/), {
      target: { value: 'Other Brand | Other Name' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Review 3 matches/ }))
    expect(screen.getByRole('heading', { name: 'Review identity matches' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Fragrantica fragrance identities' })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Parfumo fragrance identities' })).toBeInTheDocument()
    expect(screen.getByText('in source lists').parentElement).toHaveTextContent('3in source lists')
    expect(screen.getByText('added').parentElement).toHaveTextContent('+3added')
    expect(screen.getByLabelText('Fragrantica identity match for Known Brand | Known')).toHaveValue(known.id)

    fireEvent.change(screen.getByLabelText('Fragrantica variant for New Brand | New Name'), {
      target: { value: 'Edited' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Remove Parfumo row for Other Brand | Other Name' }))
    expect(screen.getByText('in source lists').parentElement).toHaveTextContent('2in source lists')

    fireEvent.click(screen.getByRole('button', { name: 'Save fragrance and relationships' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(onSaved).toHaveBeenCalledOnce()

    const fragrances = await db.fragrances.toArray()
    const savedRoot = fragrances.find((item) => item.brand === 'Root Brand' && item.name === 'Root Name')
    const edited = fragrances.find((item) => item.brand === 'New Brand' && item.name === 'New Name')
    expect(savedRoot?.owned).toBe(true)
    expect(edited?.variant).toBe('Edited')
    expect(fragrances.some((item) => item.name === 'Other Name')).toBe(false)

    const observations = await db.observations.toArray()
    expect(observations).toHaveLength(2)
    expect(observations.map((item) => item.toFragranceId)).toContain(known.id)
    expect((await db.captures.toArray()).map((item) => item.source).sort()).toEqual(['fragrantica', 'parfumo'])
  })

  it('previews an imported partial list, preserves concentrations on Back, and requires acknowledgment before replacement', async () => {
    const root = await upsertFragrance({ brand: 'Diptyque', name: 'Philosykos', variant: 'Eau de Parfum', owned: true })
    const kept = await upsertFragrance({ brand: 'Brand', name: 'Target', variant: 'Eau de Toilette', owned: true })
    const removed = await upsertFragrance({ brand: 'Brand', name: 'Old' })
    await replaceCapture({ rootFragranceId: root.id, source: 'fragrantica', targets: [removed] })
    const pageUrl = 'https://www.fragrantica.com/perfume/Diptyque/Philosykos-3865.html'
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true, result: {
      source: 'fragrantica', pageUrl, fragrance: root,
      similarities: [kept, { brand: 'Brand', name: 'Target', variant: 'Eau de Parfum' }],
      completeness: 'partial', advertisedTotal: 30, warnings: ['Only 2 of 30 advertised similarities were extracted.'], upstreamStatus: 200,
    } }))
    vi.stubGlobal('fetch', fetchMock)
    const onClose = vi.fn()
    render(<AddFragranceDialog onClose={onClose} />)

    fireEvent.change(screen.getByLabelText('Fragrance page URL'), { target: { value: pageUrl } })
    fireEvent.click(screen.getByRole('button', { name: 'Import link' }))
    await screen.findByRole('button', { name: 'Use details and similarities' })
    expect(fetchMock).toHaveBeenCalledWith('/.netlify/functions/import-fragrance', expect.objectContaining({ method: 'POST', body: JSON.stringify({ url: pageUrl }) }))
    expect(await db.observations.count()).toBe(1)
    expect(screen.getByPlaceholderText('Philosykos')).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: 'Use details and similarities' }))
    expect(screen.getByPlaceholderText('Philosykos')).toHaveValue('Philosykos')
    expect(screen.getByLabelText(/Fragrantica page/)).toHaveValue(pageUrl)
    await waitFor(() => expect(screen.getByRole('button', { name: /Review 2 matches/ })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /Review 2 matches/ }))
    expect(screen.getByLabelText('Fragrantica variant for Brand | Target (Eau de Toilette)')).toHaveValue('Eau de Toilette')
    expect(screen.getByLabelText('Fragrantica identity match for Brand | Target (Eau de Toilette)')).toHaveValue(kept.id)
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: /Review 2 matches/ }))
    expect(screen.getByLabelText('Fragrantica variant for Brand | Target (Eau de Parfum)')).toHaveValue('Eau de Parfum')
    expect(screen.getByRole('button', { name: 'Save fragrance and relationships' })).toBeDisabled()
    expect(await db.observations.count()).toBe(1)
    fireEvent.click(screen.getByRole('checkbox', { name: /I understand this Fragrantica list/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save fragrance and relationships' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    const saved = await db.fragrances.toArray()
    expect(saved.filter((item) => item.name === 'Target').map((item) => item.variant).sort()).toEqual(['Eau de Parfum', 'Eau de Toilette'])
    expect((await db.observations.toArray()).map((item) => item.toFragranceId)).not.toContain(removed.id)
  })

  it('uses details-only results without replacing saved relationships and shows challenges without retrying', async () => {
    const root = await upsertFragrance({ brand: 'Diptyque', name: 'Philosykos', variant: 'Eau de Parfum', owned: true })
    const target = await upsertFragrance({ brand: 'Brand', name: 'Kept' })
    const previous = await replaceCapture({ rootFragranceId: root.id, source: 'fragrantica', targets: [target] })
    const pageUrl = 'https://www.fragrantica.com/perfume/Diptyque/Philosykos-3865.html'
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ ok: false, error: { code: 'challenge', message: 'The source requires a browser challenge.' } }, { status: 502 }))
      .mockResolvedValueOnce(Response.json({ ok: true, result: {
        source: 'fragrantica', pageUrl, fragrance: root, similarities: [], completeness: 'unknown',
        warnings: ['The similarity list is loaded by browser JavaScript.'], upstreamStatus: 200,
      } }))
    vi.stubGlobal('fetch', fetchMock)
    const onClose = vi.fn()
    render(<AddFragranceDialog onClose={onClose} />)

    fireEvent.change(screen.getByLabelText('Fragrance page URL'), { target: { value: 'https://www.parfumo.com/Perfumes/Diptyque/Philosykos_Eau_de_Parfum' } })
    fireEvent.click(screen.getByRole('button', { name: 'Import link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('browser challenge')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(screen.getByPlaceholderText('Philosykos')).toHaveValue('')
    fireEvent.change(screen.getByLabelText('Fragrance page URL'), { target: { value: pageUrl } })
    fireEvent.click(screen.getByRole('button', { name: 'Import link' }))
    await screen.findByRole('button', { name: 'Use imported details' })
    expect(screen.getByText('Relationships need browser capture', { exact: false })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use imported details' }))
    expect(screen.getByRole('link', { name: 'Open Fragrantica similarity section' })).toHaveAttribute('href', `${pageUrl}#similar`)
    expect(screen.getByLabelText(/Fragrantica relationships/)).toHaveValue('')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save fragrance' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Save fragrance' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(await db.observations.toArray()).toEqual(previous.observations)
    expect((await db.captures.toArray()).map((item) => item.id)).toEqual([previous.capture.id])
  })

  it('loads a browser capture into preview and requires acknowledgment before saving its loaded relationships', async () => {
    const pageUrl = 'https://www.fragrantica.com/perfume/Diptyque/Philosykos-3865.html'
    const fileText = JSON.stringify({ format: 'scent-map-fragrantica-capture', version: 1, pageUrl, identityHtml: '<h1>Philosykos</h1>', similarityHtml: '<div id="similar">Loaded cards</div>' })
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true, result: {
      source: 'fragrantica', pageUrl, captureMethod: 'browser', fragrance: { brand: 'Diptyque', name: 'Philosykos', variant: 'Eau de Parfum' },
      similarities: [{ brand: 'Brand', name: 'Target', variant: 'Eau de Toilette' }], completeness: 'unknown',
      warnings: ['Only loaded cards were captured.'],
    } }))
    vi.stubGlobal('fetch', fetchMock)
    const onClose = vi.fn()
    render(<AddFragranceDialog onClose={onClose} />)

    fireEvent.change(screen.getByLabelText('Browser capture file'), { target: { files: [{ size: fileText.length, text: async () => fileText }] } })
    await screen.findByRole('button', { name: 'Use details and similarities' })
    expect(screen.getByText('Captured from your loaded browser page. Review the list before saving.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/.netlify/functions/import-fragrance-capture', expect.objectContaining({ body: fileText }))
    expect(await db.fragrances.count()).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Use details and similarities' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Review 1 match/ })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /Review 1 match/ }))
    expect(screen.getByLabelText('Fragrantica variant for Brand | Target (Eau de Toilette)')).toHaveValue('Eau de Toilette')
    expect(screen.getByRole('button', { name: 'Save fragrance and relationships' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /I understand this Fragrantica list/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save fragrance and relationships' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(await db.observations.count()).toBe(1)
  })
})
