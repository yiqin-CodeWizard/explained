# Changelog

## 0.1.3 — 2026-10-21

- Keep enabling lookups in the toolbar; highlighting before opt-in is silent.
- Require an explicit Explain selection or Search news action for each new selection. Enabling and switching modes do not submit text.
- Remove automatic continuation on return from DeepSeek and use neutral Open DeepSeek / Retry wording.
- Remove account-presence prechecks; send existing same-origin credentials when available and let the website accept or reject the request.
- Clear selected text and context on dismissal and update privacy guidance.

## 0.1.2 — 2026-10-21

- Complete first-use setup from the highlight card; enabling in the toolbar also continues an open card.
- Preserve the selected phrase while opening DeepSeek and resume it once on return after sign-in.
- Keep Open DeepSeek responsive during connection startup, show open failures, and offer a page refresh when the extension was reloaded.
- Improve mouse/keyboard button interaction, setup copy and small-screen actions in all card layouts.
- Combine toolbar consent and connection setup into one action.

## 0.1.1 — 2026-10-21

- Decode SEARCH fragments and delayed search-result patches, including batched updates and TOOL_OPEN results.
- Preserve search citation IDs through the bridge and match story citations to their structured source URLs.
- Add decoder, bridge, matching and browser regression coverage for missing News links.

## 0.1.0 — 2026-10-21

Experimental first reading-extension preview.

- Automatic selection capture and bounded, visible context extraction on ordinary webpages.
- Explain streaming, optional expansion, and on-demand News.
- Structured-source matching with explicit unverified and parsing states.
- Compact note, split card and margin layouts.
- Saved toolbar preferences, three answer languages, global/site pause and context control.
- Dedicated connection tab reuse, recovery, request supersession and cancellation.
- Consent notice, hidden/editable text exclusions and local-only preferences.
- Contract/bridge tests, synthetic browser UI tests, packaging and GitHub CI preparation.

The website route derives from bridge 0.0.4. It is undocumented, depends on a remote official solver asset, and has not been independently verified with an authenticated account in this build. No store approval or latency claim is made.
