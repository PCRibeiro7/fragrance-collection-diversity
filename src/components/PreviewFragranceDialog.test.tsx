import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../data/db'
import { upsertFragrance } from '../data/repository'
import { PreviewFragranceDialog } from './PreviewFragranceDialog'

beforeEach(async () => {
  await db.transaction('rw', db.allTables, async () => {
    for (const table of db.allTables) await table.clear()
  })
})
afterEach(cleanup)

describe('fragrance preview dialog', () => {
  it('reports collection overlap without writing the candidate', async () => {
    const owned = await upsertFragrance({ brand: 'Maison', name: 'Owned', owned: true })
    const onClose = vi.fn()
    render(<PreviewFragranceDialog fragrances={[owned]} observations={[]} onClose={onClose} />)

    fireEvent.change(screen.getByPlaceholderText('Diptyque'), { target: { value: 'Candidate Brand' } })
    fireEvent.change(screen.getByPlaceholderText('Philosykos'), { target: { value: 'Candidate Scent' } })
    fireEvent.change(screen.getByLabelText('Fragrantica relationships'), { target: { value: 'Maison | Owned' } })
    fireEvent.change(screen.getByLabelText('Parfumo relationships'), { target: { value: 'Maison | Owned' } })

    await waitFor(() => expect(screen.getByRole('button', { name: /check redundancy/i })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /check redundancy/i }))

    expect(screen.getByText('High redundancy signal')).toBeInTheDocument()
    expect(screen.getByText('direct owned overlaps').parentElement).toHaveTextContent('1direct owned overlaps')
    expect(screen.getByText(/Directly listed on Fragrantica \+ Parfumo/)).toBeInTheDocument()
    expect(await db.fragrances.count()).toBe(1)
    expect(await db.observations.count()).toBe(0)
    expect(onClose).not.toHaveBeenCalled()
  })
})
