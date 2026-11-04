# extension-wasm-offline — official API edition (v0.2.1)

The variant name is retained for continuity. Explanations and News require internet access and a user-provided DeepSeek API key; there is no longer a WASM/website connection dependency.

1. Load this directory using Chrome → Extensions → Developer mode → Load unpacked, or extract the v0.2.1 ZIP first.
2. In Welcome, supply a DeepSeek API key, choose nearby context sharing, then select **Enable lookups**. The key is verified using `/models`. The same key powers model and search calls.
3. On a normal HTML reading page, highlight text, then click the existing icon or use Ctrl+X (⌘X on Mac). Input fields and editors retain native Cut behavior. Copying or highlighting alone never sends a request.
4. **News** searches for recent developments. **Explain a little more** performs a fresh web search before the existing detailed explanation. **Keep it short** restores the short cached answer. Time-sensitive selections also use search.
5. The toolbar's **API settings** reopens Welcome to replace the key. Upgrades from the website edition open Welcome when no key exists. The key is kept only in trusted session memory. Re-enter it after restarting Chrome or disabling, reloading or updating the extension. Upgrades delete the old local-storage key without adopting it. Existing language, layout, context and site-pause preferences remain.

## Calls

- Model: `POST https://api.deepseek.com/chat/completions`, model `deepseek-flash`, thinking disabled, streamed response.
- Search: `POST https://api.deepseek.com/v1/tools/search`, up to five results, with date syntax for News.
- Authentication: `Authorization: Bearer <user key>`. Calls run only in the background; keys are never included in reader messages or prompts.
- Search returns URL/title/summary/date evidence. News sources must match that evidence; no-results or failed searches never fall back to fabricated live information.
- Closing, navigating, pausing, changing key/context/language or starting a new lookup cancels the current request. Failures preserve the last successful answer and expose Retry.

API calls are billed to the user's DeepSeek account. See [official Search documentation](https://api-docs.deepseek.com/zh-cn/guides/search/) and the bundled PRIVACY.md/privacy.html. The developer hosts no proxy and stores no keys server-side.

## Validation and packaging

From the project root:

```
node --test tests/wasm-offline-api.test.cjs
node tests/wasm-offline-browser.cjs
python3 tools/package-wasm-offline.py
```

The API suite uses synthetic keys and controlled responses; it makes no paid API calls. A real account smoke test is separate. Other extension variants retain their own behavior. This is the session-key security update; v0.2.0 packages remain historical artifacts.
