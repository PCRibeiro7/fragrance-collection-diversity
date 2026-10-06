import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { db } from './data/db'
import { upsertFragrance } from './data/repository'
import { keepSeparate } from './data/duplicateDecisions'
import type { GraphModel, SelectedGraphItem } from './domain/types'

vi.mock('./components/GraphView', () => ({
  GraphView: ({ model, selected, onSelect }: { model: GraphModel; selected: SelectedGraphItem; onSelect: (item: SelectedGraphItem) => void }) =>
    <div data-testid="map" data-selected={selected?.id}>
      {model.nodes.map((node) => <button key={node.id} onClick={() => onSelect({ type: 'node', id: node.id })}>Map {node.name}</button>)}
    </div>,
}))

beforeEach(async () => {
  await db.transaction('rw', db.allTables, async () => { for (const table of db.allTables) await table.clear() })
})
afterEach(cleanup)

describe('fragrance editing in the app', () => {
  it.each([true, false])('opens from details, refreshes saved labels and links, and keeps selection (owned=%s)', async (owned) => {
    const item = await upsertFragrance({ brand: 'Brand', name: 'Original', owned })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Map Original' }))
    expect(screen.getByRole('button', { name: 'Capture relationships' }).hasAttribute('disabled')).toBe(!owned)
    fireEvent.click(screen.getByRole('button', { name: 'Edit fragrance' }))
    fireEvent.change(screen.getByLabelText('Fragrance name'), { target: { value: 'Corrected' } })
    fireEvent.change(screen.getByLabelText('Brand'), { target: { value: 'New Brand' } })
    fireEvent.change(screen.getByLabelText(/Variant or concentration/), { target: { value: 'EDP' } })
    fireEvent.change(screen.getByLabelText(/Fragrantica page/), { target: { value: 'https://example.com/new' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByRole('button', { name: 'Map Corrected' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Corrected' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Fragrantica/ })).toHaveAttribute('href', 'https://example.com/new')
    expect(screen.getByText('Fragrance updated')).toBeInTheDocument()
    expect(screen.getByTestId('map')).toHaveAttribute('data-selected', item.id)
    if (owned) expect(screen.getByRole('button', { name: /Corrected.*New Brand.*EDP/ })).toBeInTheDocument()
    expect((await db.fragrances.get(item.id))?.owned).toBe(owned)
  })

  it('discards the blocked edit and explicitly merges current records even without a suggestion', async () => {
    const original = await upsertFragrance({ brand: 'First Brand', name: 'Original', owned: true })
    const target = await upsertFragrance({ brand: 'Second Brand', name: 'Target' })
    await keepSeparate(original.id, target.id)
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Map Original' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit fragrance' }))
    fireEvent.change(screen.getByLabelText('Brand'), { target: { value: 'Second Brand' } })
    fireEvent.change(screen.getByLabelText('Fragrance name'), { target: { value: 'Target' } })
    fireEvent.change(screen.getByLabelText(/Parfumo page/), { target: { value: 'https://example.com/unsaved' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Review duplicate' }))
    expect(screen.getByRole('heading', { name: 'Review merge' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Fragrance name')).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /First Brand.*Original/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Second Brand.*Target/ })).toBeInTheDocument()
    expect(screen.queryByText('https://example.com/unsaved')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm merge' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Confirm merge' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo latest merge' })).toBeEnabled())
    const [saved] = await db.fragrances.toArray()
    expect(saved).toMatchObject({ id: original.id, brand: 'First Brand', name: 'Original' })
    expect(saved.sourceUrls.parfumo).toBeUndefined()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('fragrance group previews in the app', () => {
  it('uses map source and detail settings while ignoring search, visibility, and group focus', async () => {
    await upsertFragrance({ brand: 'Brand', name: 'Owned', owned: true })
    await upsertFragrance({ brand: 'Brand', name: 'Context' })
    render(<App />)
    await screen.findByRole('button', { name: 'Map Context' })
    fireEvent.change(screen.getByLabelText('Evidence source'), { target: { value: 'parfumo' } })
    const detailPanel = screen.getByLabelText('Group detail: broader groups to more separate groups').closest('details')!
    fireEvent.click(detailPanel.querySelector('summary')!)
    fireEvent.change(screen.getByLabelText('Group detail: broader groups to more separate groups'), { target: { value: '0.4' } })
    fireEvent.change(screen.getByLabelText('Find a fragrance'), { target: { value: 'No match' } })
    fireEvent.change(screen.getByLabelText('Show fragrances'), { target: { value: 'owned' } })
    const focus = screen.getByLabelText('Focus similarity group') as HTMLSelectElement
    const ownedOption = [...focus.options].find((option) => option.text === 'Owned')!
    fireEvent.change(focus, { target: { value: ownedOption.value } })

    async function preview() {
      fireEvent.click(screen.getByRole('button', { name: 'Preview a fragrance' }))
      fireEvent.change(screen.getByPlaceholderText('Diptyque'), { target: { value: 'Brand' } })
      fireEvent.change(screen.getByPlaceholderText('Philosykos'), { target: { value: 'Candidate' } })
      fireEvent.change(screen.getByLabelText('Parfumo relationships'), { target: { value: 'Brand | Context' } })
      await waitFor(() => expect(screen.getByRole('button', { name: /check redundancy/i })).toBeEnabled())
      fireEvent.click(screen.getByRole('button', { name: /check redundancy/i }))
    }

    await preview()
    expect(screen.getByText('Parfumo · Group detail: Broad (0.4)')).toBeInTheDocument()
    const groupSection = screen.getByRole('region', { name: 'Predicted group' })
    expect(within(groupSection).getByText('Would join an existing group')).toBeInTheDocument()
    expect(within(groupSection).getByText('Context (context only)')).toBeInTheDocument()
    expect(within(groupSection).getByText('Brand · Context')).toBeInTheDocument()
    const preferenceBefore = window.localStorage.getItem('scent-map-group-resolution')
    fireEvent.change(within(groupSection).getByRole('slider'), { target: { value: '2.5' } })
    expect(within(groupSection).getByText('Would form a new group')).toBeInTheDocument()
    expect(screen.getByLabelText('Group detail: broader groups to more separate groups')).toHaveValue('0.4')
    expect(window.localStorage.getItem('scent-map-group-resolution')).toBe(preferenceBefore)
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }))

    await preview()
    expect(screen.getByRole('slider', { name: /preview group detail/i })).toHaveValue('0.4')
    expect(screen.getByText('Would join an existing group')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }))

    fireEvent.change(screen.getByLabelText('Evidence source'), { target: { value: 'fragrantica' } })
    await preview()
    expect(screen.getByText('Not enough evidence to predict')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }))

    fireEvent.change(screen.getByLabelText('Evidence source'), { target: { value: 'parfumo' } })
    fireEvent.change(screen.getByLabelText('Group detail: broader groups to more separate groups'), { target: { value: '2.5' } })
    await preview()
    expect(screen.getByText('Would form a new group')).toBeInTheDocument()
    expect(screen.getByText('Parfumo · Group detail: Most separate (2.5)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }))
  })
})
