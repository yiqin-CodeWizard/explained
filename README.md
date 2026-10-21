# Explained

**Highlight a phrase. Understand it in context. Keep reading.**

Explained is a Chrome extension that brings a small explanation card to the text you select. Ask for recent news when you want to follow the subject further. It uses your own signed-in DeepSeek website session; no official paid API key is required.

**Status: experimental preview, v0.1.0.** The website integration uses an undocumented interface and can break. Live News citation mapping and this build’s installed-account behavior still need validation. Explained is an independent project, with no affiliation with DeepSeek or Google.

![Explained beside a selection in a sample article](docs/images/reading-note.png)

*UI demonstration with a synthetic answer. This is not a live DeepSeek result or a latency measurement.*

## What it does

- Opens an explanation beside a finished text selection, with progressive answers and optional expansion.
- Uses nearby sentences to distinguish meanings; context sharing can be switched off.
- Searches for up to three developments from the previous 30 days. News links appear only when returned URLs match recognized structured search metadata; unmatched stories are labeled unverified.
- Offers three reading layouts: a compact note, split card, and reading margin.
- Supports English, Simplified Chinese, and Traditional Chinese answers.
- Saves language/layout preferences and supports global or per-site pause.
- Cancels superseded requests so older answers cannot overwrite a new selection.

Normal HTML webpages in the top frame are supported. Browser pages, restricted store pages, PDFs, input fields, and document editors are outside this preview’s scope. Chrome 114+ is required; other browsers have not been verified.

## Install in Chrome

1. Download this repository using **Code → Download ZIP**, or clone it:

   ```sh
   git clone https://github.com/yiqin-CodeWizard/explained.git
   ```

2. Extract the ZIP if needed. In `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the **explained-extension** folder containing `manifest.json`.
3. Pin Explained in Chrome’s Extensions menu. Open the toolbar panel, read the sharing notice, and choose **Enable lookups**.
4. Select **Open / sign in**, and sign in normally in the dedicated DeepSeek tab. Leave that tab open; it can stay in the background.
5. Refresh an existing reading page, then highlight a word or short phrase. Choose **News** in the card to search on demand.

No build step is required. For updates, replace the source, reload the extension, refresh reading pages, and close the old dedicated connection tab. Detailed controls and troubleshooting are in the [extension guide](explained-extension/README.md).

## Data and connection

Explained sends your selected phrase and, when enabled, up to 600 characters of nearby context to DeepSeek. The card exposes the context used. DeepSeek may retain the resulting chats. Explained stores preferences locally and keeps a temporary connection-tab ID; it does not persist lookup history or export your login credentials.

Automatic highlighting requires permission to run on HTTP/HTTPS pages. You can pause a site or restrict site access using Chrome’s extension settings. See [PRIVACY.md](PRIVACY.md) for the data flow and permissions.

This preview uses the website’s internal POST/SSE interface and downloads the site’s official proof-of-work WASM at runtime. It does not bypass sign-in, interactive verification or rate-limit rejection, retry rejected requests automatically, or fall back to website UI submission.

Public distribution needs a separate review of [DeepSeek’s terms](https://cdn.deepseek.com/policies/en-US/deepseek-terms-of-use.html?locale=de) and [Chrome’s remote-code/WASM policy](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code). A source-code license does not grant rights to a third-party service. This repository is not a claim of Chrome Web Store eligibility.

## Develop and test

Requirements: Node.js 22+ and Python 3.9+ for development tooling. The loaded extension has no npm dependencies.

```sh
npm ci
npm test
npx playwright install chromium
npm run test:ui
npm run package
```

For an existing Chrome executable, set `CHROME_EXECUTABLE_PATH` when running the UI test. Otherwise, Playwright uses its managed Chromium.

Edit `explained-extension/reader.css` for card styles. Packaging regenerates `reader-styles.js`, validates resources, and creates `explained-v0.1.0.zip` with a SHA-256 checksum. ZIP files and local validation output are ignored by Git.

The test suite includes 14 contract/bridge tests and 23 browser UI checks. All use controlled responses. The browser test runs the shipped UI scripts on localhost in a temporary profile; it does not install the extension or access an authenticated DeepSeek account. See [validation details](docs/VALIDATION.md) for evidence and remaining live checks.

## Contribute

Bug reports, accessibility improvements, website compatibility fixes and tests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md). Never include account credentials, authentication headers or raw private chats in an issue or pull request.

See [the roadmap](docs/ROADMAP.md) and [changelog](CHANGELOG.md) for the current scope. [Security concerns](SECURITY.md) should be reported privately.

## License

[MIT](LICENSE) for the code and project-authored assets. DeepSeek’s service, names, and remotely loaded assets remain subject to their own terms; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
