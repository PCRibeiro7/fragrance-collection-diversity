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

1. Add an owned fragrance with its brand, name, and optional concentration/source links.
2. Select the fragrance and choose **Capture relationships**.
3. Pick Fragrantica or Parfumo and paste one related fragrance per line. `Brand | Fragrance` is the preferred format.
4. Complete missing brands and review identity suggestions. Fuzzy suggestions are never merged automatically.
5. Replace the saved list and inspect the resulting graph, evidence, shared context, and collection coverage.

Observations remain directed in storage. Each displayed edge points toward the referenced fragrance, with arrowheads at both ends for mutual references. Its weight is from 1–4: one point for each unique source and direction. The number and line thickness indicate evidence count, not direction; arrows reflect the enabled sources. Community detection still treats relationships as undirected. A missing link means insufficient evidence, not uniqueness.

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
