import { ExternalLink } from 'lucide-react'

export function FragranticaCaptureHelp({ pageUrl }: { pageUrl: string }) {
  let sectionUrl: string | undefined
  try {
    const url = new URL(pageUrl)
    if (url.protocol === 'https:' && ['fragrantica.com', 'www.fragrantica.com'].includes(url.hostname) && !url.username && !url.password && !url.port) {
      url.hash = 'similar'
      sectionUrl = url.href
    }
  } catch { /* Instructions remain available before a page link is entered. */ }

  return <div className="fragrantica-capture-help">
    <strong>Load Fragrantica relationships in your browser</strong>
    <p>Scroll to “This perfume reminds me of” and wait for the fragrance cards to appear. Use the browser helper to capture that loaded section, then choose Load browser capture above. You can also copy only that section and paste it below.</p>
    <p>Link import can fill the fragrance details. Scrolling on Fragrantica loads relationships in that tab; it does not add them to the link import response.</p>
    {sectionUrl && <a href={sectionUrl} target="_blank" rel="noreferrer">Open Fragrantica similarity section <ExternalLink size={12} /></a>}
  </div>
}
