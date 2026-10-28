# Chrome Web Store readiness: API edition 0.2.0

Inspected 2026-10-28 (Asia/Shanghai). Verdict: **not fully prepared for public launch**. The package and controlled integration tests pass, but public privacy/submission materials are stale or absent locally, live service acceptance is unverified, and two implementation concerns remain.

This assessment covers `extension-wasm-offline-v0.2.0.zip`, both matching source folders, release scripts/tests, the live privacy page and Chrome's published requirements. It does not establish the state of the signed-in Chrome Web Store dashboard. No extension source was changed, no real key was used, and nothing was submitted or published.

Follow-up on 2026-10-28: at the user's request, the public policy was revised to cover the official API edition alongside the explicitly identified legacy versions. The updated `privacy.html` and `PRIVACY.md` were published to `yiqin-CodeWizard/explained-site` in commit `f68f39a71551808a01745c4703e80537acc32486`; the existing site suite passed all 83 checks. The privacy finding below records the original inspection state. Credential storage and extension runtime behavior were not changed by this policy update. Deployment verification is recorded separately in `validation/publishing/privacy-api-v0.2.0-verification.json`.

## Verified release foundations

- ZIP: 48,039 bytes, 25 files, `manifest.json` at archive root, version 0.2.0, valid archive. SHA-256: `8ff6d54c3e68512243d2081f249037350d5faf0207a6c2e9bb66a248890ea6b2`; matches the supplied checksum.
- Every ZIP file exactly matches both `extension-wasm-offline/` and `extension-wasm-offline-v0.2.0/`; neither folder has missing or additional files relative to the archive.
- Manifest V3, required local resources and 16/32/48/128 icon files exist. All extension JavaScript passes syntax checks; embedded reader CSS matches its source.
- Official HTTPS DeepSeek model/Search calls replace the earlier website session, offscreen document and vendor WASM. No downloaded executable-code path was found in this package. AI responses are handled as data.
- Welcome discloses text/context sharing, API-key use and billing, and requires an explicit enable action. Selecting/copying alone does not send a lookup. Context can be disabled; global/site pause controls exist.
- API key storage is restricted to trusted extension contexts. The browser test confirms content scripts cannot read the key or observe secret storage changes. Keys are not put in model prompts or reader messages.
- Fresh `npm test`: **40/40 passed**, including **15 tests for this API edition**. The other 25 concern the original edition.
- Fresh `node tests/wasm-offline-browser.cjs`: **passed** using a temporary real Chromium MV3 installation with synthetic API replies. Covered setup, explanation, searched expansion, cached short answer, News, failure/retry, cancellation, layouts A/B/C, context off, keyboard trigger, native Cut in editors and key isolation. Unexpected requests and page errors were empty. The test adds a storage-probe content script to a temporary copy; it does not upload anything.
- Live documentation confirms the configured `deepseek-flash` name and Search endpoint/request shape exist. This is documentation verification, not live account acceptance.

The prior WASM redistribution concern does not carry over to this package: the vendor binary is absent. Older readiness documents describe a different release.

## Submission materials to complete

### 1. Publish an accurate 0.2.0 privacy-policy URL

The existing public [privacy page](https://yiqin-codewizard.github.io/explained-site/privacy.html) returned HTTP 200 during this inspection, but explicitly covers 0.1.5. It says the extension never asks for an API key, stores no credentials, uses a DeepSeek website session and offscreen WASM, and automatically submits on highlighting. These statements do not describe 0.2.0. The bundled `PRIVACY.md`/`privacy.html` are updated, but a packaged page alone does not supply a public policy URL for the dashboard.

Publish a separate API-edition policy or update the shared policy with clear version boundaries. Include key storage, selected content and optional context, Search/model recipients, network metadata, local URL/hostname and interaction processing, retention/deletion, controls/contact and the required Limited Use statement. The new bundled policy lacks that explicit statement; the old public policy has it but excludes this release by its version scope.

References: [privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy), [user-data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), [program policies](https://developer.chrome.com/docs/webstore/program-policies/policies).

### 2. Prepare current store screenshots and listing copy

No 1280×800 or 640×400 PNG screenshots were found in the inspected project image folders. Existing `validation/api` screenshots demonstrate controlled fixtures rather than final store presentation. Prepare at least one correctly sized, accurate screenshot showing the actual core experience.

Correcting the older local checklist: **440×280 promotional art is optional**, not a launch requirement. Chrome currently identifies the store icon and at least one screenshot as mandatory. See [image requirements](https://developer.chrome.com/docs/webstore/images).

The manifest still names the product `extension-wasm-offline`, although no WASM remains and all AI features require network access. Prefer a clear public name such as “Explained — Reading Companion”; otherwise prominently explain the internet/API-key requirement. This is a misleading-name risk, not a confirmed rejection. Disclose that DeepSeek API usage is billed to the user's account and that this is an independent project.

### 3. Rewrite declarations and reviewer instructions for this release

`docs/CHROME-WEB-STORE-DECLARATIONS.md` targets 0.1.5: it describes automatic selection submission, website tokens, connection-tab session storage, offscreen permission and WASM. Do not paste it into the dashboard for 0.2.0.

Prepare accurate single-purpose, storage/site-access, data-use and no-remote-code declarations. Website content and API authentication are handled even though the developer operates no server. Broad HTTP/HTTPS access has a cross-site reading purpose; it is not automatically prohibited, but must be justified. Provide reviewer steps and a practical, restricted test-access arrangement for the API-dependent features through the dashboard's private test-instructions facility. Do not bundle a key in the extension or publish it in listing text. See [test instructions](https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions).

## Implementation and release risks

### 4. Persistent API-key protection needs a release decision

`background.js:115` saves the raw API key in `chrome.storage.local`. `setAccessLevel(TRUSTED_CONTEXTS)` is valuable access control, but does not encrypt the stored credential. The bundled policy acknowledges this. A person/process able to read the browser profile can obtain a billable credential.

Chrome's [user-data FAQ, question 9](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) calls for strong encryption at rest; its [storage documentation](https://developer.chrome.com/docs/extensions/reference/api/storage) points sensitive-data use toward session storage. Resolve this before treating the release as fully prepared: for example, keep the key only in trusted session storage, or implement an encrypted, user-unlocked persistent vault. A decryption key stored alongside the ciphertext does not meaningfully solve profile disclosure. This assessment is a security/policy concern, not evidence of an actual leak or a received store rejection.

### 5. News verifies links and date syntax, not supporting event dates

`shared.js:65–102` discards source dates when constructing its verification map. It checks that a model-generated story date is valid and recent and that a cited URL exists among search results, but does not establish that the cited evidence supports that event/date.

A direct probe accepted a story dated 2026-10-28 citing either an undated result or a result dated 2020-01-01. Search's requested date filter reduces exposure but does not make this validator enforce the claim. The error text “matched to dated search sources” and validation language overstate what is verified. Preserve/evaluate source-date evidence where appropriate, distinguish publication dates from event dates, and present uncertainty accurately. This is a product-correctness concern rather than a standalone proven store-policy violation.

### 6. Live acceptance remains unverified

All automated network replies are synthetic, as `VALIDATION.md` accurately states. Before release, install the final ZIP and check a real account's key/model access, ordinary explanation, Search, searched expansion, News citations/dates, insufficient-balance handling, reconnection and cancellation. Provide a reproducible reviewer path. Paid calls were not made during this inspection.

Chrome 114 compatibility and long browser sleep/resume remain unproven. Test the stated minimum version or adjust the supported minimum based on evidence. Chrome does not mandate a particular automated test count or every hardware platform.

CI runs the API unit suite through `npm test`, but browser UI validation and package artifacts still default to the original edition. Adding an API-edition browser/package job is recommended release hygiene, not a store requirement.

## Dashboard state: unknown

Developer registration/payment, two-step verification, contact email, actual listing fields/assets, privacy declarations, reviewer access, distribution and any previous item's version number were not inspected. Verify them in the dashboard; “unknown” is not a claim they are missing. Two-step verification is required by [Chrome's policies](https://developer.chrome.com/docs/webstore/program-policies/policies).

Recommended release gate: publish the correct policy; resolve key persistence; correct News verification/disclosures; prepare listing assets and 0.2.0 declarations; complete final-ZIP live acceptance; verify dashboard requirements, then submit for review.
