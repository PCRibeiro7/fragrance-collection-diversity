# Fragrantica and Parfumo browser helper

This local Chrome/Edge extension reads the fragrance identity and loaded similarity cards on English Fragrantica and Parfumo fragrance pages. You control loading the page and any additional cards. The helper makes no network requests, clicks no site controls, and does not read cookies or browser storage.

## Install once

1. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose this directory: `browser-helper/fragrantica`.
4. Pin **Scent Map Fragrance Capture** to the browser toolbar.

If you installed the earlier Fragrantica helper, click **Reload** on its extension card. The directory remains `browser-helper/fragrantica`, so the existing installation can be updated in place. Its displayed name changes to **Scent Map Fragrance Capture**; permissions stay the same.

The helper requires only `activeTab` and `scripting`, giving it temporary access when you invoke it. There are no persistent host permissions or background capture. See [Chrome's activeTab documentation](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab) and [local extension installation instructions](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

## Capture and import

1. Open the fragrance's English Fragrantica.com or Parfumo.com page in the browser.
2. On Fragrantica, scroll to **This perfume reminds me of**. On Parfumo, scroll to **Smells similar** and select **Similar**. Wait for the fragrance cards to appear. Use **All** or the site's other controls to load more cards if available.
3. Open the helper and choose **Capture loaded section**. It asks you to load the cards when the section is missing or still a placeholder. Parfumo's **Layer** and **Associations** tabs are excluded.
4. Choose **Download capture** to save `fragrantica-capture.json` or `parfumo-capture.json`.
5. Return to Scent Map. Inside **Add fragrance** or **Capture relationships**, choose **Load browser capture** and select that file. For existing relationships, select the matching **Fragrantica** or **Parfumo** source first.
6. Check the extracted identity, concentration, similarities, and warnings. Choose to use the preview, review identity matches, acknowledge the unverified or partial list, and explicitly save it.

Keep the app's Netlify function server running for local use; restart it after adding the new `import-fragrance-capture` function. The capture is parsed through that backend, which makes no source requests for this path. Only the captured identity and similarity section are sent for parsing, not your collection. Capture files are limited to 2 MB.

The helper reads the fragrance heading, page title, minimal product identity, and loaded similarity section. It excludes unrelated page sections, scripts, hidden elements, review data from structured products, and attributes not needed for extraction. Explicit Parfumo card navigation URLs are read as data; click handlers are never executed. HTML is parsed as data and is never injected into the app UI. Source HTTP status is not measured by browser capture. Lists remain unverified, or partial when an advertised count exceeds extraction; they cannot silently replace saved relationships.

New downloads use the version 1 `scent-map-fragrance-capture` format with a source field. The app also accepts earlier `scent-map-fragrantica-capture` files.

## Validation limits

Controlled DOM tests cover both sources, lazy sections, loaded cards, repeated cards, plain-text brands, aliases, EDT/EDP distinctions, tab and section scope, explicit card navigation, unsafe files, legacy files, and size limits. UI coverage verifies capture-file preview, source matching, and acknowledgment before saving. Live hydrated captures from both sites still need to be checked in your browser; layouts can change. If extraction cannot identify the cards, the app rejects the capture and offers manual section copy/paste.

After modifying helper files, click **Reload** on the extension's card in the browser extensions page before trying again.
