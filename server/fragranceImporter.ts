import { isChallengePage, parseFragrancePage } from './importParsers'
import type { FragranceImportErrorCode, FragranceImportFailure, FragrancePageImport } from '../src/domain/fragranceImport'
import type { SimilaritySource } from '../src/domain/types'

export const FETCH_TIMEOUT_MS = 15_000
export const MAX_PAGE_BYTES = 5 * 1024 * 1024
const MAX_REDIRECTS = 3
const HOSTS = new Map<string, SimilaritySource>([
  ['fragrantica.com', 'fragrantica'], ['www.fragrantica.com', 'fragrantica'],
  ['parfumo.com', 'parfumo'], ['www.parfumo.com', 'parfumo'],
])

export class ImportFailure extends Error {
  readonly detail: FragranceImportFailure
  constructor(code: FragranceImportErrorCode, message: string, metadata: Omit<FragranceImportFailure, 'code' | 'message'> = {}) {
    super(message)
    this.detail = { code, message, ...metadata }
  }
}

export function validateFragranceUrl(input: string): { url: URL; source: SimilaritySource } {
  try {
    const url = new URL(input)
    const source = HOSTS.get(url.hostname)
    if (!source || url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error()
    const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    if (segments.some((segment) => /[/\\]/.test(segment) || segment.includes(String.fromCharCode(0)))) throw new Error()
    const supported = source === 'parfumo'
      ? /^\/Perfumes\/[^/]+\/[^/]+\/?$/.test(url.pathname)
      : /^\/(?:perfume\/[^/]+\/[^/]+-\d+\.html|p\/\d+)\/?$/.test(url.pathname)
    if (!supported) throw new Error()
    url.hash = ''
    return { url, source }
  } catch {
    throw new ImportFailure('unsupported_url', 'Use an HTTPS English fragrance page from Fragrantica.com or Parfumo.com, without credentials or a custom port.')
  }
}

async function readPage(response: Response): Promise<Buffer> {
  if (Number(response.headers.get('content-length')) > MAX_PAGE_BYTES) {
    await response.body?.cancel()
    throw new ImportFailure('too_large', 'The source page exceeds the 5 MB response limit.')
  }
  const reader = response.body?.getReader()
  if (!reader) return Buffer.alloc(0)
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_PAGE_BYTES) {
        await reader.cancel()
        throw new ImportFailure('too_large', 'The source page exceeds the 5 MB response limit.')
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  return Buffer.concat(chunks, size)
}

export async function importFragrancePage(input: string): Promise<FragrancePageImport> {
  let { url, source } = validateFragranceUrl(input)
  let upstreamStatus: number | undefined
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    for (let redirects = 0; ; redirects += 1) {
      const response = await fetch(url, {
        redirect: 'manual', signal: controller.signal,
        headers: { Accept: 'text/html, application/xhtml+xml', 'User-Agent': 'ScentMapImportTrial/0.1' },
      })
      upstreamStatus = response.status
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel()
        if (redirects === MAX_REDIRECTS) throw new ImportFailure('redirect_limit', 'The source exceeded the three-redirect limit.')
        const location = response.headers.get('location')
        if (!location) throw new ImportFailure('upstream_error', 'The source returned a redirect without a destination.')
        const next = validateFragranceUrl(new URL(location, url).href)
        if (next.source !== source) throw new ImportFailure('unsupported_url', 'The source redirected to a different provider.')
        url = next.url
        source = next.source
        continue
      }
      if (!response.ok || response.headers.get('cf-mitigated') === 'challenge') {
        await response.body?.cancel()
        if (response.status === 429) throw new ImportFailure('rate_limited', 'The source rate-limited this request. No retry was attempted.')
        if (response.headers.get('cf-mitigated') === 'challenge') throw new ImportFailure('challenge', 'The source requires a browser challenge; the server cannot complete it.')
        if ([401, 403].includes(response.status)) throw new ImportFailure('blocked', 'The source blocked this server request. No retry was attempted.')
        throw new ImportFailure('upstream_error', `The source returned HTTP ${response.status}.`)
      }
      const html = await readPage(response)
      const contentType = response.headers.get('content-type')
      const encoding = contentType?.match(/charset\s*=\s*["']?([^;\s"']+)/i)?.[1]
      if (isChallengePage(html, encoding)) throw new ImportFailure('challenge', 'The source returned a browser challenge instead of a fragrance page.')
      if (contentType && !/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(contentType)) {
        throw new ImportFailure('parse_failed', 'The source did not return an HTML page.')
      }
      const result = parseFragrancePage(html, source, url.href, encoding)
      if (!result) throw new ImportFailure('parse_failed', 'The returned layout did not expose a recognizable brand and fragrance name.')
      return { ...result, upstreamStatus: response.status }
    }
  } catch (caught) {
    const metadata = { source, pageUrl: url.href, ...(upstreamStatus !== undefined ? { upstreamStatus } : {}) }
    if (caught instanceof ImportFailure) throw new ImportFailure(caught.detail.code, caught.message, { ...metadata, ...caught.detail })
    if (controller.signal.aborted) throw new ImportFailure('timeout', 'The source did not finish responding within 15 seconds.', metadata)
    throw new ImportFailure('network_error', 'The server could not retrieve the source page.', metadata)
  } finally { clearTimeout(timer) }
}
