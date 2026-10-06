import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../data/db'
import { replaceCapture, upsertFragrance } from '../data/repository'
import { keepSeparate } from '../data/duplicateDecisions'
import { identityKey } from '../domain/identity'
import { buildGraphModel } from '../domain/graph'
import { CLUSTER_COLORS } from '../domain/colors'
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
    const before = await Promise.all(db.allTables.map((table) => table.toArray()))
    render(<PreviewFragranceDialog fragrances={[owned]} observations={[]} currentModel={buildGraphModel([owned], [])} enabledSources={new Set(['fragrantica', 'parfumo'])} groupResolution={1} onClose={onClose} />)

    fireEvent.change(screen.getByPlaceholderText('Diptyque'), { target: { value: 'Candidate Brand' } })
    fireEvent.change(screen.getByPlaceholderText('Philosykos'), { target: { value: 'Candidate Scent' } })
    fireEvent.change(screen.getByLabelText('Fragrantica relationships'), { target: { value: 'Maison | Owned' } })
    fireEvent.change(screen.getByLabelText('Parfumo relationships'), { target: { value: 'Maison | Owned' } })

    await waitFor(() => expect(screen.getByRole('button', { name: /check redundancy/i })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /check redundancy/i }))

    expect(screen.getByText('High redundancy signal')).toBeInTheDocument()
    expect(screen.getByText('direct owned overlaps').parentElement).toHaveTextContent('1direct owned overlaps')
    expect(screen.getByText(/Directly listed on Fragrantica \+ Parfumo/)).toBeInTheDocument()
    expect(screen.getByText('Would join an existing group')).toBeInTheDocument()
    const groupSection = screen.getByRole('region', { name: 'Predicted group' })
    expect(within(groupSection).getByText('Owned', { selector: '.cluster-chip' }).querySelector('span')).toHaveStyle({ background: CLUSTER_COLORS[0] })
    const slider = within(groupSection).getByRole('slider', { name: /preview group detail/i })
    expect(slider).toHaveValue('1')
    expect(slider).toHaveAttribute('min', '0.4')
    expect(slider).toHaveAttribute('max', '2.5')
    expect(slider).toHaveAttribute('step', '0.1')
    expect(within(groupSection).getByRole('button', { name: 'Reset to map setting' })).toBeDisabled()
    expect(within(groupSection).getAllByRole('listitem')).toHaveLength(1)
    fireEvent.change(slider, { target: { value: '2.5' } })
    expect(slider).toHaveAttribute('aria-valuetext', 'Most separate, resolution 2.5')
    expect(within(groupSection).getByText('Would form a new group')).toBeInTheDocument()
    expect(within(groupSection).queryByRole('listitem')).not.toBeInTheDocument()
    expect(screen.getByText('High redundancy signal')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit inputs' }))
    fireEvent.click(screen.getByRole('button', { name: /check redundancy/i }))
    const updatedSection = screen.getByRole('region', { name: 'Predicted group' })
    expect(within(updatedSection).getByRole('slider')).toHaveValue('2.5')
    expect(within(updatedSection).getByText('Would form a new group')).toBeInTheDocument()
    fireEvent.click(within(updatedSection).getByRole('button', { name: 'Reset to map setting' }))
    expect(within(updatedSection).getByRole('slider')).toHaveValue('1')
    expect(within(updatedSection).getByText('Would join an existing group')).toBeInTheDocument()
    expect(within(updatedSection).getAllByRole('listitem')).toHaveLength(1)
    expect(await db.fragrances.count()).toBe(1)
    expect(await db.observations.count()).toBe(0)
    expect(onClose).not.toHaveBeenCalled()
    expect(await Promise.all(db.allTables.map((table) => table.toArray()))).toEqual(before)
  })

  it('expands temporary members and recomputes the prediction after editing inputs', async () => {
    render(<PreviewFragranceDialog fragrances={[]} observations={[]} currentModel={buildGraphModel([], [])} enabledSources={new Set(['fragrantica'])} groupResolution={0.4} onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Diptyque'), { target: { value: 'Brand' } })
    fireEvent.change(screen.getByPlaceholderText('Philosykos'), { target: { value: 'Candidate' } })
    fireEvent.change(screen.getByLabelText('Fragrantica relationships'), { target: { value: Array.from({ length: 7 }, (_, index) => `Brand | Context ${index}`).join('\n') } })
    await waitFor(() => expect(screen.getByRole('button', { name: /check redundancy/i })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /check redundancy/i }))
    const groupSection = screen.getByRole('region', { name: 'Predicted group' })
    expect(within(groupSection).getByText('Would form a new group')).toBeInTheDocument()
    expect(within(groupSection).getAllByRole('listitem')).toHaveLength(5)
    expect(within(groupSection).getAllByText('Temporary context')).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', { name: 'Show all 7 members' }))
    expect(within(groupSection).getAllByRole('listitem')).toHaveLength(7)
    expect(screen.getByRole('button', { name: 'Show fewer members' })).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Show fewer members' }))
    expect(within(groupSection).getAllByRole('listitem')).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', { name: 'Edit inputs' }))
    fireEvent.change(screen.getByLabelText('Fragrantica relationships'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Parfumo relationships'), { target: { value: 'Brand | Context 0' } })
    fireEvent.click(screen.getByRole('button', { name: /check redundancy/i }))
    expect(screen.getByText('Not enough evidence to predict')).toBeInTheDocument()
    expect(screen.getByText('Not enough mapped evidence')).toBeInTheDocument()
    expect(screen.getByText('Fragrantica · Group detail: Broad (0.4)')).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('slider', { name: /preview group detail/i }), { target: { value: '2.5' } })
    expect(screen.getByText('Not enough evidence to predict')).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    expect(await db.fragrances.count()).toBe(0)
  })

  it('simulates replacement for an aliased saved candidate without changing captures or review state', async () => {
    const candidate = await upsertFragrance({ brand: 'Brand', name: 'Candidate', owned: true })
    const owned = await upsertFragrance({ brand: 'Brand', name: 'Owned', owned: true })
    await replaceCapture({ rootFragranceId: candidate.id, source: 'fragrantica', targets: [owned] })
    const identity = { brand: 'Brand', name: 'Previous name' }
    await db.aliases.put({ id: identityKey(identity), identity, fragranceId: candidate.id, mergeEventId: 'merge' })
    await keepSeparate(candidate.id, owned.id)
    const fragrances = await db.fragrances.toArray()
    const observations = await db.observations.toArray()
    const before = await Promise.all(db.allTables.map((table) => table.toArray()))
    render(<PreviewFragranceDialog fragrances={fragrances} observations={observations} currentModel={buildGraphModel(fragrances, observations)} enabledSources={new Set(['fragrantica', 'parfumo'])} groupResolution={1} onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Diptyque'), { target: { value: 'Brand' } })
    fireEvent.change(screen.getByPlaceholderText('Philosykos'), { target: { value: 'Previous name' } })
    fireEvent.change(screen.getByLabelText('Fragrantica relationships'), { target: { value: 'Brand | Unknown' } })
    await waitFor(() => expect(screen.getByRole('button', { name: /check redundancy/i })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /check redundancy/i }))
    expect(screen.getByText('Already in your collection')).toBeInTheDocument()
    expect(screen.getByText('Would form a new group')).toBeInTheDocument()
    expect(screen.getByText('direct owned overlaps').parentElement).toHaveTextContent('1direct owned overlaps')
    expect(await Promise.all(db.allTables.map((table) => table.toArray()))).toEqual(before)
  })
})
