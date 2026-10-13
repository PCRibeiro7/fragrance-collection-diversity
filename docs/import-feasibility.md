# Fragrance import feasibility trial

Status: local evaluation complete; Netlify draft upload awaits the agreed approval. Trial date: October 10, 2026 (America/Sao_Paulo).

## Findings

Ordinary server requests extracted the correct brand, name, and concentration from both tested Fragrantica variants. Their similarity list is deferred to browser JavaScript. Parfumo responded with a browser challenge. Neither source has demonstrated a usable server-side similarity import in this environment, and hosted behavior remains unverified.

The endpoint never writes to the collection database. The experimental browser UI can use a preview and save it locally only after explicit confirmation. A successful response with zero extracted similarities and `unknown` completeness must not be interpreted as an empty source list or fragrance uniqueness; it never clears saved relationships.

| Environment | Source / page | Source HTTP / endpoint HTTP | Extracted identity | Similarities | Advertised total | Completeness | Extraction problem |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Local Netlify function | [Fragrantica Philosykos EDP](https://www.fragrantica.com/perfume/Diptyque/Philosykos-3865.html) | 200 / 200 | Diptyque · Philosykos · Eau de Parfum | 0 | Unavailable | Unknown | Similarity data absent from initial HTML |
| Local Netlify function | [Fragrantica Philosykos EDT](https://www.fragrantica.com/perfume/Diptyque/Philosykos-Eau-de-Toilette-72040.html) | 200 / 200 | Diptyque · Philosykos · Eau de Toilette | 0 | Unavailable | Unknown | Similarity data absent from initial HTML |
| Local Netlify function | [Parfumo Philosykos EDP](https://www.parfumo.com/Perfumes/Diptyque/Philosykos_Eau_de_Parfum) | 403 / 502 | Not extracted | Not extracted | Unavailable | Not assessed | `cf-mitigated: challenge`; stopped this source's local trial |
| Local Netlify function | [Parfumo Philosykos EDT](https://www.parfumo.com/Perfumes/Diptyque/Philosykos) | Not requested | Not extracted | Not extracted | Unavailable | Not assessed | Skipped after EDP challenge |
| Netlify draft | Fragrantica EDP / EDT | Pending | Pending | Pending | Pending | Pending | Awaiting draft deployment approval |
| Netlify draft | Parfumo EDP / EDT | Pending | Pending | Pending | Pending | Pending | Awaiting draft deployment approval; EDT conditional on EDP access |

The initial local probe ran at 15:20 Sao Paulo time. Its JSON records are in the ignored `.import-trial.local/local-results.json` artifact. A subsequent read-only inspection found this literal Fragrantica placeholder inside the returned HTML:

```html
<lazy-section-new section-id="similar" :show-skeleton="false">
  <div id="similar">
    <similar-perfumes-new :perfume_id="3865" title="This perfume reminds me of"></similar-perfumes-new>
  </div>
</lazy-section-new>
```

The page was approximately 1.86 MB, below the response limit. No internal endpoints, external scripts, or related perfume pages were fetched. The importer now identifies this placeholder with an explicit JavaScript-loading warning. The original probe records preserve the earlier generic missing-section warning.

## API and limits

`POST /.netlify/functions/import-fragrance` accepts an `application/json` body containing `{ "url": "https://www.parfumo.com/Perfumes/Diptyque/Philosykos" }`.

A successful response is `{ ok: true, result: FragrancePageImport }`. The shared result type contains source, resolved page URL, fragrance input, related fragrance inputs, completeness, optional advertised total, warnings, and source HTTP status. EDT and EDP identities remain distinct. Only explicit concentration labels are separated from names; a flanker such as Aventus Cologne retains its name.

`POST /.netlify/functions/import-fragrance-capture` accepts a version 1 `scent-map-fragrance-capture` JSON file with a matching `fragrantica` or `parfumo` source, up to 2 MB. Earlier `scent-map-fragrantica-capture` files remain accepted for Fragrantica only. It validates the source URL, parses only the captured identity and similarity section without making source requests, and returns the same result with `captureMethod: "browser"`. `upstreamStatus` is omitted because no source HTTP response was observed. Invalid files return 400, unrecognized or empty loaded sections return 422, and oversized uploads return 413. Captured lists are always unverified or partial and require acknowledgment before saving.

Failures use `{ ok: false, error: { code, message, source?, pageUrl?, upstreamStatus? } }`. `upstreamStatus` is the source site's status, distinct from the endpoint status. Invalid input and unsupported URLs return 400, wrong methods return 405, unrecognized layouts return 422, source rate limits return 429, timeouts return 504, and blocks, challenges, oversized pages, redirect failures, network failures, and other source errors return 502.

Requests accept only HTTPS English fragrance-page routes on bare or `www` Fragrantica.com and Parfumo.com hosts. Credentials, custom ports, unrelated paths, encoded path separators, and redirects to other providers are rejected. Fetching has a 15-second overall deadline, a 5 MB decoded-body cap, and at most three validated redirects. Challenges and rate limits are never retried. Responses are not cached, and the backend neither stores collection data nor sends it to source sites.

Similarity extraction stays within the matching section, excludes recognized layering/association tabs and subsequent recommendations, and deduplicates normalized brand/name/concentration identities. `complete` requires a matching advertised count with no unresolved cards. Missing totals or sections produce `unknown`; an advertised total above the extracted count produces `partial`. The saving UI requires acknowledgment before a partial or unverified list replaces stored evidence.

## Browser review flow

**Add fragrance** and **Capture relationships** include an experimental **Import from a link** panel. Fetching shows the resolved source page, identity, similarity count, advertised total when available, completeness, and warnings. The user explicitly chooses to use the result. Source failures remain visible and do not trigger automatic retries; manual entry remains available.

Add can fill details alone without creating an empty capture. Usable similarities enter the existing editable identity review, retaining concentrations as structured values. Importing a different root identity clears the previous draft's lists after showing that consequence in the preview. Subsequent root identity edits cannot silently attach an imported list to another fragrance.

Capture requires the imported root to match the selected fragrance and concentration, including recognized merged names. It rejects mismatched pages and disables use of an empty similarity result. Partial and unknown lists require a checkbox acknowledgment before the final save; editing review rows resets that acknowledgment. Manual edits to an imported text list or review rows make its completeness unverified. Saving replaces only the reviewed source, using the existing browser database transactions; no database migration is needed.

For local UI testing, run `npm run dev` alongside the standalone function server below. Vite proxies `/.netlify/functions` to `http://localhost:8888`. This avoids the linked site's existing Netlify development extension installation issue. See the README for the process-local certificate setting needed on this machine.

## Browser capture of lazy similarities

Fragrantica's similarity component loads after scrolling; scrolling in a user's tab cannot change an independent server request. The local [Chrome/Edge helper](../browser-helper/fragrantica/README.md) supports Fragrantica and Parfumo and reads the loaded section when the user clicks Capture. On Parfumo, the user selects **Similar** under **Smells similar** and loads **All** cards if available; other tabs and later sections are excluded. It has only temporary `activeTab` access and the `scripting` permission, with no background capture or persistent host access. The user loads the page and any additional cards, downloads the capture, and explicitly loads it into the app. The helper makes no requests, fetches no related pages, and does not automate site interaction.

The capture includes the heading, page title, minimal product identity, and loaded similarity markup, with irrelevant attributes and scripts removed. Explicit Parfumo card navigation URLs can be normalized into links without executing click handlers. It excludes unrelated shopping sections and structured review text. The backend treats that markup as data; the UI renders only parsed identities. Controlled DOM and upload tests exercise both sources, but live hydrated captures still require browser validation. This browser path does not change the ordinary-request feasibility results in the table.

## Reproduce and validate

Run `npm test`, `npm run lint`, and `npm run build`. The build type-checks server and Netlify function files as well as the existing browser app. UI coverage exercises partial-list acknowledgment, details-only preservation, challenge errors without automatic retry, concentration distinctions, mismatched-page rejection, and loading captures from both sources before saving. Helper tests cover loaded versus lazy sections, extraction scope, unrelated tabs, explicit card navigation, plain-brand cards, aliases, duplicates, unsafe files, legacy files, and upload limits. Local HTTP checks verified Vite's function proxy using an unsupported URL and parsed controlled browser-capture fixtures without requesting either source. Parser tests use small controlled HTML examples; live hydrated captures from both sites remain unvalidated.

After adding Parfumo browser capture, validation passed: 157 tests across 24 files, lint, type checks, application build, helper syntax checks, and standalone Node 22 function bundles. A controlled Parfumo capture sent through the running Vite proxy returned HTTP 200, the correct Philosykos EDP identity, an EDT similarity, advertised total 30, and partial completeness. This checked local capture parsing without making a Parfumo request.

Start the standalone function server:

```powershell
netlify functions:serve --port 8888 --offline
```

The CLI's offline flag skips Netlify platform configuration lookups; the function still makes ordinary outbound source requests. Full `netlify dev` on this linked site failed while installing its existing `prerender` extension with npm E401. The standalone server successfully exercised the same function without installing that extension.

Run the probes from a second terminal. Using `npm.cmd` on Windows preserves script option flags:

```powershell
npm.cmd run import:probe -- http://localhost:8888 --environment local --output .import-trial.local/local-results.json
```

The script probes Fragrantica and then Parfumo sequentially, starting with Philosykos EDP and checking EDT only after successful access. Each source stops after a block, challenge, rate limit, or other failure before an HTTP 200 page. Do not rerun a blocked source in the same trial environment. This machine required process-local `NODE_EXTRA_CA_CERTS` referencing exported Windows-trusted public root certificates; TLS verification remained enabled.

The prepared function bundles are `.import-trial.local/functions/import-fragrance.zip` and `.import-trial.local/functions/import-fragrance-capture.zip`. Prepare them without uploading:

```powershell
netlify functions:build --src netlify/functions --functions .import-trial.local/functions
```

## Draft preview and decision

Linked site: `scent-collection-map`, ID `047e1559-a669-418d-babf-f86e49a16ab1`. The following exact action awaits approval; it creates a draft URL using the checked frontend build and re-bundles the reviewed function source without reusing stale function caches:

```powershell
netlify deploy --no-build --site 047e1559-a669-418d-babf-f86e49a16ab1 --dir dist --functions netlify/functions --skip-functions-cache --message "Fragrance import feasibility trial"
```

After approval and deployment, run the probe script against the returned draft URL with `--environment netlify --output .import-trial.local/netlify-results.json`, then update this table. The upload does not include a production-promotion flag. No Git push or production deployment is part of the trial.

Recommend full server-import integration for a source only after hosted EDP and EDT probes return correct identities and usable similarity lists. Clearly flagged partial lists are acceptable. Fragrantica's current local result supports details-only autofill; Parfumo's challenge favors evaluating capture from a normally loaded browser page if the hosted test remains blocked. The helper now supports both sources and still requires live browser validation. It does not complete or bypass browser challenges.

Fragrantica requests were performed under the written authorization confirmed by the user. The trial is for personal use. Its experimental UI adds no database migration or automatic saving behavior. The UI does not establish that either source meets the full server-import recommendation criteria above; hosted evaluation still awaits draft deployment approval.
