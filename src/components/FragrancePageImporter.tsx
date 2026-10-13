import { Download, ExternalLink, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { displayName } from '../domain/identity'
import type { FragranceImportResponse, FragrancePageImport } from '../domain/fragranceImport'
import type { SimilaritySource } from '../domain/types'

interface Props {
  onApply: (result: FragrancePageImport) => void
  mode?: 'details' | 'relationships'
  source?: SimilaritySource
  initialUrl?: string
  applicationError?: (result: FragrancePageImport) => string | undefined
  applicationNotice?: (result: FragrancePageImport) => string | undefined
}

export function FragrancePageImporter({ onApply, mode = 'details', source, initialUrl = '', applicationError, applicationNotice }: Props) {
  const [url, setUrl] = useState(initialUrl)
  const [result, setResult] = useState<FragrancePageImport | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const activeRequest = useRef<AbortController | null>(null)
  const captureInput = useRef<HTMLInputElement | null>(null)

  useEffect(() => () => { activeRequest.current?.abort() }, [])

  function changeUrl(next: string) {
    activeRequest.current?.abort()
    activeRequest.current = null
    setLoading(false)
    setUrl(next)
    setResult(null)
    setError('')
  }

  async function readResponse(response: Response, controller: AbortController) {
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new Error('Link import is unavailable right now. You can enter details and paste relationships manually.')
    }
    const body: FragranceImportResponse = await response.json()
    if (activeRequest.current !== controller || controller.signal.aborted) return
    if (typeof body?.ok !== 'boolean') throw new Error('Import is unavailable right now. You can enter the information manually.')
    if (!body.ok) {
      const blocked = ['blocked', 'challenge', 'rate_limited'].includes(body.error.code)
      setError(`${body.error.message}${blocked ? ' Open the source page in your browser, load its similarities, then use the browser helper or copy the section manually.' : ''}`)
      return
    }
    if (source && body.result.source !== source) {
      setError(`Use a ${source === 'fragrantica' ? 'Fragrantica' : 'Parfumo'} fragrance page for this source.`)
      return
    }
    setUrl(body.result.pageUrl)
    setResult(body.result)
  }

  async function loadBrowserCapture(file: File | undefined) {
    if (!file || loading) return
    const controller = new AbortController()
    activeRequest.current = controller
    const timer = window.setTimeout(() => controller.abort(), 25_000)
    setLoading(true)
    setError('')
    setResult(null)
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('The browser capture exceeds the 2 MB limit.')
      const text = await file.text()
      if (activeRequest.current !== controller || controller.signal.aborted) return
      await readResponse(await fetch('/.netlify/functions/import-fragrance-capture', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: text, signal: controller.signal,
      }), controller)
    } catch (caught) {
      if (activeRequest.current !== controller) return
      setError(controller.signal.aborted ? 'Reading the capture took too long.' : caught instanceof TypeError
        ? 'Browser capture import is unavailable right now. You can paste the section manually.'
        : caught instanceof Error ? caught.message : 'The browser capture could not be read.')
    } finally {
      window.clearTimeout(timer)
      if (activeRequest.current === controller) { activeRequest.current = null; setLoading(false) }
    }
  }

  async function fetchPage() {
    if (loading || !url.trim()) return
    if (source) {
      try {
        const host = new URL(url.trim()).hostname
        if (host !== `${source}.com` && host !== `www.${source}.com`) {
          setResult(null)
          setError(`Use a ${source === 'fragrantica' ? 'Fragrantica' : 'Parfumo'} fragrance page for this source.`)
          return
        }
      } catch {
        setResult(null)
        setError('Provide a valid fragrance page URL.')
        return
      }
    }
    const controller = new AbortController()
    activeRequest.current = controller
    const timer = window.setTimeout(() => controller.abort(), 25_000)
    setLoading(true)
    setResult(null)
    setError('')
    try {
      const response = await fetch('/.netlify/functions/import-fragrance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }), signal: controller.signal,
      })
      await readResponse(response, controller)
    } catch (caught) {
      if (activeRequest.current !== controller) return
      setError(controller.signal.aborted
        ? 'The import took too long. You can enter the information manually.'
        : caught instanceof TypeError ? 'Link import is unavailable right now. You can enter the information manually.'
          : caught instanceof Error ? caught.message : 'Could not import this page.')
    } finally {
      window.clearTimeout(timer)
      if (activeRequest.current === controller) {
        activeRequest.current = null
        setLoading(false)
      }
    }
  }

  const mismatch = result ? applicationError?.(result) : undefined
  const hasSimilarities = Boolean(result?.similarities.length)
  const needsBrowserCapture = result?.source === 'fragrantica' && !hasSimilarities && result.completeness === 'unknown'
  return <section className="page-import form-stack" aria-label="Import from a fragrance link">
    <div className="page-import__intro">
      <h3>Import from a link <span>Experimental</span></h3>
      <p>Paste an English Fragrantica or Parfumo fragrance page. Review what was found before using it.</p>
    </div>
    <div className="page-import__controls">
      <label className="field">
        <span>Fragrance page URL</span>
        <input type="text" inputMode="url" value={url} onChange={(event) => changeUrl(event.target.value)} onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); void fetchPage() }
        }} placeholder="https://www.parfumo.com/Perfumes/…" />
      </label>
      <button className="button button--quiet" type="button" disabled={loading || !url.trim()} onClick={fetchPage}>
        <Download size={15} /> {loading ? 'Importing…' : 'Import link'}
      </button>
    </div>
    <div className="page-import__browser">
      <button className="button button--quiet" type="button" disabled={loading} onClick={() => captureInput.current?.click()}><Upload size={15} /> Load browser capture</button>
      <input ref={captureInput} hidden type="file" accept="application/json,.json" aria-label="Browser capture file" onChange={(event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        void loadBrowserCapture(file)
      }} />
      <p className="review-help">Use the browser helper on Fragrantica’s “This perfume reminds me of” or Parfumo’s “Smells similar” section. On Parfumo, select Similar and load All cards if available. Download the capture and load it here.</p>
      <details className="review-help">
        <summary>Install the browser helper</summary>
        <p>Open chrome://extensions in Chrome or edge://extensions in Edge. Turn on Developer mode, choose Load unpacked, and select the browser-helper/fragrantica folder in this project.</p>
        <p>Pin Scent Map Fragrance Capture to the toolbar. On the fragrance tab, scroll until the similarity cards load, open the helper, click Capture loaded section, then Download capture. Reload an existing installation in the browser’s extensions page after updating the helper.</p>
      </details>
    </div>
    {loading && <p role="status" className="review-help">Preparing the fragrance preview…</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {result && <div className="page-import__result">
      <strong>{displayName(result.fragrance)}</strong>
      {result.captureMethod === 'browser' && <p>Captured from your loaded browser page. Review the list before saving.</p>}
      <a href={result.pageUrl} target="_blank" rel="noreferrer">Open {result.source === 'fragrantica' ? 'Fragrantica' : 'Parfumo'} page <ExternalLink size={12} /></a>
      <p>{needsBrowserCapture ? 'Relationships need browser capture' : `${result.similarities.length} similarities found${result.advertisedTotal !== undefined ? ` of ${result.advertisedTotal} advertised` : ''}`} · {result.completeness === 'complete' ? 'Complete list' : result.completeness === 'partial' ? 'Partial list' : 'Completeness unknown'}</p>
      {result.warnings.length > 0 && <ul className="page-import__warnings">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
      {!hasSimilarities && <p>No usable similarities were found. Your existing relationships will be kept.</p>}
      {needsBrowserCapture && <p>Open Fragrantica, scroll to “This perfume reminds me of”, and wait for the cards to load. Use the browser helper and load its capture here, or paste that section into the relationships field.</p>}
      {hasSimilarities && <details>
        <summary>Preview similarities</summary>
        <ul className="page-import__similarities">{result.similarities.map((item, index) => <li key={index}>{displayName(item)}</li>)}</ul>
      </details>}
      {mismatch && <p role="alert" className="form-error">{mismatch}</p>}
      {applicationNotice?.(result) && <p>{applicationNotice(result)}</p>}
      <button className="button button--quiet" type="button" disabled={Boolean(mismatch) || (mode === 'relationships' && !hasSimilarities)} onClick={() => {
        if (mismatch || (mode === 'relationships' && !hasSimilarities)) return
        onApply(result)
        setResult(null)
      }}>
        {mode === 'relationships' ? 'Review imported similarities' : hasSimilarities ? 'Use details and similarities' : 'Use imported details'}
      </button>
    </div>}
    <p className="review-help">Link import sends the page URL; loading a capture sends only the captured fragrance heading and similarity section for parsing. Your collection stays in this browser. Nothing is saved until you confirm.</p>
  </section>
}

export function ImportedListAcknowledgment({ result, acknowledged, onChange }: {
  result: FragrancePageImport
  acknowledged: boolean
  onChange: (value: boolean) => void
}) {
  const label = result.source === 'fragrantica' ? 'Fragrantica' : 'Parfumo'
  return <div className="import-acknowledgment">
    <p>{label}: {result.similarities.length}{result.advertisedTotal !== undefined ? ` of ${result.advertisedTotal}` : ''} similarities imported. {result.completeness === 'partial' ? 'The source list is partial.' : 'The full source list could not be verified.'}</p>
    <label>
      <input type="checkbox" checked={acknowledged} onChange={(event) => onChange(event.target.checked)} />
      <span>I understand this {label} list may be incomplete and will replace saved relationships for this source.</span>
    </label>
  </div>
}
