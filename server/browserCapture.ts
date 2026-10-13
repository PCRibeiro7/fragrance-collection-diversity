import { loadBuffer } from 'cheerio'
import type { FragrancePageImport } from '../src/domain/fragranceImport'
import { ImportFailure, validateFragranceUrl } from './fragranceImporter'
import { parseFragrancePage } from './importParsers'

export const MAX_CAPTURE_BYTES = 2 * 1024 * 1024

export function parseBrowserCapture(input: unknown): FragrancePageImport {
  if (!input || typeof input !== 'object' || !('format' in input) || (input.format !== 'scent-map-fragrance-capture' && input.format !== 'scent-map-fragrantica-capture')
    || !('version' in input) || input.version !== 1
    || !('pageUrl' in input) || typeof input.pageUrl !== 'string'
    || !('identityHtml' in input) || typeof input.identityHtml !== 'string'
    || !('similarityHtml' in input) || typeof input.similarityHtml !== 'string') {
    throw new ImportFailure('invalid_request', 'Choose a Fragrantica or Parfumo capture file downloaded by the browser helper.')
  }
  if (Buffer.byteLength(JSON.stringify(input)) > MAX_CAPTURE_BYTES) throw new ImportFailure('too_large', 'The browser capture exceeds the 2 MB limit.')
  const { url, source } = validateFragranceUrl(input.pageUrl)
  const legacy = input.format === 'scent-map-fragrantica-capture'
  if ((legacy && source !== 'fragrantica') || (!legacy && (!('source' in input) || input.source !== source))
    || (legacy && 'source' in input && input.source !== 'fragrantica')) {
    throw new ImportFailure('invalid_request', 'The capture source must match its fragrance page URL.')
  }
  const $ = loadBuffer(Buffer.from(input.similarityHtml), { encoding: { defaultEncoding: 'utf-8' } })
  const section = $(legacy ? '#similar' : '#scent-map-similarities')
  const sectionName = source === 'parfumo' ? 'Smells similar' : 'This perfume reminds me of'
  if (section.length !== 1) throw new ImportFailure('parse_failed', `The capture did not contain the loaded ${sectionName} section.`)
  section.find('script, style, template, iframe, [hidden], [aria-hidden="true"]').remove()
  const hasHeading = section.find('h2, h3, h4, h5, h6').toArray().some((item) => $(item).text().trim().toLowerCase() === sectionName.toLowerCase())
  const html = Buffer.from(`${input.identityHtml}${hasHeading ? '' : `<h2>${sectionName}</h2>`}${section.prop('outerHTML')}`)
  const result = parseFragrancePage(html, source, url.href)
  if (!result?.similarities.length) throw new ImportFailure('parse_failed', 'No usable fragrance identities were found in this capture. Scroll until the cards load and capture again, or paste the section manually.')
  // The helper did not observe HTTP status or prove that every source card loaded.
  delete result.upstreamStatus
  return {
    ...result, captureMethod: 'browser', completeness: result.completeness === 'partial' ? 'partial' : 'unknown',
    warnings: [...result.warnings, 'Captured from a loaded browser section. Only loaded cards are included; the full source list has not been verified.'],
  }
}
