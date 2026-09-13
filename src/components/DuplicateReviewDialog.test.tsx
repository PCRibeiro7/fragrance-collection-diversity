import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DuplicateReviewDialog } from './DuplicateReviewDialog'
import { normalizeFragranceInput } from '../domain/identity'
import type { Fragrance } from '../domain/types'
import { db } from '../data/db'
import { keepSeparate } from '../data/duplicateDecisions'
import { mergeFragrances } from '../data/merge'

const items: Fragrance[] = ['one', 'two'].map((id, index) => ({
  id, brand: 'Brand', name: index ? 'Scent Eau de Parfum' : 'Scent', owned: index === 1,
  sourceUrls: { fragrantica: `https://example.com/${id}` }, createdAt: '', updatedAt: '',
  ...normalizeFragranceInput({ brand: 'Brand', name: index ? 'Scent Eau de Parfum' : 'Scent' }),
}))
beforeEach(async () => {
  await db.transaction('rw', db.allTables, async () => { for (const table of db.allTables) await table.clear() })
  await db.fragrances.bulkAdd(items)
})
afterEach(cleanup)

function show(fragrances = items) {
  return render(<DuplicateReviewDialog fragrances={fragrances} captures={[]} observations={[]} onClose={() => {}} onMerged={() => {}} />)
}

async function ready() { await waitFor(() => expect(screen.queryByText(/Loading saved review decisions/)).not.toBeInTheDocument()) }

describe('duplicate review', () => {
  it('requires URL selection before merging and exposes permanent history and undo', async () => {
    show()
    await ready()
    fireEvent.click(screen.getByText('Review merge'))
    expect(screen.getByRole('radio', { name: /Scent Eau de Parfum/ })).toBeChecked()
    expect(screen.getByText('Confirm merge')).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Keep fragrantica URL'), { target: { value: 'https://example.com/one' } })
    fireEvent.click(screen.getByText('Confirm merge'))
    await waitFor(() => expect(screen.getByText('Undo latest merge')).toBeEnabled())
    fireEvent.click(screen.getByRole('tab', { name: 'Merge history (1)' }))
    expect(await screen.findByText(/Before: removed record/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Undo latest merge'))
    await waitFor(() => expect(screen.getByText(/Undone/)).toBeInTheDocument())
    expect(await db.fragrances.count()).toBe(2)
  })

  it('remembers kept-separate decisions across remounts and lets users reconsider', async () => {
    const view = show()
    await ready()
    fireEvent.click(screen.getByText('Keep separate'))
    await waitFor(() => expect(screen.queryByText('Review merge')).not.toBeInTheDocument())
    view.unmount()
    show()
    await ready()
    expect(screen.queryByText('Review merge')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Kept separate (1)' }))
    fireEvent.click(screen.getByText('Review again'))
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Suggestions (1)' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('tab', { name: 'Suggestions (1)' }))
    expect(screen.getByText('Review merge')).toBeEnabled()
  })

  it('loads undo with just one fragrance and disables it after a later decision', async () => {
    await mergeFragrances('one', 'two', items[0].sourceUrls)
    show(await db.fragrances.toArray())
    await ready()
    expect(screen.getByText('Undo latest merge')).toBeEnabled()
    await db.fragrances.add({ ...items[1], id: 'three' })
    await keepSeparate('one', 'three')
    await waitFor(() => expect(screen.getByText('Undo latest merge')).toBeDisabled())
    fireEvent.click(screen.getByRole('tab', { name: 'Merge history (1)' }))
    expect(screen.getByText('View current fragrance')).toBeInTheDocument()
  })
})
