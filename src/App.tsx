import {
  ArchiveRestore,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Database,
  Download,
  Eye,
  Focus,
  Info,
  LibraryBig,
  Menu,
  Plus,
  Search,
  SlidersHorizontal,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { DuplicateReviewDialog } from './components/DuplicateReviewDialog'
import { AddFragranceDialog } from './components/AddFragranceDialog'
import { CaptureDialog } from './components/CaptureDialog'
import { DetailsPanel } from './components/DetailsPanel'
import { GraphView } from './components/GraphView'
import { Modal } from './components/Modal'
import { PreviewFragranceDialog } from './components/PreviewFragranceDialog'
import { createBackup, restoreBackup, validateBackup, type BackupPreview } from './data/backup'
import { useDatabaseSnapshot } from './data/useDatabaseSnapshot'
import { buildGraphModel, groupOptions } from './domain/graph'
import { displayName } from './domain/identity'
import { CLUSTER_COLORS } from './domain/colors'
import type { SelectedGraphItem, SimilaritySource } from './domain/types'

type SourceFilter = 'all' | SimilaritySource

const GROUP_RESOLUTION_KEY = 'scent-map-group-resolution'
const DEFAULT_GROUP_RESOLUTION = 1

function storedGroupResolution() {
  try {
    const value = Number(window.localStorage.getItem(GROUP_RESOLUTION_KEY))
    return value >= 0.4 && value <= 2.5 ? value : DEFAULT_GROUP_RESOLUTION
  } catch {
    return DEFAULT_GROUP_RESOLUTION
  }
}

function groupResolutionLabel(value: number) {
  if (value < 0.8) return 'Broad'
  if (value < 1.3) return 'Balanced'
  if (value < 1.9) return 'Detailed'
  return 'Most separate'
}

function App() {
  const { fragrances, captures, observations, loading } = useDatabaseSnapshot()
  const [showAdd, setShowAdd] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showDuplicates, setShowDuplicates] = useState(false)
  const [historyEventId, setHistoryEventId] = useState<string>()
  const [captureTarget, setCaptureTarget] = useState<{ id: string; source?: SimilaritySource } | null>(null)
  const [selected, setSelected] = useState<SelectedGraphItem>(null)
  const [showContext, setShowContext] = useState(true)
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [groupResolution, setGroupResolution] = useState(storedGroupResolution)
  const [clusterFocus, setClusterFocus] = useState<number | 'all'>('all')
  const [search, setSearch] = useState('')
  const [fitSignal, setFitSignal] = useState(0)
  const [backupPreview, setBackupPreview] = useState<BackupPreview | null>(null)
  const [backupError, setBackupError] = useState('')
  const [restoring, setRestoring] = useState(false)
  const [toast, setToast] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  const calibrationRef = useRef<HTMLDetailsElement>(null)

  const owned = useMemo(
    () => fragrances.filter((item) => item.owned).sort((a, b) => displayName(a).localeCompare(displayName(b))),
    [fragrances],
  )
  const enabledSources = useMemo(
    () => new Set<SimilaritySource>(sourceFilter === 'all' ? ['fragrantica', 'parfumo'] : [sourceFilter]),
    [sourceFilter],
  )
  const graphModel = useMemo(
    () => buildGraphModel(fragrances, observations, enabledSources, groupResolution),
    [enabledSources, fragrances, groupResolution, observations],
  )
  const clusterOptions = useMemo(() => groupOptions(graphModel), [graphModel])
  const capturedKeys = useMemo(
    () => new Set(captures.map((capture) => `${capture.rootFragranceId}:${capture.source}`)),
    [captures],
  )
  const fullyCovered = owned.filter(
    (item) => capturedKeys.has(`${item.id}:fragrantica`) && capturedKeys.has(`${item.id}:parfumo`),
  ).length
  const selectedTarget = captureTarget ? fragrances.find((item) => item.id === captureTarget.id) : undefined

  const handleSelect = useCallback((selection: SelectedGraphItem) => setSelected(selection), [])
  const openCapture = useCallback((id: string, source?: SimilaritySource) => {
    setCaptureTarget({ id, source })
    setSidebarOpen(false)
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(GROUP_RESOLUTION_KEY, String(groupResolution))
    } catch {
      // Grouping still works when browser preference storage is unavailable.
    }
  }, [groupResolution])

  useEffect(() => {
    function closeCalibration(event: PointerEvent) {
      const panel = calibrationRef.current
      if (panel?.open && event.target instanceof Node && !panel.contains(event.target)) panel.open = false
    }
    document.addEventListener('pointerdown', closeCalibration)
    return () => document.removeEventListener('pointerdown', closeCalibration)
  }, [])

  function flash(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(''), 2800)
  }

  async function exportData() {
    const backup = await createBackup()
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `scent-map-backup-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    flash('Backup downloaded')
  }

  async function readImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      setBackupError('')
      setBackupPreview(validateBackup(JSON.parse(await file.text())))
    } catch (caught) {
      setBackupError(caught instanceof Error ? caught.message : 'Could not read this backup.')
      setBackupPreview(null)
    }
  }

  async function confirmRestore() {
    if (!backupPreview) return
    try {
      setRestoring(true)
      await restoreBackup(backupPreview.backup)
      setSelected(null)
      setBackupPreview(null)
      flash('Backup restored')
    } catch (caught) {
      setBackupError(caught instanceof Error ? caught.message : 'Could not restore this backup.')
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <button className="icon-button mobile-menu" type="button" onClick={() => setSidebarOpen(true)} aria-label="Open collection">
            <Menu size={20} />
          </button>
          <img className="brand-mark" src={`${import.meta.env.BASE_URL}brand/scent-map-mark.svg`} width="38" height="38" alt="" />
          <div><strong>Scent Map</strong><span>collection diversity</span></div>
        </div>
        <div className="topbar__actions">
          <button className="button button--quiet hide-mobile" type="button" onClick={exportData}>
            <Download size={15} /> Export
          </button>
          <button className="button button--quiet hide-mobile" type="button" onClick={() => importRef.current?.click()}>
            <Upload size={15} /> Restore
          </button>
          <button className="button button--quiet hide-mobile" type="button" onClick={() => setShowPreview(true)}>
            <Eye size={15} /> Preview
          </button>
          <button className="button button--primary" type="button" onClick={() => setShowAdd(true)}>
            <Plus size={16} /> Add fragrance
          </button>
          <input ref={importRef} hidden type="file" accept="application/json,.json" onChange={readImport} />
        </div>
      </header>

      <aside className={`collection-sidebar ${sidebarOpen ? 'collection-sidebar--open' : ''}`}>
        <div className="sidebar-heading">
          <div><p className="eyebrow">Your wardrobe</p><h1>Collection</h1></div>
          <span className="count-badge">{owned.length}</span>
        </div>

        <div className="coverage-card">
          <div className="coverage-card__top">
            <span>Source coverage</span><b>{fullyCovered}/{owned.length || 0}</b>
          </div>
          <div className="progress-track"><span style={{ width: `${owned.length ? (fullyCovered / owned.length) * 100 : 0}%` }} /></div>
          <p>Both community lists captured</p>
        </div>

        <div className="collection-list">
          {owned.map((fragrance) => (
            <button
              type="button"
              className={`collection-item ${selected?.type === 'node' && selected.id === fragrance.id ? 'active' : ''}`}
              key={fragrance.id}
              onClick={() => { setSelected({ type: 'node', id: fragrance.id }); setSidebarOpen(false) }}
            >
              <span className="bottle-glyph">{fragrance.name.slice(0, 1).toUpperCase()}</span>
              <span className="collection-item__name">
                <b>{fragrance.name}</b><small>{fragrance.brand}{fragrance.variant ? ` · ${fragrance.variant}` : ''}</small>
                <span className="source-statuses">
                  <i className={capturedKeys.has(`${fragrance.id}:fragrantica`) ? 'done' : ''}>F</i>
                  <i className={capturedKeys.has(`${fragrance.id}:parfumo`) ? 'done' : ''}>P</i>
                </span>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
          {!owned.length && !loading && (
            <div className="sidebar-empty"><LibraryBig size={24} /><p>Your collection starts with one bottle.</p></div>
          )}
        </div>

        <div className="sidebar-footer">
          <button className="button button--quiet button--full" type="button" disabled={loading} onClick={() => { setShowPreview(true); setSidebarOpen(false) }}><Eye size={15} /> Preview a fragrance</button>
          <button className="button button--quiet button--full" type="button" disabled={loading} onClick={() => { setHistoryEventId(undefined); setShowDuplicates(true); setSidebarOpen(false) }}><Search size={15} /> Find duplicates</button>
          <button className="button button--quiet button--full mobile-only" type="button" onClick={exportData}><Download size={15} /> Export backup</button>
          <button className="button button--quiet button--full mobile-only" type="button" onClick={() => importRef.current?.click()}><Upload size={15} /> Restore backup</button>
          <div className="local-note"><Database size={15} /><span>Private & local<br /><small>Stored in this browser</small></span></div>
        </div>
      </aside>
      {sidebarOpen && <button className="mobile-scrim" type="button" aria-label="Close collection" onClick={() => setSidebarOpen(false)} />}

      <main className="workspace">
        <section className="graph-toolbar" aria-label="Map controls">
          <div className="graph-toolbar__search-row">
            <label className="search-box">
              <Search size={16} />
              <input aria-label="Find a fragrance" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a fragrance in your map…" />
            </label>
            <button className="map-fit" type="button" onClick={() => setFitSignal((value) => value + 1)}><Focus size={16} /> Fit map</button>
          </div>
          <div className="graph-toolbar__filters">
            <label className="map-filter">
              <span>Evidence source</span>
              <select value={sourceFilter} onChange={(event) => { setSourceFilter(event.target.value as SourceFilter); setClusterFocus('all') }}>
                <option value="all">All sources</option>
                <option value="fragrantica">Fragrantica</option>
                <option value="parfumo">Parfumo</option>
              </select>
            </label>
            <label className="map-filter">
              <span>Show fragrances</span>
              <select value={showContext ? 'all' : 'owned'} onChange={(event) => setShowContext(event.target.value === 'all')}>
                <option value="all">Owned + context</option>
                <option value="owned">Owned only</option>
              </select>
            </label>
            <label className="map-filter">
              <span>Focus group</span>
              <select
                aria-label="Focus similarity group"
                title={clusterOptions.find((option) => option.cluster === clusterFocus)?.title}
                value={clusterFocus}
                onChange={(event) => setClusterFocus(event.target.value === 'all' ? 'all' : Number(event.target.value))}
              >
                <option value="all">All groups</option>
                {clusterOptions.map(({ cluster, label, title }) => <option key={cluster} value={cluster} title={title}>{label}</option>)}
              </select>
            </label>
            <div className="map-filter">
              <span id="group-detail-label">Group detail</span>
              <details ref={calibrationRef} className="group-calibration" onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.currentTarget.open = false
                  event.currentTarget.querySelector('summary')?.focus()
                }
              }}>
                <summary aria-describedby="group-detail-label">
                  <SlidersHorizontal size={14} />
                  <span>{groupResolutionLabel(groupResolution)}</span>
                  <ChevronDown size={14} />
                </summary>
                <div className="group-calibration__panel">
                  <div className="group-calibration__heading"><strong>Group detail</strong><output aria-live="polite">{graphModel.clusters.length} {graphModel.clusters.length === 1 ? 'group' : 'groups'}</output></div>
                  <p>Choose how broadly related fragrances are grouped.</p>
                  <input
                    type="range"
                    min="0.4"
                    max="2.5"
                    step="0.1"
                    value={groupResolution}
                    aria-label="Group detail: broader groups to more separate groups"
                    aria-valuetext={`${groupResolutionLabel(groupResolution)}, resolution ${groupResolution.toFixed(1)}`}
                    onChange={(event) => { setGroupResolution(Number(event.target.value)); setClusterFocus('all') }}
                  />
                  <div className="group-calibration__scale"><span>Broader</span><span>More separate</span></div>
                  <div className="group-calibration__footer">
                    <span>{groupResolutionLabel(groupResolution)} · {groupResolution.toFixed(1)}</span>
                    <button type="button" disabled={groupResolution === DEFAULT_GROUP_RESOLUTION} onClick={() => { setGroupResolution(DEFAULT_GROUP_RESOLUTION); setClusterFocus('all') }}>Reset to default</button>
                  </div>
                </div>
              </details>
            </div>
          </div>
        </section>

        <div className="map-viewport">
          <div className="graph-meta">
            <div className="legend"><span className="legend-owned" /> Owned <span className="legend-context" /> Context <span aria-hidden="true">&rarr;</span> References <span aria-hidden="true">&harr;</span> Mutual</div>
            <div className="group-dots">
              {graphModel.clusters.slice(0, 10).map((cluster) => <span key={cluster} style={{ background: CLUSTER_COLORS[cluster % CLUSTER_COLORS.length] }} title={`Similarity group ${cluster + 1}`} />)}
            </div>
            <span>{graphModel.nodes.length} fragrances · {graphModel.edges.length} recorded links</span>
          </div>

          <GraphView
            model={graphModel}
            showContext={showContext}
            clusterFocus={clusterFocus}
            search={search}
            fitSignal={fitSignal}
            selected={selected}
            onSelect={handleSelect}
          />

          {!loading && !fragrances.length && (
            <section className="empty-state">
              <img className="empty-brand-mark" src={`${import.meta.env.BASE_URL}brand/scent-map-mark.svg`} width="96" height="96" alt="" />
              <p className="eyebrow">A clearer collection starts here</p>
              <h2>Map what your nose already knows.</h2>
              <p>Add an owned fragrance and its community similarity lists together. Relationships become a map—not a verdict.</p>
              <button className="button button--primary" type="button" onClick={() => setShowAdd(true)}><Plus size={16} /> Add your first fragrance</button>
            </section>
          )}

          <div className="map-disclaimer"><CircleHelp size={14} /> No link means unknown, not unique.</div>
        </div>
      </main>

      {selected && <DetailsPanel key={`${selected.type}:${selected.id}`} selection={selected} model={graphModel} onClose={() => setSelected(null)} onCapture={openCapture} onHistory={(id) => { setHistoryEventId(id); setShowDuplicates(true) }} />}
      {showDuplicates && <DuplicateReviewDialog initialEventId={historyEventId} onSelectFragrance={(id) => { setShowDuplicates(false); setSelected({ type: 'node', id }); setShowContext(true); setClusterFocus('all') }} fragrances={fragrances} captures={captures} observations={observations} onClose={() => setShowDuplicates(false)} onMerged={() => { setSelected(null); setClusterFocus('all') }} />}
      {showPreview && <PreviewFragranceDialog fragrances={fragrances} observations={observations} onClose={() => setShowPreview(false)} />}
      {showAdd && <AddFragranceDialog onClose={() => setShowAdd(false)} onSaved={(id) => setSelected({ type: 'node', id })} />}
      {selectedTarget && (
        <CaptureDialog
          root={selectedTarget}
          initialSource={captureTarget?.source}
          fragrances={fragrances}
          captures={captures}
          observations={observations}
          onClose={() => setCaptureTarget(null)}
        />
      )}

      {(backupPreview || backupError) && (
        <Modal
          title={backupPreview ? 'Restore local collection' : 'Backup could not be read'}
          eyebrow="Versioned JSON backup"
          onClose={() => { setBackupPreview(null); setBackupError('') }}
          footer={backupPreview ? (
            <>
              <button className="button button--quiet" type="button" onClick={() => setBackupPreview(null)}>Cancel</button>
              <button className="button button--danger" type="button" disabled={restoring} onClick={confirmRestore}><ArchiveRestore size={16} /> {restoring ? 'Restoring…' : 'Replace local data'}</button>
            </>
          ) : <button className="button button--primary" type="button" onClick={() => setBackupError('')}>Close</button>}
        >
          {backupPreview ? (
            <div className="restore-preview">
              <Info size={20} />
              <p>This valid backup will replace everything currently stored in this browser.</p>
              <div><span><b>{backupPreview.ownedCount}</b> owned</span><span><b>{backupPreview.fragranceCount}</b> total nodes</span><span><b>{backupPreview.captureCount}</b> captures</span><span><b>{backupPreview.observationCount}</b> observations</span></div>
              <p>{backupPreview.dismissalCount} kept-separate decisions &middot; {backupPreview.mergeCount} merge events &middot; {backupPreview.aliasCount} recognized names. Restoring clears the local undo checkpoint.</p>
              <small>Exported {new Date(backupPreview.backup.exportedAt).toLocaleString()}</small>
            </div>
          ) : <p className="form-error">{backupError}</p>}
        </Modal>
      )}

      {toast && <div className="toast"><Check size={16} /> {toast}</div>}
    </div>
  )
}

export default App
