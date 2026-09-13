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
afterEach(cleanup)

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
})
