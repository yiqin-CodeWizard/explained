# extension-wasm-offline — privacy (v0.2.1)

This variant uses official DeepSeek APIs with a key supplied by each user. The developer operates no lookup server. No DeepSeek website login, connection tab or proof-of-work module is used.

## What is sent

Selecting or copying alone sends nothing. Clicking the selection icon or pressing Ctrl+X (⌘X on Mac) on supported reading text sends the selected text (up to 500 characters) to DeepSeek. If enabled, up to 600 nearby characters provide context. Turning context off sends only the selection.

Ordinary explanations call the model API. News, time-sensitive selections and “Explain a little more” also call DeepSeek Search. Search evidence is passed to the model for summarization. News asks for developments from the past 30 days. Check displayed dates and original sources.

Welcome verifies the supplied key using DeepSeek's model-list API. Verification does not send reading text or create a paid model/search lookup. Subsequent API calls are billed to the user's DeepSeek account.

## What is stored

The API key is held only in Chrome's in-memory extension session storage, restricted to trusted extension contexts. It is not written to local or sync storage. Only the background reads it for requests to https://api.deepseek.com; Welcome and the toolbar receive a status, and reading-page scripts receive sanitized settings without credentials. A suspended background worker can reuse the current session key. Restarting Chrome or disabling, reloading or updating the extension clears it, so it must be entered again. This version deletes a legacy local-storage key on each background initialization without adopting it; removing that entry does not guarantee forensic erasure of old profiles or backups. Revoke an old key through DeepSeek if necessary.

Consent and preferences remain in local extension storage, restricted to trusted extension contexts and not synced. Pausing retains the current session key. API settings can replace it. Clearing session storage removes it without revoking it at DeepSeek.

Answers and sources are held in memory for the current card and cleared on close/navigation. The developer stores no lookup history, reading text, analytics, advertising identifiers or credentials.

## Controls and permissions

Use Welcome/API settings to replace the key. Use the toolbar to pause globally, pause a site, or disable nearby context. Removing the extension removes its local storage. Restrict website access in Chrome if desired; reading-page access is required to obtain a selection, nearby text and show the answer card. The extension does not request clipboard access or intercept Cut in editors.

## External services

DeepSeek receives submitted text, search queries, authentication and ordinary network metadata, and handles these under its current terms and API policies. Original-source links open external websites when clicked. The optional practice article is on the public Explained website. Check DeepSeek's policies before submitting sensitive material. Removing this extension does not remove information retained by external services.

This policy applies to this variant's v0.2.1 API edition. Other variants and earlier versions may still use the website connection and their existing policies. The local privacy.html contains the corresponding readable disclosure; site builds must preserve this independent policy.

## Limited Use and contact

Explained’s use of information received from Google/Chrome APIs will adhere to the Chrome Web Store User Data Policy, including its Limited Use requirements. The developer does not sell user data, use it for personalized advertising or unrelated purposes, or use it for creditworthiness or lending decisions.

Full policy and support: https://www.utopia-ft.com/privacy.html. These commitments describe the extension and developer and do not promise zero retention or no training by DeepSeek.
