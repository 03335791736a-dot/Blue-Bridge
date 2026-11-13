# Blue Bridge v0.4.0

## Install / update

1. Extract `Blue-Bridge-v0.4.0.zip` to a normal folder.
2. In Chrome, open `chrome://extensions` and turn on **Developer mode**.
3. Remove the previous Blue Bridge copy (or update its loaded folder), then choose **Load unpacked**.
4. Select the extracted `Blue-Bridge-v0.4.0` project folder.
5. Pin Blue Bridge to the toolbar if desired, then refresh ordinary webpages.

## Existing features retained

- Text translation and source/target language selection.
- Google's publicly accessible free translation endpoint; no API key or paid API.
- Copy translated text.
- Whole webpage translation and original-text restoration.
- Stop translation, draggable floating bird button, focused-field translation and automatic typing preview.
- Right-click selected text translation.
- Manifest V3 service worker, original artwork and Blue Bridge branding.
- Footer: **Designed and Created by Maaz Khan**.

## New in v0.4.0

- **Live webpage progress:** translated/processed section counts, total, percentage, progress bar, status and a rough remaining-time estimate when enough timing data exists.
- **Dynamic content:** while live page translation is active, a MutationObserver queues newly inserted or changed text nodes. It uses a bounded two-worker queue and skips already-seen nodes.
- **Local history:** recent text translations (up to 40 entries, capped per text) can be copied, individually deleted or cleared. Stored in `chrome.storage.local`; no history sync or external history server.
- **Keyboard shortcuts:** open popup (Alt+Shift+B), translate selected text (Alt+Shift+S), translate webpage (Alt+Shift+T), restore page (Alt+Shift+R). Chrome may reserve or alter suggested shortcuts; customize them at `chrome://extensions/shortcuts`. Right-click selected text remains available as an alternative.
- **Website exclusions:** add/remove domains in Settings. The floating launcher and webpage translation are disabled for those domains and their subdomains. Exclusions persist in local Chrome storage.
- **About tab:** creator/admin details and contact email.

## Live webpage translation notes

After the initial page scan finishes, Blue Bridge keeps a lightweight observer active and processes new eligible text as the page inserts it. The popup's **Stop translation** button stops the observer and queued work. **Restore original page** stops monitoring and restores every still-connected text node changed by Blue Bridge, including text added after the initial scan.

The extension ignores its own interface, scripts, styles, form controls, code/preformatted blocks, hidden elements, editable regions, and explicitly non-translatable content. Some shadow DOM, cross-origin frames, protected browser pages and unusual site-specific content are not accessible to Chrome extensions.

## Privacy and endpoint

Translation text is sent to `https://translate.googleapis.com/translate_a/single` using the public `gtx` endpoint. This is not an official guaranteed Google Cloud Translation API; Google may throttle, change or discontinue it. Do not submit sensitive information.

History and website exclusions are stored locally using Chrome local storage. They are not sent to Blue Bridge servers. Target language and typing mode continue to use Chrome sync storage as in the original release.

## Shortcuts and browser restrictions

Chrome controls shortcut availability and may require the user to assign a different key combination. The extension cannot operate on Chrome internal pages (`chrome://`), the Chrome Web Store, and some protected PDF or browser pages. If a shortcut is unavailable, use the popup or right-click selection menu.
