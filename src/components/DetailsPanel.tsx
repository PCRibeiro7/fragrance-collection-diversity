import { ArrowRight, ExternalLink, Link2, Network, Plus, X } from 'lucide-react'
import { displayName } from '../domain/identity'
import { directNeighborIds, findSharedNeighbors } from '../domain/graph'
import type { GraphModel, SelectedGraphItem, SimilaritySource } from '../domain/types'
import { setOwned } from '../data/repository'
import { CLUSTER_COLORS } from '../domain/colors'

interface DetailsPanelProps {
  selection: Exclude<SelectedGraphItem, null>
  model: GraphModel
  onClose: () => void
  onCapture: (fragranceId: string, source?: SimilaritySource) => void
}

export function DetailsPanel({ selection, model, onClose, onCapture }: DetailsPanelProps) {
  const fragranceById = new Map(model.nodes.map((node) => [node.id, node]))

  if (selection.type === 'edge') {
    const edge = model.edges.find((item) => item.id === selection.id)
    if (!edge) return null
    const left = fragranceById.get(edge.sourceId)
    const right = fragranceById.get(edge.targetId)
    if (!left || !right) return null

    return (
      <aside className="details-panel">
        <button className="icon-button details-panel__close" type="button" onClick={onClose} aria-label="Close details">
          <X size={18} />
        </button>
        <p className="eyebrow">Relationship evidence</p>
        <h2>{left.name} <span>↔</span> {right.name}</h2>
        <div className="evidence-score">
          <strong>{edge.weight}</strong>
          <span>of 4 possible source-direction observations</span>
        </div>
        <div className="evidence-list">
          {edge.evidence.map((evidence) => {
            const from = fragranceById.get(evidence.fromFragranceId)
            const to = fragranceById.get(evidence.toFragranceId)
            return (
              <div key={`${evidence.source}-${evidence.fromFragranceId}-${evidence.toFragranceId}`}>
                <span className={`source-dot source-dot--${evidence.source}`} />
                <div>
                  <b>{evidence.source === 'fragrantica' ? 'Fragrantica' : 'Parfumo'}</b>
                  <p>{from?.name} <ArrowRight size={12} /> {to?.name}</p>
                </div>
              </div>
            )
          })}
        </div>
        <p className="details-note">Direction is preserved as evidence. The line is undirected only for a cleaner collection map.</p>
      </aside>
    )
  }

  const fragrance = fragranceById.get(selection.id)
  if (!fragrance) return null
  const neighborIds = directNeighborIds(fragrance.id, model.edges)
  const relationships = model.edges
    .filter((edge) => edge.sourceId === fragrance.id || edge.targetId === fragrance.id)
    .map((edge) => ({
      edge,
      fragrance: fragranceById.get(edge.sourceId === fragrance.id ? edge.targetId : edge.sourceId),
    }))
    .filter((item) => item.fragrance)
    .sort((a, b) => b.edge.weight - a.edge.weight)
  const shared = findSharedNeighbors(fragrance.id, model.nodes, model.edges)
  const fragranceId = fragrance.id
  const isOwned = fragrance.owned

  async function toggleOwned() {
    if (isOwned && !window.confirm('Remove this fragrance from your owned collection? Its relationship data will be kept as context.')) return
    await setOwned(fragranceId, !isOwned)
  }

  return (
    <aside className="details-panel">
      <button className="icon-button details-panel__close" type="button" onClick={onClose} aria-label="Close details">
        <X size={18} />
      </button>
      <p className="eyebrow">{fragrance.owned ? 'In your collection' : 'Context fragrance'}</p>
      <h2>{fragrance.name}</h2>
      <p className="details-brand">{fragrance.brand}{fragrance.variant ? ` · ${fragrance.variant}` : ''}</p>
      <div className="cluster-chip">
        <span style={{ background: CLUSTER_COLORS[fragrance.cluster % CLUSTER_COLORS.length] }} />
        Similarity group {String(fragrance.cluster + 1).padStart(2, '0')}
      </div>

      <div className="details-actions">
        <button className="button button--primary button--full" type="button" onClick={() => onCapture(fragrance.id)} disabled={!fragrance.owned}>
          <Plus size={15} /> Capture relationships
        </button>
        <button className="button button--quiet button--full" type="button" onClick={toggleOwned}>
          {fragrance.owned ? 'Remove from collection' : 'Mark as owned'}
        </button>
      </div>

      {(fragrance.sourceUrls.fragrantica || fragrance.sourceUrls.parfumo) && (
        <section className="detail-section">
          <h3>Source pages</h3>
          <div className="source-links">
            {(['fragrantica', 'parfumo'] as const).map((source) =>
              fragrance.sourceUrls[source] ? (
                <a key={source} href={fragrance.sourceUrls[source]} target="_blank" rel="noreferrer">
                  {source === 'fragrantica' ? 'Fragrantica' : 'Parfumo'} <ExternalLink size={13} />
                </a>
              ) : null,
            )}
          </div>
        </section>
      )}

      <section className="detail-section">
        <h3><Link2 size={15} /> Direct relationships <span>{neighborIds.size}</span></h3>
        {relationships.length ? (
          <div className="relationship-list">
            {relationships.map(({ edge, fragrance: related }) => (
              <div key={edge.id}>
                <span>{related && displayName(related)}</span>
                <b>{edge.weight}/4</b>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-detail">No recorded direct relationships. This means unknown—not necessarily unique.</p>
        )}
      </section>

      <section className="detail-section">
        <h3><Network size={15} /> Shared context</h3>
        {shared.length ? (
          <div className="shared-list">
            {shared.slice(0, 6).map((result) => (
              <div key={result.fragranceId}>
                <b>{fragranceById.get(result.fragranceId)?.name}</b>
                <span>
                  via {result.sharedIds.slice(0, 3).map((id) => fragranceById.get(id)?.name).join(', ')}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-detail">No shared connections with other owned fragrances yet.</p>
        )}
      </section>
    </aside>
  )
}
