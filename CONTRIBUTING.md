# Contributing

Use an issue to describe a reproducible bug or a focused improvement. Mention Chrome and extension versions and whether it affects Explain or News. A public page URL is useful when it contains no private information. For a privacy or security concern, use [SECURITY.md](SECURITY.md).

Never attach cookies, session values, authorization headers, work proofs, account exports, raw network dumps or private conversation text. Error codes and sanitized steps are enough to start a report.

## Local setup

```sh
npm ci
npm test
npm run check
npx playwright install chromium
npm run test:ui
npm run package
```

Node.js 22+ and Python 3.9+ are needed for tooling. The extension loads without npm or a build step. Set `CHROME_EXECUTABLE_PATH` to test an existing browser. Edit `reader.css`, then package to regenerate its embedded copy. Generated ZIPs and validation output remain local.

## Pull requests

Keep changes focused. Explain the user-visible behavior and the checks you ran. Add meaningful regression coverage for request coordination or decoding changes. Include a synthetic screenshot for UI changes, labeled as synthetic. Record manual-account checks separately from mock tests.

Preserve the privacy and connection boundaries: no credential export, authentication/verification bypass, retry of rejected completions, hidden route fallback, account sharing or invented source links. Discuss distribution assumptions in light of website terms and Chrome policies.

By submitting a contribution, you agree to license it under the repository’s MIT license and confirm that you have the right to submit it. Disclose any third-party code and its license. No contributor license agreement is required.
