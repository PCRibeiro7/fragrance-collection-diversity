# Scent Map

A private, browser-local map for understanding similarity clusters in a fragrance collection. It stores directed observations from Fragrantica and Parfumo similarity lists entered manually or reviewed through experimental link import, then derives transparent weighted relationships and communities.

## Run locally

Requirements: Node.js 22 and npm.

```bash
npm install
npm run dev
```

Open the localhost URL printed by Vite. For a production check:

```bash
npm run build
npm test
```

## Workflow

1. Use **Preview a fragrance** to compare a candidate with the collection without saving it. Paste either community similarity list to see direct owned overlaps, shared context, the closest known profiles, and its predicted group.
2. Add an owned fragrance with its brand, name, and optional concentration/source links. **Import from a link** can preview and fill these details from an English fragrance page; choose **Use imported details** or **Use details and similarities** after checking the result.
3. Select the fragrance and choose **Capture relationships**.
4. Pick Fragrantica or Parfumo and paste one related fragrance per line, or use **Import link** and **Review imported similarities**. `Brand | Fragrance` is the preferred paste format. Link import checks that the source page identifies the selected fragrance and concentration.
5. Complete missing brands and review identity suggestions. Fuzzy suggestions are never merged automatically.
6. Replace the saved list and inspect the resulting graph, evidence, shared context, and collection coverage. Partial or unverified imported lists require acknowledgment before saving. A result with no usable similarities never clears saved relationships.

Preview assessments are intentionally cautious: unmatched names and missing links count as unknown evidence, not proof that a candidate is unique.

**Predicted group** temporarily adds the candidate and pasted relationships, including unmatched names as new context fragrances, and reruns grouping using the map’s current **Evidence source** and **Group detail** settings. Search, **Show fragrances**, and **Focus group** do not limit the simulation. The result shows whether the candidate would join an existing group or form a new group, current group labels and colors, and predicted members. It flags when multiple current groups come together or only part of a group would remain with the candidate. Expand the member list to see everyone, including temporary context.

Adjust the **Group detail** slider inside the preview results to update the predicted grouping immediately, from **Broader** to **More separate**. The slider starts at the map’s setting and changes only the current preview; the main map and its saved preference stay unchanged. **Reset to map setting** restores the starting value. Group labels and colors continue to identify groups on the main map, so partial-group and regrouping notices show how the prediction differs from those groups. Editing the inputs retains the preview’s slider value; closing and reopening starts from the map’s setting again.

For a candidate already on the map, each nonempty pasted list replaces its outgoing relationships for that source in the simulation. Blank lists retain saved evidence, and incoming relationships remain intact. The redundancy assessment continues to summarize known profiles using both sources and saved evidence. Temporary context contributes to group prediction but has no saved profile for shared-context redundancy analysis. No fragrances, relationships, or preferences are saved by previewing. A separate predicted group is not proof of uniqueness, and predictions can change as evidence grows.

Use **Find duplicates** in the sidebar to scan owned and context fragrances for possible duplicates based on names, brand aliases, and source pages. Suggestions include reasons and warnings; concentrations, flankers, and release years may identify different products. Nothing is merged automatically.

Choose **Review merge**, select the identity to keep, resolve any conflicting source URLs, and choose **Confirm merge**. The merged fragrance remains owned if either record was owned. Captures, dates, page URLs, and incoming and outgoing evidence are retained, while self-links and repeated targets within a capture are removed. The removed identity is remembered as a merged name for future entries and captures.

Choose **Keep separate** to dismiss a pair, and use **Kept separate** > **Review again** to reconsider it. **Merge history** records the original identities and source URL choices. **Undo latest merge** restores the previous records, even after reopening the app, as long as collection data has not changed since that merge.

Select any owned or context fragrance and choose **Edit fragrance** to correct its brand, name, optional variant/concentration, or source links. Clearing an optional field removes its saved value. Editing preserves ownership, incoming and outgoing relationships, and the URLs and dates recorded in past captures. Future captures start with the updated source link.

An edit that matches another fragrance’s exact brand, name, and concentration, including a recognized merged name, is blocked. **Review duplicate** discards the unsaved edit and opens the two saved records in the existing merge review; merging still requires explicit confirmation. Different concentrations remain distinct, and edits do not create aliases for previous names. Existing merged-name recognition is preserved.

Changing identity fields or source links resets keep-separate decisions involving that fragrance so those pairs can be reviewed again. Saved changes also make the latest merge undo unavailable to protect newer edits; saving unchanged details does not.

Observations remain directed in storage. Each displayed edge points toward the referenced fragrance, with arrowheads at both ends for mutual references. Its weight is from 1–4: one point for each unique source and direction. The number and line thickness indicate evidence count, not direction; arrows reflect the enabled sources. Community detection still treats relationships as undirected. A missing link means insufficient evidence, not uniqueness.

The map controls separate search from four labeled filters: **Evidence source**, **Show fragrances**, **Focus group**, and **Group detail**. Open **Group detail** to calibrate the communities. Move it toward **Broader** to combine related neighborhoods, or toward **More separate** to split them into smaller groups. The panel shows the group count and offers **Reset to default**. This changes only the derived grouping and colors; it never changes saved fragrances or relationship evidence.

## Privacy and backups

The collection UI stores data in IndexedDB in the current browser profile. Clicking **Import link** sends only the submitted URL to the backend, which requests the source page and returns a preview. **Load browser capture** sends the captured heading and similarity section for parsing, without requesting the source again. The backend never writes to the collection; saving a reviewed import uses the existing local storage workflow. Use **Export** regularly to download a versioned JSON backup. Restore validates the entire file and previews record counts before replacing local data.

Deleting browser site data will delete the local collection unless a backup has been exported.

## Import feasibility trial

The repository includes a Node 22 Netlify function at `POST /.netlify/functions/import-fragrance`, accepting a JSON `{ url }` body. It returns fragrance details, similarity identities when present in the returned HTML, completeness warnings, or a specific access/parsing failure. It never saves the result. The experimental UI is available inside **Add fragrance** and **Capture relationships**.

To test the UI locally, keep the function server running in one terminal:

```powershell
# On this machine, use the public Windows roots prepared during the trial:
if (Test-Path '.import-trial.local/windows-roots.pem') {
  $env:NODE_EXTRA_CA_CERTS = (Resolve-Path '.import-trial.local/windows-roots.pem').Path
}
netlify functions:serve --port 8888 --offline
```

In a second terminal, run `npm run dev` and open the Vite URL. Vite forwards import requests to the function server on port 8888. Choose **Add fragrance**, paste a fragrance page into **Fragrance page URL**, and click **Import link**. Review the preview, use the result, then save through the usual identity review. Nothing is saved merely by fetching or using a preview.

Use the [Fragrantica and Parfumo browser helper](browser-helper/fragrantica/README.md) to capture loaded similarities. Install **Scent Map Fragrance Capture** with **Load unpacked**, using the existing `browser-helper/fragrantica` directory. Reload the extension in `chrome://extensions` or `edge://extensions` if you already installed it. On Fragrantica, scroll to **This perfume reminds me of**; on Parfumo, scroll to **Smells similar**, select **Similar**, and load **All** cards if available. Once the cards appear, click **Capture loaded section → Download capture**, and select the file with **Load browser capture** in either fragrance dialog. For **Capture relationships**, select the matching source first. Restart the local function server after updating the capture endpoint. The app previews the captured list and requires acknowledgment before saving; the helper makes no extra source requests. Earlier Fragrantica capture files remain supported.

You can also copy the loaded section and paste it into the relationships field. Fragrantica's tested server responses lacked loaded similarities, and Parfumo returned a browser challenge locally. Do not repeat a blocked source's live probes in the current trial environment.

The batch probe script is `scripts/probe-fragrance-import.mjs`; it tests ordinary server requests and stops each source after a block, browser challenge, or rate limit. See [the feasibility report](docs/import-feasibility.md) for observed local results, API limits, validation, and the pending Netlify draft test. The helper is a separate browser capture path and has been tested using controlled DOM examples; a live loaded-page capture needs browser validation.

## Deploy to Netlify

The repository includes a `netlify.toml` with the production build and publish settings. In Netlify, import this repository and deploy it with the detected configuration, or use the Netlify CLI:

```bash
netlify init
netlify deploy --build --prod
```

Data is stored in IndexedDB per site origin. Changing the Netlify domain later makes an existing browser collection unavailable at the new address, so export a backup before changing domains.
