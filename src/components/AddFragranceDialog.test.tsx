import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../data/db'
import { upsertFragrance } from '../data/repository'
import { AddFragranceDialog } from './AddFragranceDialog'

beforeEach(async () => {
  await db.transaction('rw', db.allTables, async () => {
    for (const table of db.allTables) await table.clear()
  })
})
afterEach(cleanup)

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
})
