import { ImportFailure } from '../../server/fragranceImporter'
import { MAX_CAPTURE_BYTES, parseBrowserCapture } from '../../server/browserCapture'

export default async function handler(request: Request): Promise<Response> {
  const json = (body: unknown, status: number) => Response.json(body, {
    status, headers: { 'Cache-Control': 'no-store', ...(status === 405 ? { Allow: 'POST' } : {}) },
  })
  if (request.method !== 'POST') return json({ ok: false, error: { code: 'method_not_allowed', message: 'Send a POST request containing a browser capture.' } }, 405)
  try {
    if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') ?? '')) throw new ImportFailure('invalid_request', 'The request must contain application/json.')
    const reader = request.body?.getReader()
    if (!reader) throw new ImportFailure('invalid_request', 'Choose a browser capture file.')
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > MAX_CAPTURE_BYTES) {
          await reader.cancel()
          throw new ImportFailure('too_large', 'The browser capture exceeds the 2 MB limit.')
        }
        chunks.push(value)
      }
    } finally { reader.releaseLock() }
    let body: unknown
    try { body = JSON.parse(Buffer.concat(chunks, size).toString('utf8')) } catch { throw new ImportFailure('invalid_request', 'The capture file must contain valid JSON.') }
    return json({ ok: true, result: parseBrowserCapture(body) }, 200)
  } catch (caught) {
    if (caught instanceof ImportFailure) return json({ ok: false, error: caught.detail }, caught.detail.code === 'parse_failed' ? 422 : caught.detail.code === 'too_large' ? 413 : 400)
    return json({ ok: false, error: { code: 'parse_failed', message: 'The browser capture could not be read.' } }, 422)
  }
}
