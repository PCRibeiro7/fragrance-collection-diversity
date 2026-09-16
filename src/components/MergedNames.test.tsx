import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../data/db'
import { upsertFragrance } from '../data/repository'
import { mergeFragrances } from '../data/merge'
import { AddFragranceDialog } from './AddFragranceDialog'
import { CaptureDialog } from './CaptureDialog'
import { DetailsPanel } from './DetailsPanel'
import { DuplicateReviewDialog } from './DuplicateReviewDialog'
import type { Fragrance } from '../domain/types'

let canonical: Fragrance
let eventId: string
beforeEach(async () => {
  await db.transaction('rw', db.allTables, async () => { for (const table of db.allTables) await table.clear() })
  canonical = await upsertFragrance({ brand: 'Brand', name: 'Canonical', owned: true })
  const old = await upsertFragrance({ brand: 'Brand', name: 'Old' })
  eventId = await mergeFragrances(canonical.id, old.id)
})
afterEach(cleanup)

describe('previously merged names in the app', () => {
  it('previews the canonical fragrance on add and on parsed relationship rows', async () => {
    render(<AddFragranceDialog onClose={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('Diptyque'), { target: { value: 'Brand' } })
    fireEvent.change(screen.getByPlaceholderText('Philosykos'), { target: { value: 'Old' } })
    expect(await screen.findByRole('status')).toHaveTextContent(/Will reuse Brand.*Canonical/)
    fireEvent.change(screen.getByLabelText(/Fragrantica relationships/), { target: { value: 'Brand | Old' } })
    fireEvent.click(screen.getByRole('button', { name: /Review 1 match/ }))
    expect(screen.getByRole('heading', { name: 'Review identity matches' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /Fragrantica identity match/ })).toHaveValue(canonical.id)
    expect(screen.getByRole('option', { name: /Canonical/ })).toBeInTheDocument()
  })

  it('selects an exact previous name as its canonical identity in capture review', async () => {
    render(<CaptureDialog root={canonical} fragrances={[canonical]} captures={[]} observations={[]} onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('Review matches')).toBeEnabled())
    fireEvent.change(screen.getByLabelText(/^Related fragrances/), { target: { value: 'Brand | Old' } })
    fireEvent.click(screen.getByText('Review matches'))
    expect(screen.getByRole('combobox', { name: /Identity match/ })).toHaveValue(canonical.id)
    expect(screen.getByRole('option', { name: /Canonical/ })).toBeInTheDocument()
  })

  it('links previous names to history and removes recognition without deleting history', async () => {
    const onHistory = vi.fn()
    render(<DetailsPanel selection={{ type: 'node', id: canonical.id }} model={{ nodes: [{ ...canonical, cluster: 0 }], edges: [], clusters: [0] }} onClose={() => {}} onCapture={() => {}} onHistory={onHistory} />)
    fireEvent.click(await screen.findByText('View merge history'))
    expect(onHistory).toHaveBeenCalledWith(eventId)
    fireEvent.click(screen.getByText('Stop recognizing this name'))
    expect(await screen.findByText('This previous name is no longer recognized automatically.')).toBeInTheDocument()
    expect(await db.mergeEvents.count()).toBe(1)
    expect(await db.aliases.count()).toBe(0)
  })

  it('supports keyboard navigation and follows history to the current survivor', async () => {
    const onSelectFragrance = vi.fn()
    render(<DuplicateReviewDialog fragrances={[canonical]} captures={[]} observations={[]} onClose={() => {}} onMerged={() => {}} onSelectFragrance={onSelectFragrance} />)
    const first = screen.getByRole('tab', { name: /Suggestions/ })
    fireEvent.keyDown(first, { key: 'End' })
    const history = screen.getByRole('tab', { name: /Merge history/ })
    expect(history).toHaveAttribute('aria-selected', 'true')
    expect(history).toHaveFocus()
    fireEvent.click(await screen.findByText('View current fragrance'))
    expect(onSelectFragrance).toHaveBeenCalledWith(canonical.id)
  })
})
