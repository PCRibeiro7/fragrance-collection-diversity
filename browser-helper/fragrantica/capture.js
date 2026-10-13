// Kept self-contained because Chrome serializes this function into the active tab.
export function captureLoadedFragrancePage() {
  const url = new URL(location.href)
  const source = ['fragrantica.com', 'www.fragrantica.com'].includes(url.hostname) ? 'fragrantica'
    : ['parfumo.com', 'www.parfumo.com'].includes(url.hostname) ? 'parfumo' : undefined
  const supportedPath = source === 'parfumo' ? /^\/Perfumes\/[^/]+\/[^/]+\/?$/ : /^\/(?:perfume\/[^/]+\/[^/]+-\d+\.html|p\/\d+)\/?$/
  if (!source || url.protocol !== 'https:' || url.port || url.username || url.password || /%2f|%5c|%00/i.test(url.pathname) || !supportedPath.test(url.pathname)) {
    return { ok: false, message: 'Open an English Fragrantica or Parfumo fragrance page first.' }
  }
  const sectionName = source === 'parfumo' ? 'Smells similar' : 'This perfume reminds me of'
  const clean = (value) => (value ?? '').replace(/\s+/gu, ' ').trim()
  const excluded = 'script, style, template, iframe, [hidden], [aria-hidden="true"]'
  const isHidden = (element) => {
    for (let current = element; current; current = current.parentElement) {
      if (current.matches(excluded)) return true
      const style = getComputedStyle(current)
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return true
    }
    return false
  }
  let section
  let range
  const unrelatedPanes = new Set()
  if (source === 'fragrantica') section = document.querySelector('#similar')
  else {
    const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')]
    const start = headings.findIndex((item) => clean(item.textContent).toLowerCase() === sectionName.toLowerCase() && !isHidden(item))
    if (start >= 0) {
      const heading = headings[start]
      const stop = headings.slice(start + 1).find((item) => !isHidden(item) && (
        Number(item.tagName[1]) <= Number(heading.tagName[1]) || /^(?:Reviews|Statements|Images|Charts|Related links|Popular by|Users who like|Collections|Fragrance (?:Notes|Pyramid)|Shopping|Layer|Associations)/i.test(clean(item.textContent))
      ))
      range = document.createRange()
      range.setStartBefore(heading)
      if (stop) range.setEndBefore(stop)
      else range.setEndAfter(heading.parentElement)
      section = range.commonAncestorContainer
      // Tab controls can identify unrelated panes even when their IDs are opaque.
      for (const tab of section.querySelectorAll('[role="tab"], a[href^="#"], [data-target], [data-bs-target]')) {
        const label = clean(tab.textContent) || tab.getAttribute('title') || tab.querySelector('img')?.getAttribute('alt') || ''
        if (!range.intersectsNode(tab) || !/^(?:Layer|Associations)$/i.test(label)) continue
        const target = tab.getAttribute('aria-controls') || tab.getAttribute('data-bs-target') || tab.getAttribute('data-target') || tab.getAttribute('href')
        if (target) unrelatedPanes.add(target.replace(/^#/, ''))
      }
    }
  }
  if (!section || (section.nodeType === Node.ELEMENT_NODE && isHidden(section))) {
    return { ok: false, message: `Scroll to "${sectionName}"${source === 'parfumo' ? ' and select Similar' : ''}, then wait for the fragrance cards to load and capture again.` }
  }
  const inertDocument = document.implementation.createHTMLDocument('')
  const allowedAttributes = new Set(['id', 'class', 'href', 'title', 'alt', 'itemprop', 'content', 'property', 'role', 'aria-label', 'data-concentration'])
  const fragranceTarget = (href) => {
    if (!href) return undefined
    try {
      const target = new URL(href, url)
      if (target.protocol === 'https:' && !target.port && !target.username && !target.password
        && target.hostname.replace(/^www\./, '') === `${source}.com` && !/%2f|%5c|%00/i.test(target.pathname) && supportedPath.test(target.pathname)) return target
    } catch { /* Ignore invalid navigation attributes. */ }
    return undefined
  }
  const cloneLoaded = (node, inSection = true) => {
    if (inSection && range && !range.intersectsNode(node)) return null
    if (node.nodeType === Node.ELEMENT_NODE) {
      const unrelated = inSection && source === 'parfumo' && (unrelatedPanes.has(node.id)
        || /layer|associat|recommend/i.test(`${node.id} ${node.getAttribute('aria-label') ?? ''}`))
      if (node.matches(excluded) || (inSection && isHidden(node)) || unrelated) return null
    }
    let navigation
    if (inSection && source === 'parfumo' && node.nodeType === Node.ELEMENT_NODE && node.tagName !== 'A') {
      // Read explicit navigation URLs as data; never execute the site's click handler.
      const handler = node.getAttribute('onclick') ?? ''
      const locationUrl = handler.match(/(?:window\.)?location(?:\.href)?\s*=\s*(['"])([^'"]+)\1/)?.[2]
        || handler.match(/window\.open\(\s*(['"])([^'"]+)\1/)?.[2]
      navigation = fragranceTarget(node.getAttribute('data-url') || node.getAttribute('data-href') || locationUrl)
      if ([...node.querySelectorAll('a[href]')].some((link) => fragranceTarget(link.getAttribute('href')))) navigation = undefined
    }
    // Create inert markup with no image sources or event handlers, even during cloning.
    const copy = node.nodeType === Node.ELEMENT_NODE ? inertDocument.createElement(navigation ? 'a' : node.localName) : inertDocument.importNode(node, false)
    if (node.nodeType === Node.ELEMENT_NODE) {
      for (const attribute of node.attributes) {
        if (allowedAttributes.has(attribute.name)) copy.setAttribute(attribute.name, attribute.value)
      }
      const target = navigation || (node.tagName === 'A' ? fragranceTarget(node.getAttribute('href')) : undefined)
      if (target) copy.setAttribute('href', target.pathname)
    }
    for (const child of node.childNodes) {
      const cloned = cloneLoaded(child, inSection)
      if (cloned) copy.appendChild(cloned)
    }
    if (navigation) copy.querySelectorAll('a').forEach((link) => link.replaceWith(...link.childNodes))
    return copy
  }
  const clone = inertDocument.createElement('div')
  clone.id = 'scent-map-similarities'
  for (const child of section.childNodes) {
    const cloned = cloneLoaded(child)
    if (cloned) clone.appendChild(cloned)
  }
  if (!Array.from(clone.querySelectorAll('a[href]')).some((link) => {
    return fragranceTarget(link.getAttribute('href'))
  })) return { ok: false, message: `Scroll to "${sectionName}"${source === 'parfumo' ? ' and select Similar' : ''}, then wait for the fragrance cards to load and capture again.` }
  const heading = document.querySelector('h1')
  if (!heading) return { ok: false, message: 'The fragrance heading was not found. This page layout needs manual capture.' }
  const structured = []
  document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
    try {
      const pending = [JSON.parse(script.textContent)]
      while (pending.length) {
        const item = pending.pop()
        if (Array.isArray(item)) pending.push(...item)
        else if (item && typeof item === 'object') {
          const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']]
          if (types.includes('Product')) structured.push({ '@type': 'Product', url: item.url, name: item.name, brand: typeof item.brand === 'string' ? item.brand : { name: item.brand?.name } })
          if (item['@graph']) pending.push(item['@graph'])
        }
      }
    } catch { /* Visible identity remains available when structured data is malformed. */ }
  })
  const script = inertDocument.createElement('script')
  script.type = 'application/ld+json'
  script.textContent = JSON.stringify(structured).replace(/</g, '\\u003c')
  const brand = document.querySelector('[itemprop="brand"]')
  const title = inertDocument.createElement('title')
  title.textContent = document.title
  const pageTitle = document.querySelector('meta[property="og:title"]')
  url.hash = ''
  const capture = {
    format: 'scent-map-fragrance-capture', version: 1, source,
    pageUrl: url.href, capturedAt: new Date().toISOString(),
    identityHtml: cloneLoaded(heading, false).outerHTML + (brand ? cloneLoaded(brand, false)?.outerHTML ?? '' : '') + title.outerHTML + (pageTitle ? cloneLoaded(pageTitle, false).outerHTML : '') + script.outerHTML,
    similarityHtml: clone.outerHTML,
  }
  if (new TextEncoder().encode(JSON.stringify(capture, null, 2)).byteLength > 2 * 1024 * 1024) {
    return { ok: false, message: 'The loaded section is too large to capture. Copy the similarity list manually.' }
  }
  return { ok: true, capture }
}
