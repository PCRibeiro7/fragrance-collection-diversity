import { ImportFailure, importFragrancePage } from '../../server/fragranceImporter'
import type { FragranceImportErrorCode, FragranceImportResponse } from '../../src/domain/fragranceImport'

const ERROR_STATUS: Record<FragranceImportErrorCode, number> = {
  invalid_request: 400, method_not_allowed: 405, unsupported_url: 400,
  blocked: 502, challenge: 502, rate_limited: 429, timeout: 504,
  too_large: 502, redirect_limit: 502, network_error: 502, upstream_error: 502, parse_failed: 422,
}

function json(body: FragranceImportResponse, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...(status === 405 ? { Allow: 'POST' } : {}) } })
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ ok: false, error: { code: 'method_not_allowed', message: 'Send a POST request with a JSON url field.' } }, 405)
  }
  try {
    if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') ?? '')) {
      throw new ImportFailure('invalid_request', 'The request must contain application/json.')
    }
    const text = await request.text()
    if (Buffer.byteLength(text) > 8192) throw new ImportFailure('invalid_request', 'The request body must be smaller than 8 KB.')
    let body: unknown
    try { body = JSON.parse(text) } catch { throw new ImportFailure('invalid_request', 'The request body must be valid JSON.') }
    if (!body || typeof body !== 'object' || !('url' in body) || typeof body.url !== 'string' || !body.url.trim()) {
      throw new ImportFailure('invalid_request', 'Provide a nonempty string url field.')
    }
    return json({ ok: true, result: await importFragrancePage(body.url.trim()) }, 200)
  } catch (caught) {
    if (caught instanceof ImportFailure) return json({ ok: false, error: caught.detail }, ERROR_STATUS[caught.detail.code])
    return json({ ok: false, error: { code: 'network_error', message: 'The import trial could not complete the request.' } }, 502)
  }
}
