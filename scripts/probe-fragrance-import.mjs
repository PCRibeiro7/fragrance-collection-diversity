import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { setTimeout } from 'node:timers/promises'

const args = process.argv.slice(2)
if (!args[0] || args.includes('--help')) {
  console.log('Usage: npm run import:probe -- <base-url> [--environment local|netlify] [--output results.json]')
  process.exit(args.includes('--help') ? 0 : 1)
}
const base = new URL(args[0])
if (base.username || base.password || !['http:', 'https:'].includes(base.protocol)) throw new Error('Use an HTTP(S) backend base URL without credentials.')
for (let index = 1; index < args.length; index += 2) {
  if (!['--environment', '--output'].includes(args[index])) throw new Error(`Unknown option ${args[index]}. In PowerShell, use npm.cmd to forward option flags.`)
}
const option = (name) => {
  const index = args.indexOf(name)
  if (index < 0) return undefined
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Missing value for ${name}`)
  return args[index + 1]
}
const environment = option('--environment') ?? (['localhost', '127.0.0.1'].includes(base.hostname) ? 'local' : 'netlify')
if (!['local', 'netlify'].includes(environment)) throw new Error('Environment must be local or netlify.')
const output = option('--output')
const sources = [
  { source: 'fragrantica', pages: [
    ['Eau de Parfum', 'https://www.fragrantica.com/perfume/Diptyque/Philosykos-3865.html'],
    ['Eau de Toilette', 'https://www.fragrantica.com/perfume/Diptyque/Philosykos-Eau-de-Toilette-72040.html'],
  ] },
  { source: 'parfumo', pages: [
    ['Eau de Parfum', 'https://www.parfumo.com/Perfumes/Diptyque/Philosykos_Eau_de_Parfum'],
    ['Eau de Toilette', 'https://www.parfumo.com/Perfumes/Diptyque/Philosykos'],
  ] },
]
const report = { environment, backend: base.origin, startedAt: new Date().toISOString(), probes: [] }
for (const { source, pages } of sources) {
  for (const [expectedVariant, url] of pages) {
    const started = Date.now()
    let record
    try {
      const response = await fetch(new URL('/.netlify/functions/import-fragrance', base), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }), signal: AbortSignal.timeout(30_000),
      })
      const body = await response.json()
      if (typeof body?.ok !== 'boolean') throw new Error('The backend did not return an import-trial response.')
      record = { source, url, expectedVariant, endpointStatus: response.status, elapsedMs: Date.now() - started, ...body }
      if (body.ok) {
        const fragrance = body.result.fragrance
        record.identityMatchesExpected = fragrance.brand === 'Diptyque' && fragrance.name === 'Philosykos' && fragrance.variant === expectedVariant
      }
    } catch (caught) {
      record = { source, url, expectedVariant, elapsedMs: Date.now() - started, ok: false, error: { code: 'probe_failed', message: caught.message } }
    }
    report.probes.push(record)
    console.error(`${environment} ${source} ${expectedVariant}: ${record.ok ? `${record.result.similarities.length} similarities (${record.result.completeness})` : record.error.code}`)
    // One blocking response ends this provider's trial in this environment.
    if (!record.ok && (['blocked', 'challenge', 'rate_limited'].includes(record.error.code) || record.error.upstreamStatus !== 200)) break
    await setTimeout(2000)
  }
}
report.finishedAt = new Date().toISOString()
const json = `${JSON.stringify(report, null, 2)}\n`
if (output) {
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, json)
}
console.log(json)
