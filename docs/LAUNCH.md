# Sharing Explained

## Recommended sequence

1. Keep the first repository private while the owner reviews the license, documentation and third-party distribution questions.
2. Validate the installed build with a small group of willing testers using their own profiles and logins. Record concrete failures and verify News sources; do not collect their credentials or raw private chats.
3. Once the distribution questions are resolved and the owner approves publication, make the repository public and create a **v0.1.0 experimental pre-release** with the extension ZIP, SHA-256 checksum and notes. Keep generated ZIPs out of source history.
4. Add a short demo using a public article and harmless selected terms. State clearly whether the displayed response is synthetic or live. Show highlight → Explain → News → original source → pause.
5. Share the demo and repository with relevant open-source, browser-extension, reading-tool and Chinese/English developer communities. Follow community posting rules and ask for feedback on context accuracy and installation friction. No announcement has been posted by the agent.
6. Consider a broader launch after repeated live use and the platform review. Chrome Web Store distribution needs its own policy and permission review.

## Positioning

Lead with the reading experience: **“A small Chrome reading companion that explains highlighted phrases in context.”** Follow with the connection requirement: **“Experimental; uses your signed-in DeepSeek website tab.”** Avoid claims of official affiliation, guaranteed free service, a verified model identity, a guaranteed response time or approved store distribution.

Suggested repository topics: `chrome-extension`, `reading`, `text-selection`, `deepseek`, `javascript`, `manifest-v3`.

## License choice

MIT is the prepared recommendation: simple permissive reuse with preservation of its copyright and license notice. It allows commercial and closed-source forks. Apache-2.0 is an alternative when an explicit contributor patent grant is a priority. GPL-3.0 is an alternative when requiring source availability for distributed derivatives is the priority. Choose deliberately before public distribution; existing grants to recipients cannot simply be undone by later changing the repository file.

References: [MIT](https://choosealicense.com/licenses/mit/), [Apache-2.0](https://choosealicense.com/licenses/apache-2.0/), [GPL-3.0](https://choosealicense.com/licenses/gpl-3.0/).

## Separate service and store questions

DeepSeek’s terms, including §3.5, restrict certain automated/reverse-engineering activities. The current route uses an undocumented website contract, so review whether the proposed use and distribution are authorized rather than treating a successful personal test as permission. [DeepSeek terms](https://cdn.deepseek.com/policies/en-US/deepseek-terms-of-use.html?locale=de)

Chrome’s remote-hosted-code rules cover executed JavaScript and WASM and have context-dependent exceptions. The current remote solver and execution context require review; neither acceptance nor rejection by the store has been established. [Remote code guidance](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code), [MV3 requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)
