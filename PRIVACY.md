# Privacy and permissions

Updated 2026-10-22 for version 0.1.5.

## Data flow

Lookups must first be explicitly enabled in the local welcome setup or toolbar. The welcome window opens on first install and may be skipped without enabling anything. Once enabled, completing a supported text selection automatically sends the selected phrase and optional context through the extension to a dedicated DeepSeek tab for Explain. Switching to News starts a search immediately; switching back reuses a completed answer where available. Enabling itself, opening DeepSeek, and returning to the reading page do not submit text. DeepSeek returns the answer and, for News, any search metadata it exposes. Results are displayed beside the selection.

The selected phrase is limited to 500 characters. Surrounding context is limited to 600 characters and aims to include the containing sentence and one adjacent sentence on each side. You can inspect it with **Context used** and disable sharing before highlighting using the toolbar. Input fields, editable regions and hidden text are excluded where the supported page structure identifies them. Unusual editors or custom page structures may be unsupported.

No lookup is sent before the sharing notice is accepted. News is requested when you switch to the News tab. The implementation sends the selected text and optional context to DeepSeek; it does not send the full reading page, reading-page URL, browsing history or a cookie export as prompt fields to a developer-operated service.

## Where data is stored

| Data | Location and lifetime |
| --- | --- |
| Language, layout, enabled state, context setting, consent and paused hostnames | Chrome local extension storage, until changed or the extension is removed |
| Dedicated connection-tab ID | Chrome session extension storage; not persisted across browser restarts |
| Current phrase, context and responses | Memory while the reading card is open; closing clears the phrase, context and response cache |
| Login credentials, website cookies and the site’s session value | DeepSeek’s own browser context; not exported to extension events, source packages or reports |
| Submitted prompts and resulting chats | DeepSeek’s service, subject to its own retention and privacy settings |

Explained includes no analytics, advertising or developer-operated backend. Each Chrome profile uses its own website context. Removing Explained does not delete chats held by DeepSeek.

## Permissions and requests

- **HTTP/HTTPS site access:** detects selections and displays the card on ordinary pages. Pause stops selection cards and lookups; it does not revoke Chrome’s permission. Chrome’s site-access settings can restrict that permission.
- **storage:** saves preferences and the temporary connection-tab ID.
- **DeepSeek website requests:** session creation, a fresh work challenge and completion, all from the website page to its own origin. Requests do not redirect authentication to another host.
- **Official solver asset:** a public WASM asset is loaded from DeepSeek’s site or its official static host. Static downloads omit credentials. This is a separate distribution-policy consideration documented in the README.

The manifest does not request cookie export, browsing history, debugger or native-messaging permissions. DeepSeek’s page may independently make its normal website requests.

## Your controls

Pause globally, pause a hostname, disable context, close the card to cancel, restrict extension site access, or remove the extension. Pausing does not delete existing DeepSeek conversations. Pause lookups globally or for the current site before selecting sensitive content you do not want sent to DeepSeek. You can also turn context sharing off before highlighting.

Third-party handling is described in [DeepSeek’s privacy policy](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html). Report privacy-related defects through [SECURITY.md](SECURITY.md).
