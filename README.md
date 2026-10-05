# Scent Map

A private, browser-local map for understanding similarity clusters in a fragrance collection. It stores directed observations from manually entered Fragrantica and Parfumo similarity lists, then derives transparent weighted relationships and communities.

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

1. Use **Preview a fragrance** to compare a candidate with the collection without saving it. Paste either community similarity list to see direct owned overlaps, shared context, and the closest known profiles.
2. Add an owned fragrance with its brand, name, and optional concentration/source links.
3. Select the fragrance and choose **Capture relationships**.
4. Pick Fragrantica or Parfumo and paste one related fragrance per line. `Brand | Fragrance` is the preferred format.
5. Complete missing brands and review identity suggestions. Fuzzy suggestions are never merged automatically.
6. Replace the saved list and inspect the resulting graph, evidence, shared context, and collection coverage.

Preview assessments are intentionally cautious: unmatched names and missing links count as unknown evidence, not proof that a candidate is unique.

Use **Find duplicates** in the sidebar to scan owned and context fragrances for possible duplicates based on names, brand aliases, and source pages. Suggestions include reasons and warnings; concentrations, flankers, and release years may identify different products. Nothing is merged automatically.

Choose **Review merge**, select the identity to keep, resolve any conflicting source URLs, and choose **Confirm merge**. The merged fragrance remains owned if either record was owned. Captures, dates, page URLs, and incoming and outgoing evidence are retained, while self-links and repeated targets within a capture are removed. The removed identity is remembered as a merged name for future entries and captures.

Choose **Keep separate** to dismiss a pair, and use **Kept separate** > **Review again** to reconsider it. **Merge history** records the original identities and source URL choices. **Undo latest merge** restores the previous records, even after reopening the app, as long as collection data has not changed since that merge.

Select any owned or context fragrance and choose **Edit fragrance** to correct its brand, name, optional variant/concentration, or source links. Clearing an optional field removes its saved value. Editing preserves ownership, incoming and outgoing relationships, and the URLs and dates recorded in past captures. Future captures start with the updated source link.

An edit that matches another fragrance’s exact brand, name, and concentration, including a recognized merged name, is blocked. **Review duplicate** discards the unsaved edit and opens the two saved records in the existing merge review; merging still requires explicit confirmation. Different concentrations remain distinct, and edits do not create aliases for previous names. Existing merged-name recognition is preserved.

Changing identity fields or source links resets keep-separate decisions involving that fragrance so those pairs can be reviewed again. Saved changes also make the latest merge undo unavailable to protect newer edits; saving unchanged details does not.

Observations remain directed in storage. Each displayed edge points toward the referenced fragrance, with arrowheads at both ends for mutual references. Its weight is from 1–4: one point for each unique source and direction. The number and line thickness indicate evidence count, not direction; arrows reflect the enabled sources. Community detection still treats relationships as undirected. A missing link means insufficient evidence, not uniqueness.

The map controls separate search from four labeled filters: **Evidence source**, **Show fragrances**, **Focus group**, and **Group detail**. Open **Group detail** to calibrate the communities. Move it toward **Broader** to combine related neighborhoods, or toward **More separate** to split them into smaller groups. The panel shows the group count and offers **Reset to default**. This changes only the derived grouping and colors; it never changes saved fragrances or relationship evidence.

## Privacy and backups

The application has no backend and makes no requests to Fragrantica or Parfumo. IndexedDB in the current browser profile is the primary database. Use **Export** regularly to download a versioned JSON backup. Restore validates the entire file and previews record counts before replacing local data.

Deleting browser site data will delete the local collection unless a backup has been exported.

## Deploy to Netlify

The repository includes a `netlify.toml` with the production build and publish settings. In Netlify, import this repository and deploy it with the detected configuration, or use the Netlify CLI:

```bash
netlify init
netlify deploy --build --prod
```

Data is stored in IndexedDB per site origin. Changing the Netlify domain later makes an existing browser collection unavailable at the new address, so export a backup before changing domains.
