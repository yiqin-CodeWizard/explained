# Curiosity Club

The implemented Explained product site. It introduces the extension and provides dedicated download, practice, help, guides and version pages. The selected design comes from prototype C; production has no prototype switcher or simulated setup.

## Develop

```sh
npm run dev:site
```

Open `http://127.0.0.1:4174/`. This builds the site and starts a static server. Re-run the build after editing source; the server serves the current `_site/` contents. The existing prototype remains separately available with `npm run prototype`.

```sh
npm run build:site
npm run test:site
npm run check
npm test
npm run test:ui
```

Node 22+ and Python 3.9+ build the site without extra runtime dependencies. Browser tests use the repository's Playwright dependency and its Chromium installation. Set `CHROME_EXECUTABLE_PATH` to use an existing compatible executable.

## Source and behavior

- `content.json`: English, Simplified Chinese and Traditional Chinese copy plus three adapted short research readings, translated Chinese editions and original-source links. Mixed reading uses English prose with Chinese term labels and Chinese sample explanations.
- `pages.json`: page routes and available languages.
- `pages/copy.json`: localized page labels and SEO metadata.
- `pages/documents.json`: help and guide content; each section has a stable anchor and real related links.
- `render.cjs`: shared document shell, navigation, language links, metadata and URL generation.
- `sections.cjs`: reusable product, installation and reading sections.
- Home, `/download/` and `/try/` are generated for English, Simplified Chinese, Traditional Chinese and Mixed. Mixed pages use noindex and are excluded from the sitemap. Help is available in English, Simplified Chinese and Traditional Chinese. The guide index, API setup tutorial, research-reading and context tutorials, and versions/manual-update page are available in English and Simplified Chinese. Missing translations are explicitly labeled as English.
- `assets/site.css`: the Curiosity Club design, responsive layouts, keyboard focus and reduced-motion support.
- `assets/site.js`: article switching, language-link state and the installation dialog. It does not detect installation, communicate with the extension, store preferences, or contact DeepSeek.
- `PUBLIC-README.md`: the public landing repository's introduction, including why Explained was created and a link to the open-source repository; copied to `_site/README.md` during the build.
- `privacy-policy.md`: authoritative common policy for Explained, Explained Yellow, extension-wasm-offline and the public site. It explicitly distinguishes the computation routes and permissions.
- `../tools/sync-privacy.cjs`: copies that policy to root PRIVACY.md and each duplicate's bundled policy, avoiding version drift.
- `../tools/build-site.cjs`: synchronizes and renders the policy into privacy.html and PRIVACY.md, renders the registered pages in each available language, copies assets and creates crawler metadata. It packages the API edition selected by config.json downloadEdition using tools/package-wasm-offline.py and includes its ZIP and matching checksum.

The generated `_site/` directory is ignored by Git. It contains only public site files and the intended extension download, not the source checkout, prototypes or validation evidence. The default download is `extension-wasm-offline-v0.2.1.zip`; its name and version come from `extension-wasm-offline/manifest.json`. The ZIP contains `manifest.json` at its root. The API edition requires a user-provided DeepSeek API key and bills calls to that account.

Without JavaScript, all three articles, native language links, privacy information, installation instructions and downloads remain usable. JavaScript narrows the article area to one selection. The home page embeds the full sidebar-and-article experience; `/try/` provides a dedicated entry to the same reading component and content. The practice articles have no built-in term-preview buttons; the separate how-it-works section retains its labeled illustrative example. The installed reader handles text selection independently.

On `/try/`, `?topic=drug-development|scientific-understanding|deepseek-v4` selects an article. Both the home page and `/try/` accept topic and welcome state. Old home-page links select the article in place without redirecting. `?entry=welcome#practice` displays the post-setup guidance and focuses it. Language navigation preserves article and welcome state. This query string is a presentation hint, not proof of installation or permission to make a lookup.

The real extension's local setup still records consent. Start exploring opens the corresponding language edition at the practice section without contacting DeepSeek. Published ZIPs are pinned by downloadSha256; changed extension files require a new approved release. A live explanation uses the extension toolbar's language setting, independently of the page's reading language. After highlighting, click the selection icon or use Ctrl+X (⌘X on Mac); selection and copying alone never send a lookup.

## GitHub Pages

Production: `https://www.utopia-ft.com/`. The former GitHub Pages URL is retained in `config.json` as a legacy entry for already-published extension packages.

The owner selected a separate public repository, `yiqin-CodeWizard/explained-site`, because their plan does not enable Pages on the private `explained` repository. The source repository `yiqin-CodeWizard/explained` is now open source under MIT. The public repository contains the generated `_site/` files, a short README, public policies and the intended extension download.

Pages publishes **main → / (root)** using **Deploy from a branch**. GitHub's built-in `pages-build-deployment` workflow handles the deployment; the local source workflow only builds and validates an artifact. No cross-repository token or automatic source sync is configured.

For updates:

1. Set `config.json` url to the deployed base URL. For this custom domain it is the host root, without `/explained-site/`. `customDomain` generates the CNAME file. Published ZIPs retain their original Welcome URLs and checksums; update Welcome only in a newly versioned extension release. Edit privacy wording only in `privacy-policy.md`, run `node tools/sync-privacy.cjs`, and repackage only changed releases.
2. Run `npm run test:site` and the relevant extension checks. This rebuilds `_site/`, including its version-matched ZIP and checksum. Repackage the yellow duplicate separately with `python3 tools/package-yellow.py` if its source changes; it remains an independent edition and is not the site's default download.
3. Publish the generated contents of `_site/` to the root of the public `explained-site` repository, including its generated README. Publish no source checkout, local settings, prototypes or validation evidence to this generated-site repository.
4. Wait for `pages-build-deployment` to succeed, then verify the live pages and the downloadable ZIP against its checksum.

The 2026-10-22 publication changed only the welcome destination in both extension editions. Their themes remain separate. Previously distributed ZIPs retain their old welcome URL; use the rebuilt package for the live destination.
