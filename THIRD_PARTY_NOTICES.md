# Third-party notices

The repository’s MIT license covers the project’s original code and project-authored assets to the extent the authors hold the necessary rights. It does not license DeepSeek’s service, trademarks, website code or remotely downloaded assets.

## DeepSeek service and solver

The connection depends on the signed-in `chat.deepseek.com` website and its undocumented internal contract. At runtime it discovers or uses an official public `sha3_wasm_bg.*.wasm` asset from that site or `fe-static.deepseek.com`. The WASM binary is not included in this repository or release ZIP, and no MIT licensing claim is made for it. Its use, compatibility and redistribution rights require their own review.

- [DeepSeek terms](https://cdn.deepseek.com/policies/en-US/deepseek-terms-of-use.html?locale=de)
- [DeepSeek privacy policy](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html)

## Contract research references

The original bridge used public contract descriptions as references. No third-party proxy, account-rotation system or credential-export mechanism is bundled:

- [FreeDeepseekAPI documentation](https://github.com/ForgetMeAI/FreeDeepseekAPI/blob/main/docs/api-documentation.md)
- [Proof-of-work reference](https://github.com/ForgetMeAI/FreeDeepseekAPI/blob/main/lib/pow.js)
- [Client reference](https://github.com/ForgetMeAI/FreeDeepseekAPI/blob/main/client.js)

These references are not official integration guarantees. Contributions incorporating third-party code must preserve its applicable license and attribution; the project’s MIT license cannot override third-party rights.

## Development tools and visuals

Playwright is a development-only dependency licensed under Apache-2.0; it is not shipped inside the loaded extension. Node.js, Python and browsers retain their own licenses. The `e.` icon is a local project asset. The UI uses system fonts and includes no external font download. Documentation screenshots use synthetic answers and sample article text, with no private account data.
