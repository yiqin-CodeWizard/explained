# Explained 0.1.4

A personal-use Chrome extension that explains highlighted webpage text through the DeepSeek website in your browser. This combines the direct POST connection from bridge 0.0.4 with the reading experience and toolbar panel from the two handoffs. No official paid model API, build step, or runtime dependency installation is needed.

## Install / update

1. Unzip `explained-v0.1.4.zip` if using the packaged download.
2. In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select **explained-extension**, the folder containing this file and `manifest.json`.
3. If you previously installed **Highlight · DeepSeek bridge prototype**, disable it to avoid confusion. It is a separate connection harness.
4. On first install, a local welcome window opens automatically. Read the sharing notice, choose nearby context, and select **Enable lookups**. The **You’re all set** screen shows how to try it. **Maybe later** closes setup without enabling. Setup never opens DeepSeek or submits text. If a window cannot open, the same setup appears in a local tab; updates do not reopen it. The toolbar remains available for later enabling and preferences.
5. Refresh already-open reading pages, then highlight a phrase. The preview stays on the page until you choose **Explain selection**. Review nearby context or turn it off in the toolbar before sending.
6. For news, choose **News**, then **Search news**. Open DeepSeek and Retry are separate explicit actions if the connection needs attention. Returning to the reading page never resubmits. Keep the DeepSeek tab open while answering; it can stay in the background.

For later file updates, use **Reload** on the extension’s card in `chrome://extensions`, then refresh reading pages and close the old dedicated DeepSeek tab so a fresh helper environment can be created. Installation and reloading are manual; the agent did not operate Chrome’s protected extension manager.

## Reading and toolbar controls

- **Explain:** progressive plain-text answer, two short sentences by default. **Explain a little more** requests a fuller answer with an example; **Keep it short** restores the concise answer.
- **News:** live-search request for up to three distinct developments with event dates in the last 30 days. Exact duplicate summaries and out-of-window or invalid dates are filtered. Distinct-event deduplication also relies on the model’s requested behavior.
- **Sources:** a story gets a clickable source only when its returned URL or explicit search citation number matches recognized structured search metadata. SEARCH, TOOL_SEARCH and TOOL_OPEN sources are decoded from both snapshots and incremental result patches. Unmatched stories are explicitly marked unverified. Unparseable News responses retain their text, and search sources are shown separately without claiming per-story correspondence. Model prose URLs never become source links by themselves.
- **Setup and recovery:** only the welcome setup or toolbar can enable lookups. Highlighting, mode changes, enabling, and returning from DeepSeek never send text. **Explain selection**, **Search news**, expansion and **Retry** are explicit submission actions. Open DeepSeek stays responsive during connection startup. A reloaded extension offers **Refresh page**.
- **Dismiss:** Escape, the close button, or a click outside. Dismissal aborts the current lookup. A new selection supersedes the previous request; outdated events are ignored.
- **Toolbar:** On / Paused, answer language, context sharing, current-site pause, session presence, and General coverage. Changes save locally. Language choices are English, Simplified Chinese and Traditional Chinese.
- **Reading layout & connection details:** choose A (compact note, default), B (split card), or C (reading margin). All three preserve the prototype design. The default is an implementation choice, not a claim that a layout winner was approved.
- **Context used:** inspect what surrounding context is sent. The selection and approximately one sentence on each side are bounded to 600 context characters. Turning context off sends only the selected phrase.

Changing the answer language or context setting stops the current lookup and offers Retry, so an answer from the previous setting cannot appear under the new setting. Explain/News responses are cached only within the current open selection. Closing the card clears them.

Normal HTTP/HTTPS HTML pages in the top frame are supported. Input fields, editable regions, hidden text, PDFs, document editors, browser pages and restricted store pages are excluded or unsupported. Selections longer than 500 characters are ignored. Some site-level CSS, customized editors or browser restrictions may require site-specific support later. Edge and other browsers have not been tested.

## Connection lifecycle and privacy

The extension creates a dedicated background DeepSeek tab only when needed and retains its ID in `chrome.storage.session` across service-worker suspension. Closing it causes the next lookup to create a new tab. A discarded tab is reloaded on demand. Closing, reloading or navigating that tab during a lookup interrupts the answer and offers an explicit retry.

Only one request runs across the extension at a time. A newer selection cancels an older request, including selections in another tab. An orphaned page request after a service-worker restart is aborted before another submission. A heartbeat runs only during an active lookup; request deadlines bound interrupted sessions. No rejected completion POST is automatically retried and no UI-submission fallback is present.

**Website connection ready** means the extension bridge is loaded. An account-presence check does not block requests; existing same-origin website credentials are used when available. The website decides whether this browser session can perform a request. Live guest-session compatibility with this undocumented route remains unverified.

The selected phrase and optional context go to DeepSeek, which may retain chats. Explained stores only preferences and a temporary connection-tab ID. It does not save lookup history or export account tokens, cookies, proofs, or chat-session IDs. Account credentials remain inside the DeepSeek page and are used only in same-origin requests. No analytics or external font service is included.

Automatic selection capture needs access to HTTP/HTTPS webpages. The manifest declares that scope plus `storage`; it requests no cookies, browsing history, debugger, or native-messaging permission. Pause is an application control, not revocation of Chrome’s site permission. Chrome’s extension site-access settings can restrict where the extension runs.

The direct route uses the website’s undocumented session/challenge/completion contract and its official remote proof-of-work WASM asset. Website changes can break it. This package is for unpacked personal testing; it is **not represented as Chrome Web Store ready**. Distribution would require separate terms, remote-code/WASM policy and licensing review. No model-version identity or latency guarantee is asserted.

## What was verified

On 2026-10-21:

- All shipped JavaScript passed syntax checks.
- 25 contract/bridge/decoder tests passed: same-origin request chain, split Chinese UTF-8/SSE, search/thinking flags, source relaying, no credential/session/proof leakage in relay events, missing-token handling and 401/403 failures, cancellation, supersession, dismissal/navigation during startup, connection reuse/recreation and orphan recovery.
- Browser UI tests ran the actual card and popup scripts on localhost with a mocked Chrome transport and synthetic answers. They covered consent, rendered context and hidden-text exclusion, expansion, cached view switching, structured-only source links, unverified-story messaging, layouts A/B/C, 375 px viewport positioning, site pause, editable exclusion, stale results, connection errors, saved toolbar controls, and no browser JavaScript errors. See the repository’s `docs/VALIDATION.md` for the validation boundary; running the browser test generates local screenshots and results in `validation/`.

These tests did **not** install this build into the user’s Chrome profile or call an authenticated live DeepSeek account. Earlier personal tests of the 0.0.4 route provided qualitative feedback that it was fast, without reproducible stage timings or verified per-story News citations. This release inherits that connection code, with new orchestration and cancellation. Live Explain, News schema/citation mapping, cold/warm timing, login expiry and browser discard recovery still need the installed-build checks below.

## Installed-build check

1. With no saved preferences, highlight before opening the toolbar: no card or request should appear. Enable in the toolbar: nothing should be submitted. Highlight again, inspect the preview, and choose **Explain selection**. Open DeepSeek if needed; returning must not submit until **Retry** is chosen.
2. Switch News on a current, well-covered subject. Open each source and compare event date, subject and summary. An unverified warning is expected when the stream exposes no matching structured source.
3. Highlight another phrase before the first answer completes. Only the new phrase should receive a result. Dismiss during loading; no late answer should reopen the card.
4. Change language and context sharing; Retry. Pause globally and per site; selections should stop opening cards.
5. Close the connection tab during a lookup. Confirm an interruption message. Open DeepSeek, return, and retry explicitly.
6. After an extension reload, refresh the reading page and create a fresh connection tab. Check the small viewport and all three layouts if needed.

## Files

`background.js` coordinates tabs and requests; `reader.js` captures selections and renders the isolated card; `reader.css` is the editable card stylesheet, mirrored into `reader-styles.js`; `popup.*` provides toolbar settings; `shared.js` contains pure contracts, prompts and News parsing; `website-bridge.js` relays bounded messages; `direct-client.js` and `stream-decoder.js` provide the site-local POST/SSE route. Icons are local PNGs.

Chrome references: [service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle), [message passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging), [remote-hosted code](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code).
