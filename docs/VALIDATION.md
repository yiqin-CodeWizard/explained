# Validation

Version 0.1.0, 2026-10-21.

The implementation passed JavaScript syntax/resource checks, 14 Node contract/bridge tests and 23 controlled browser UI checks. The UI test uses the shipped scripts on localhost in a temporary profile with synthetic replies. It checks consent, bounded/rendered context, hidden/editable exclusion, expansion, News parsing and source-link matching, layouts A/B/C, 375 px viewport, site pause, stale results, cached view switching, login errors and toolbar preferences.

The bridge tests simulate session/challenge/completion responses, a solver worker, split Chinese UTF-8 and SSE framing, HTTP/authentication failures and cancellation. They check that credential/session/proof values do not enter relayed extension events. They do not independently validate the remote solver binary or a real server challenge.

## Remaining live checks

The current package has not been independently tested against an authenticated account. An earlier connection prototype received qualitative user feedback that it was fast; this is not a reproducible speed measurement for this release.

- Install the unpacked directory, enable lookups and sign in normally.
- Test cold and warm Explain, with DeepSeek in the background.
- Test News on a current subject; compare each returned event date, summary and linked source. Current structured metadata and semantic story/source correspondence still need live validation.
- Change selection during loading, dismiss the card and switch modes. No outdated answer should reappear.
- Toggle global/site pause, language and context sharing.
- Close/reload the connection tab, expire the login and discard/wake the tab. Check explicit recovery and interruption messages.
- Refresh reading pages after reloading the extension.

Browser extension installation/reloading, real discard recovery, source quality, latency and non-Chrome compatibility are not proved by the synthetic tests. Screenshot assets are explicitly illustrative.
