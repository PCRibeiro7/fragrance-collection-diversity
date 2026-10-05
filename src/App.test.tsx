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
