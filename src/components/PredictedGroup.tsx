import { useState } from 'react'
import { CLUSTER_COLORS } from '../domain/colors'
import { displayName } from '../domain/identity'
import type { PreviewGroupPrediction } from '../domain/previewGroups'

const TITLES = {
  existing: 'Would join an existing group',
  new: 'Would form a new group',
  insufficient: 'Not enough evidence to predict',
}

interface PredictedGroupProps {
  prediction: PreviewGroupPrediction
  mapResolution: number
  onResolutionChange: (resolution: number) => void
}

export function PredictedGroup({ prediction, mapResolution, onResolutionChange }: PredictedGroupProps) {
  const [expanded, setExpanded] = useState(false)
  const detail = prediction.resolution < 0.8 ? 'Broad' : prediction.resolution < 1.3 ? 'Balanced' : prediction.resolution < 1.9 ? 'Detailed' : 'Most separate'
  const sourceLabel = prediction.sources.map((source) => source === 'fragrantica' ? 'Fragrantica' : 'Parfumo').join(' + ') || 'No sources'
  const members = expanded ? prediction.members : prediction.members.slice(0, 5)

  return (
    <section className="preview-section preview-group" aria-labelledby="predicted-group-heading">
      <h3 id="predicted-group-heading">Predicted group</h3>
      <strong className="preview-group__status" role="status">{TITLES[prediction.status]}</strong>
      <p className="preview-group__settings">{sourceLabel} · Group detail: {detail} ({prediction.resolution.toFixed(1)})</p>
      <div className="preview-group__calibration">
        <label htmlFor="preview-group-detail">Group detail</label>
        <input
          id="preview-group-detail"
          type="range"
          min="0.4"
          max="2.5"
          step="0.1"
          value={prediction.resolution}
          aria-label="Preview group detail: broader groups to more separate groups"
          aria-valuetext={`${detail}, resolution ${prediction.resolution.toFixed(1)}`}
          onChange={(event) => onResolutionChange(Number(event.target.value))}
        />
        <div className="group-calibration__scale"><span>Broader</span><span>More separate</span></div>
        <button className="button button--quiet" type="button" disabled={prediction.resolution === mapResolution} onClick={() => onResolutionChange(mapResolution)}>Reset to map setting</button>
        <p>Changes apply only to this preview. Group names and colors refer to the current map.</p>
      </div>
      {prediction.currentGroups.length > 0 && (
        <div className="preview-group__chips">
          {prediction.currentGroups.map((group) => (
            <span className="cluster-chip" key={group.cluster} title={group.title}>
              <span style={{ background: CLUSTER_COLORS[group.cluster % CLUSTER_COLORS.length] }} />
              {group.label}{group.partial ? ' (partial group)' : ''}
            </span>
          ))}
        </div>
      )}
      {prediction.mergesGroups && <p>This simulation brings members of multiple current groups together.</p>}
      {prediction.splitsGroup && <p>Only part of a current group would share the candidate’s group; its other members would be grouped separately.</p>}
      {prediction.status === 'insufficient' && <p>No relationships connect this candidate under the selected evidence sources. Add a similarity list or select another evidence source.</p>}
      {prediction.status === 'new' && <p>The candidate would group separately from existing map fragrances at this Group detail setting. Missing evidence does not prove uniqueness.</p>}
      {members.length > 0 && (
        <>
          <p>Predicted members ({prediction.members.length}, excluding the candidate)</p>
          <ul className="preview-group__members">
            {members.map((member) => (
              <li key={member.id}>
                <span>{displayName(member)}</span>
                <small>{member.temporary ? 'Temporary context' : member.owned ? 'Owned' : 'Context'}</small>
              </li>
            ))}
          </ul>
          {prediction.members.length > 5 && (
            <button className="button button--quiet" type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
              {expanded ? 'Show fewer members' : `Show all ${prediction.members.length} members`}
            </button>
          )}
        </>
      )}
      <p className="preview-caveat">Temporary simulation using the selected Group detail and the map’s evidence sources. Nothing is saved. Grouping can change as more evidence is added.</p>
    </section>
  )
}
