# Validation

Version 0.1.5, 2026-10-22.

The implementation passed JavaScript syntax/resource checks, 25 Node contract/bridge/decoder tests and 62 controlled browser UI checks. The UI test uses the shipped scripts on localhost in a temporary profile with synthetic replies. It checks consent, bounded/rendered context, hidden/editable exclusion, expansion, News parsing and source-link matching, layouts A/B/C, 375 px viewport, site pause, stale results, cached view switching, connection errors and toolbar preferences.

Privacy and interaction checks cover no card or request before setup or toolbar opt-in, no submission from enabling itself, automatic Explain on highlighting, immediate News on mode selection without an extra button, keyboard mode switching with cached results, global and per-site pause, mouse and keyboard buttons in layouts A/B/C, failed connection opening, no continuation after returning to the page, explicit Retry, page refresh after an extension reload, and small-screen Traditional Chinese recovery. First-install tests check a local popup only on install, tab fallback, no repeat on update, explicit enabling, skipping without consent, save failure recovery, keyboard focus, no connection requests during setup, and small-window layout. Actual extension installation remains a manual check. Decoder tests cover delayed SEARCH results, batched patches, citation IDs, and URL filtering.

The bridge tests simulate session/challenge/completion responses, a solver worker, split Chinese UTF-8 and SSE framing, HTTP/authentication failures and cancellation. They check that credential/session/proof values do not enter relayed extension events. They do not independently validate the remote solver binary or a real server challenge.

## Remaining live checks

The current package has not been independently tested against an authenticated account. An earlier connection prototype received qualitative user feedback that it was fast; this is not a reproducible speed measurement for this release.

- Install with no saved preferences. Confirm highlighting is silent before setup or toolbar opt-in. After enabling, confirm each new selection starts Explain automatically, and switching to News starts search with no additional confirmation. Verify pause prevents both. Open DeepSeek and return; nothing should submit until Retry.
- Verify the actual website route in both guest and account sessions where available. Synthetic missing-token success does not prove live guest compatibility.
- Test cold and warm Explain, with DeepSeek in the background.
- Test News on a current subject; compare each returned event date, summary and linked source. Current structured metadata and semantic story/source correspondence still need live validation.
- Change selection during loading, dismiss the card and switch modes. No outdated answer should reappear.
- Toggle global/site pause, language and context sharing.
- Close/reload the connection tab, expire the login and discard/wake the tab. Check explicit recovery and interruption messages.
- Refresh reading pages after reloading the extension.

Browser extension installation/reloading, real discard recovery, source quality, latency and non-Chrome compatibility are not proved by the synthetic tests. Screenshot assets are explicitly illustrative.
