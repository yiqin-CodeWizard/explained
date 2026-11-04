/* Real unpacked API extension; all remote responses are synthetic and intercepted. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'extension-wasm-offline');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'explained-api-integration-'));
const screenshots = path.join(root, 'validation/api'); fs.mkdirSync(screenshots, { recursive: true });
const apiKey = 'synthetic-deepseek-key';
function browserPath() {
  if (process.env.CHROME_EXECUTABLE_PATH) return process.env.CHROME_EXECUTABLE_PATH;
  if (fs.existsSync(chromium.executablePath())) return chromium.executablePath();
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  for (const dir of fs.readdirSync(cache).filter(n => /^chromium-\d+$/.test(n)).sort((a,b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))) {
    const file = path.join(cache, dir, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    if (fs.existsSync(file)) return file;
  }
  throw new Error('Set CHROME_EXECUTABLE_PATH to an extension-capable Chromium binary.');
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function select(page, word, activate = true) {
  await page.evaluate(word => {
    const node = document.querySelector('#reading').firstChild;
    const start = node.textContent.indexOf(word);
    if (start < 0) throw new Error('Missing fixture word');
    const range = document.createRange(); range.setStart(node, start); range.setEnd(node, start + word.length);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    document.querySelector('#reading').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
  }, word);
  if (activate) await page.locator('explained-reader .selection-trigger').click();
}
const cardText = page => page.locator('explained-reader .assistant').innerText();
const waitCard = (page, text) => page.waitForFunction(text => document.querySelector('explained-reader')?.shadowRoot?.querySelector('.assistant')?.textContent.includes(text), text, { timeout: 15000 });
(async () => {
  const extension = path.join(temp, 'extension'); fs.cpSync(source, extension, { recursive: true });
  // A test-only isolated content script probes access without returning the key.
  fs.writeFileSync(path.join(extension, 'storage-probe.js'), `for(const area of ['local','session'])chrome.storage[area].get('apiKey').then(value=>{document.documentElement.dataset[area+'KeyAccessible']=value.apiKey?'yes':'no';},()=>{document.documentElement.dataset[area+'KeyAccessible']='no';});chrome.storage.onChanged.addListener(changes=>{if(changes.apiKey)document.documentElement.dataset.keyChangeLeaked='yes';});`);
  const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json')));
  manifest.content_scripts[0].js.push('storage-probe.js'); fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify(manifest));
  const context = await chromium.launchPersistentContext(path.join(temp, 'profile'), { executablePath: browserPath(), headless: true, ignoreDefaultArgs: ['--disable-extensions'], args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension] });
  const calls = [], unexpected = [], errors = [];
  let searchMode = 'normal', holdModel = false, releaseModel, heldModels = 0;
  const today = new Date().toISOString().slice(0, 10);
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.protocol === 'chrome-extension:') return route.continue();
    if (url.origin === 'https://explained-api-test.invalid') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>API controlled article</title><style>body{margin:80px;max-width:740px;background:#fffdf4;color:#20201d;font:20px/1.8 Georgia}input,[contenteditable]{display:block;margin-top:35px}</style><p id="reading">Mercury is a small planet in the solar system. A short sentence supplies context. The latest discoveries are interesting.</p><input id="copy-input" aria-label="Native cut input" value="Cut this text"><div id="copy-editor" contenteditable="true" role="textbox" aria-label="Native cut editor">Editable words</div>' });
    if (url.origin !== 'https://api.deepseek.com') { unexpected.push(url.href); return route.abort(); }
    const body = request.postData() ? request.postDataJSON() : undefined;
    const auth = request.headers().authorization;
    calls.push({ path: url.pathname, body, auth });
    assert.equal(auth, 'Bearer ' + apiKey);
    assert.ok(!JSON.stringify(body || {}).includes(apiKey));
    if (url.pathname === '/models') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'deepseek-flash' }] }) });
    if (url.pathname === '/v1/tools/search') {
      if (searchMode === 'rate') return route.fulfill({ status: 429, contentType: 'application/json', body: '{}' });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: searchMode === 'empty' ? [] : [{ url: 'https://news.example/verified', title: 'Verified source', date: today, summary: 'Synthetic supporting evidence.' }] }) });
    }
    if (url.pathname === '/chat/completions') {
      if (holdModel) { heldModels++; await new Promise(resolve => { releaseModel = resolve; }); }
      const news = !!body.response_format;
      const detail = JSON.stringify(body.messages).includes('one short paragraph');
      const text = news ? JSON.stringify({ stories: [{ date: today, summary: 'Synthetic verified development.', sourceCitations: [1] }] }) : detail ? 'Synthetic detailed explanation with evidence [1].' : 'Synthetic short explanation.';
      const frames = [{ choices: [{ delta: { content: text } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }] }];
      try { await route.fulfill({ contentType: 'text/event-stream', body: frames.map(frame => 'data: ' + JSON.stringify(frame) + '\r\n\r\n').join('') + 'data: [DONE]\n\n' }); } catch { /* Expected after request cancellation. */ }
      return;
    }
    unexpected.push(url.href); return route.abort();
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
    const id = new URL(worker.url()).host;
    const welcome = await context.newPage(); await welcome.goto(`chrome-extension://${id}/welcome.html`);
    await welcome.locator('#api-key:not([disabled])').waitFor();
    await welcome.locator('#enable').click();
    assert.match(await welcome.locator('#key-error').innerText(), /Enter a valid/);
    assert.equal(calls.length, 0);
    await welcome.locator('#api-key').fill(apiKey);
    await welcome.screenshot({ path: path.join(screenshots, 'welcome.png'), fullPage: true });
    await welcome.locator('#enable').click(); await welcome.locator('#complete:not([hidden])').waitFor();
    assert.equal(calls.length, 1); assert.equal(calls[0].path, '/models');
    assert.equal(await welcome.locator('#api-key').inputValue(), '');
    const local = await worker.evaluate(() => chrome.storage.local.get(['apiKey', 'settings']));
    assert.equal(local.apiKey, undefined); assert.equal(local.settings.consent, true);
    assert.equal((await worker.evaluate(() => chrome.storage.session.get('apiKey'))).apiKey, apiKey);
    const page = await context.newPage(); await page.goto('https://explained-api-test.invalid/article');
    await page.waitForFunction(() => document.documentElement.dataset.localKeyAccessible === 'no' && document.documentElement.dataset.sessionKeyAccessible === 'no');
    assert.equal(await page.locator('html').getAttribute('data-session-key-accessible'), 'no', 'Content script cannot read the session key');
    await select(page, 'Mercury', false); await page.locator('explained-reader .selection-trigger').waitFor();
    assert.equal(calls.length, 1, 'Selection alone sends nothing');
    await page.locator('explained-reader .selection-trigger').click(); await waitCard(page, 'Synthetic short explanation.');
    assert.equal(calls.length, 2); assert.equal(calls.at(-1).path, '/chat/completions');
    assert.equal(await page.locator('explained-reader .more-btn').innerText(), 'Explain a little more');
    await page.locator('explained-reader [data-action="more"]').click(); await waitCard(page, 'Synthetic detailed explanation');
    assert.deepEqual(calls.slice(-2).map(call => call.path), ['/v1/tools/search', '/chat/completions']);
    assert.equal(await page.locator('explained-reader a[href="https://news.example/verified"]').count(), 1);
    const beforeShort = calls.length;
    await page.locator('explained-reader [data-action="more"]').click(); await waitCard(page, 'Synthetic short explanation.');
    assert.equal(calls.length, beforeShort, 'Keep it short restores cached answer');
    await page.locator('explained-reader [data-action="more"]').click(); await waitCard(page, 'Synthetic detailed explanation');
    assert.equal(calls.length, beforeShort + 2, 'Each new more activation searches again');
    await page.screenshot({ path: path.join(screenshots, 'more-sources.png') });
    searchMode = 'empty';
    await page.locator('explained-reader [data-mode="news"]').click(); await waitCard(page, 'No usable search results');
    assert.match(await cardText(page), /Synthetic detailed explanation/);
    assert.equal(calls.at(-1).path, '/v1/tools/search', 'No generation after empty search');
    await page.screenshot({ path: path.join(screenshots, 'search-failure.png') });
    searchMode = 'normal'; await page.locator('explained-reader [data-action="retry"]').click(); await waitCard(page, 'Synthetic verified development.');
    assert.equal(await page.locator('explained-reader a[href="https://news.example/verified"]').count(), 1);
    await page.screenshot({ path: path.join(screenshots, 'news.png') });
    await page.keyboard.press('Escape');
    const beforeKeyboard = calls.length;
    await select(page, 'planet', false); await page.locator('explained-reader .selection-trigger').waitFor();
    await page.keyboard.press('Control+x'); await waitCard(page, 'Synthetic short explanation.');
    assert.equal(calls.length, beforeKeyboard + 1);
    await page.keyboard.press('Escape');
    const beforeEditor = calls.length, modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.locator('#copy-input').fill('Cut this text'); await page.locator('#copy-input').press(modifier + '+a'); await page.locator('#copy-input').press(modifier + '+x');
    assert.equal(await page.locator('#copy-input').inputValue(), ''); assert.equal(calls.length, beforeEditor);
    await page.locator('#copy-editor').fill('Editable words'); await page.locator('#copy-editor').press(modifier + '+a'); await page.locator('#copy-editor').press(modifier + '+x');
    assert.equal((await page.locator('#copy-editor').innerText()).trim(), ''); assert.equal(calls.length, beforeEditor);
    // Cancel an in-flight model request; late responses cannot reopen or overwrite a card.
    await page.locator('#reading').click(); holdModel = true; await select(page, 'solar');
    for (let i = 0; !heldModels && i < 100; i++) await pause(25);
    assert.equal(heldModels, 1); await page.keyboard.press('Escape');
    holdModel = false; releaseModel(); await pause(150);
    assert.equal(await page.locator('explained-reader .assistant').count(), 0);
    for (const layout of ['A', 'B', 'C']) {
      await worker.evaluate(layout => chrome.storage.local.set({ settings: { consent: true, enabled: true, language: 'en', contextEnabled: false, layout, pausedSites: [] } }), layout);
      await page.reload(); await select(page, 'Mercury'); await waitCard(page, 'Synthetic short explanation.');
      assert.equal(await page.locator(`explained-reader .variant-${layout.toLowerCase()}`).count(), 1);
      const prompt = JSON.stringify(calls.at(-1).body.messages);
      assert.match(prompt, /surroundingText/); assert.ok(!prompt.includes('Mercury is a small planet'));
      await page.screenshot({ path: path.join(screenshots, `layout-${layout}.png`) });
      await page.keyboard.press('Escape');
    }
    const popup = await context.newPage(); await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.waitForFunction(() => document.querySelector('#connection-status').textContent.includes('configured'));
    assert.equal(await popup.locator('#connection').innerText(), 'API settings');
    const setupPromise = context.waitForEvent('page'); await popup.locator('#connection').click();
    const edit = await setupPromise; await edit.waitForLoadState(); await edit.locator('#api-key:not([disabled])').waitFor();
    assert.equal(await edit.locator('#api-key').inputValue(), ''); assert.match(await edit.locator('#api-key').getAttribute('placeholder'), /saved/);
    await edit.locator('#enable').click(); await edit.locator('#complete:not([hidden])').waitFor();
    assert.equal(calls.at(-1).path, '/models', 'Current session key can be retained and revalidated');
    assert.equal(await page.locator('html').getAttribute('data-key-change-leaked'), null, 'Content scripts receive no secret storage changes');
    await worker.evaluate(() => chrome.storage.session.remove('apiKey'));
    await popup.waitForFunction(() => document.querySelector('#connection-status').textContent.includes('Add your DeepSeek API key'));
    const beforeMissing = calls.length;
    await page.keyboard.press('Escape'); await select(page, 'Mercury'); await waitCard(page, 'Add your DeepSeek API key');
    assert.equal(calls.length, beforeMissing, 'Missing session key does not submit a request');
    await edit.reload(); await edit.locator('#api-key:not([disabled])').waitFor();
    assert.equal(await edit.locator('#api-key').getAttribute('required'), '');
    await edit.locator('#enable').click(); assert.match(await edit.locator('#key-error').innerText(), /Enter a valid/);
    await edit.locator('#api-key').fill(apiKey); await edit.locator('#enable').click(); await edit.locator('#complete:not([hidden])').waitFor();
    assert.equal((await worker.evaluate(() => chrome.storage.local.get('apiKey'))).apiKey, undefined);
    assert.equal(await page.locator('html').getAttribute('data-key-change-leaked'), null);
    assert.equal(context.pages().filter(page => page.url().startsWith('https://chat.deepseek.com')).length, 0);
    assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
    // Seed a synthetic legacy disk credential, then actually restart the same profile.
    // The new worker must remove it and must not recover the previous session key.
    await worker.evaluate(() => chrome.storage.local.set({ apiKey: 'synthetic-legacy-disk-key' }));
    await context.close();
    const restarted = await chromium.launchPersistentContext(path.join(temp, 'profile'), { executablePath: browserPath(), headless: true, ignoreDefaultArgs: ['--disable-extensions'], args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension] });
    await restarted.route('https://**/*', route => { unexpected.push(route.request().url()); return route.abort(); });
    try {
      const nextWelcome = await restarted.newPage(); await nextWelcome.goto(`chrome-extension://${id}/welcome.html`);
      await nextWelcome.locator('#api-key:not([disabled])').waitFor();
      const nextWorker = restarted.serviceWorkers()[0] || await restarted.waitForEvent('serviceworker');
      const snapshot = await nextWorker.evaluate(async () => ({ local: await chrome.storage.local.get(['apiKey', 'settings']), session: await chrome.storage.session.get('apiKey') }));
      assert.equal(snapshot.local.apiKey, undefined, 'Legacy disk credential removed on next worker start');
      assert.equal(snapshot.session.apiKey, undefined, 'Browser restart clears the session credential');
      assert.equal(snapshot.local.settings.consent, true, 'Preferences survive browser restart');
      assert.equal(await nextWelcome.locator('#api-key').inputValue(), '');
      assert.equal(await nextWelcome.locator('#api-key').getAttribute('required'), '');
      await nextWelcome.locator('#enable').click(); assert.match(await nextWelcome.locator('#key-error').innerText(), /Enter a valid/);
      assert.deepEqual(unexpected, []);
    } finally { await restarted.close(); }
    const report = { assertions: 'Welcome validation, session-only key storage, actual browser restart, legacy disk-key deletion, missing-key recovery, explanation, more fresh search, source rendering, cached short, news, empty-search fallback/retry, Ctrl+X, native editor Cut, cancellation, layouts A/B/C, context off, API settings', requests: calls.length, network: 'Synthetic responses only; no real account or paid lookup', unexpected, pageErrors: errors };
    fs.writeFileSync(path.join(screenshots, 'report.json'), JSON.stringify(report, null, 2));
    console.log('PASS: real Chrome extension integration and existing reading interactions. Screenshots: validation/api');
  } finally { await context.close(); fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
