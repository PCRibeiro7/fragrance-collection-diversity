import {
  ArchiveRestore,
  Check,
  ChevronRight,
  CircleHelp,
  Database,
  Download,
  Focus,
  Info,
  LibraryBig,
  Map,
  Menu,
  Plus,
  Search,
  Upload,
} from 'lucide-react'
import { useCallback, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { AddFragranceDialog } from './components/AddFragranceDialog'
import { CaptureDialog } from './components/CaptureDialog'
import { DetailsPanel } from './components/DetailsPanel'
import { GraphView } from './components/GraphView'
import { Modal } from './components/Modal'
import { createBackup, restoreBackup, validateBackup, type BackupPreview } from './data/backup'
import { useDatabaseSnapshot } from './data/useDatabaseSnapshot'
import { buildGraphModel, groupOptions } from './domain/graph'
import { displayName } from './domain/identity'
import { CLUSTER_COLORS } from './domain/colors'
import type { SelectedGraphItem, SimilaritySource } from './domain/types'

type SourceFilter = 'all' | SimilaritySource

function App() {
  const { fragrances, captures, observations, loading } = useDatabaseSnapshot()
  const [showAdd, setShowAdd] = useState(false)
  const [captureTarget, setCaptureTarget] = useState<{ id: string; source?: SimilaritySource } | null>(null)
  const [selected, setSelected] = useState<SelectedGraphItem>(null)
  const [showContext, setShowContext] = useState(true)
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [clusterFocus, setClusterFocus] = useState<number | 'all'>('all')
  const [search, setSearch] = useState('')
  const [fitSignal, setFitSignal] = useState(0)
  const [backupPreview, setBackupPreview] = useState<BackupPreview | null>(null)
  const [backupError, setBackupError] = useState('')
  const [restoring, setRestoring] = useState(false)
  const [toast, setToast] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  const owned = useMemo(
    () => fragrances.filter((item) => item.owned).sort((a, b) => displayName(a).localeCompare(displayName(b))),
    [fragrances],
  )
  const enabledSources = useMemo(
    () => new Set<SimilaritySource>(sourceFilter === 'all' ? ['fragrantica', 'parfumo'] : [sourceFilter]),
    [sourceFilter],
  )
  const graphModel = useMemo(
    () => buildGraphModel(fragrances, observations, enabledSources),
    [enabledSources, fragrances, observations],
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
          <div className="brand-mark"><Map size={21} /></div>
          <div><strong>Scent Map</strong><span>collection diversity</span></div>
        </div>
        <div className="topbar__actions">
          <button className="button button--quiet hide-mobile" type="button" onClick={exportData}>
            <Download size={15} /> Export
          </button>
          <button className="button button--quiet hide-mobile" type="button" onClick={() => importRef.current?.click()}>
            <Upload size={15} /> Restore
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
          <button className="button button--quiet button--full mobile-only" type="button" onClick={exportData}><Download size={15} /> Export backup</button>
          <button className="button button--quiet button--full mobile-only" type="button" onClick={() => importRef.current?.click()}><Upload size={15} /> Restore backup</button>
          <div className="local-note"><Database size={15} /><span>Private & local<br /><small>Stored in this browser</small></span></div>
        </div>
      </aside>
      {sidebarOpen && <button className="mobile-scrim" type="button" aria-label="Close collection" onClick={() => setSidebarOpen(false)} />}

      <main className="workspace">
        <div className="graph-toolbar">
          <label className="search-box">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a fragrance" />
          </label>
          <div className="toolbar-group source-filter">
            {(['all', 'fragrantica', 'parfumo'] as const).map((source) => (
              <button key={source} type="button" className={sourceFilter === source ? 'active' : ''} onClick={() => setSourceFilter(source)}>
                {source === 'all' ? 'All evidence' : source === 'fragrantica' ? 'F' : 'P'}
              </button>
            ))}
          </div>
          <label className="toggle-control">
            <input type="checkbox" checked={showContext} onChange={(event) => setShowContext(event.target.checked)} />
            <span /> Context
          </label>
          <select
            className="cluster-select"
            aria-label="Focus similarity group"
            title={clusterOptions.find((option) => option.cluster === clusterFocus)?.title}
            value={clusterFocus}
            onChange={(event) => setClusterFocus(event.target.value === 'all' ? 'all' : Number(event.target.value))}
          >
            <option value="all">All groups</option>
            {clusterOptions.map(({ cluster, label, title }) => <option key={cluster} value={cluster} title={title}>{label}</option>)}
          </select>
          <button className="icon-button" type="button" title="Fit graph" onClick={() => setFitSignal((value) => value + 1)}><Focus size={18} /></button>
        </div>

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
            <div className="empty-orbit"><span /><span /><span /><Map size={34} /></div>
            <p className="eyebrow">A clearer collection starts here</p>
            <h2>Map what your nose already knows.</h2>
            <p>Add an owned fragrance and its community similarity lists together. Relationships become a map—not a verdict.</p>
            <button className="button button--primary" type="button" onClick={() => setShowAdd(true)}><Plus size={16} /> Add your first fragrance</button>
          </section>
        )}

        <div className="map-disclaimer"><CircleHelp size={14} /> No link means unknown, not unique.</div>
      </main>

      {selected && <DetailsPanel key={`${selected.type}:${selected.id}`} selection={selected} model={graphModel} onClose={() => setSelected(null)} onCapture={openCapture} />}
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
