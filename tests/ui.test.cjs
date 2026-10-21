/* Controlled UI integration tests on localhost. No extension installation or account access. */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'validation');
fs.mkdirSync(output, { recursive: true });
const article = `<!doctype html><html><head><meta charset="utf-8"><title>Explained UI test</title><style>body{margin:0;background:#f8f7f2;color:#23342b;font:18px/1.85 Georgia,serif}main{max-width:760px;margin:70px auto;padding:0 30px}small{font:11px system-ui;letter-spacing:.08em;color:#617555}h1{font:48px/1.1 Georgia}input,textarea{display:block;margin-top:15px}#spacer{height:250px}</style></head><body><main><small>EXPLAINED · CONTROLLED UI TEST · SYNTHETIC ANSWERS</small><h1>A little more understanding.</h1><p id="previous">The inner solar system has four planets.</p><p id="reading">Mercury is the smallest planet<span style="display:none">HIDDEN_PRIVATE_CONTEXT</span> in our solar system. Its orbit takes about 88 Earth days. A neighboring sentence supplies context.</p><p id="other">A demand-side platform, or DSP, lets advertisers buy digital ad space.</p><div id="editable" contenteditable="true">Private editable Mercury</div><input value="Private Mercury"><textarea>Private Mercury</textarea><div id="spacer"></div><p id="bottom">Attribution describes how credit is assigned.</p></main></body></html>`;
const server = http.createServer((req, res) => {
  if (req.url === '/article') { res.setHeader('Content-Type', 'text/html'); res.end(article); return; }
  const target = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    res.setHeader('Content-Type', target.endsWith('.js') ? 'text/javascript' : target.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(fs.readFileSync(target));
  } catch { res.writeHead(404).end(); }
});
function mockChrome() {
  const listeners = [], incoming = [], disconnect = [];
  const data = { settings: { enabled: true, consent: false, language: 'en', layout: 'A', contextEnabled: true, pausedSites: [] } };
  window.testMessages = []; window.testHold = false; window.testError = null;
  window.testControlMessages = []; window.testConnectionStatus = 'connected'; window.testOpenResult = { ok: true };
  window.chrome = {
    storage: { local: { get: async () => structuredClone(data), set: async next => {
      const oldValue = structuredClone(data.settings); Object.assign(data, structuredClone(next));
      listeners.forEach(fn => fn({ settings: { oldValue, newValue: structuredClone(data.settings) } }, 'local'));
    } }, onChanged: { addListener: fn => listeners.push(fn) } },
    runtime: {
      connect: () => ({ onMessage: { addListener: fn => incoming.push(fn) }, onDisconnect: { addListener: fn => disconnect.push(fn) }, disconnect: () => disconnect.forEach(fn => fn()), postMessage: message => {
        window.testMessages.push(message);
        if (message.type !== 'LOOKUP' || window.testHold) return;
        setTimeout(() => {
          if (window.testError) { incoming.forEach(fn => fn({ id: message.id, event: 'error', code: window.testError })); return; }
          const answer = message.mode === 'news' ? JSON.stringify({ stories: [{ date: new Date().toISOString().slice(0, 10), summary: 'A synthetic research development for UI verification.', sourceUrls: [], sourceCitations: [5] }, { date: new Date().toISOString().slice(0, 10), summary: 'An unverified synthetic story.', sourceUrls: ['https://fabricated.example/'] }] }) : message.detail ? 'Mercury circles the Sun quickly. For example, one Mercury year is about 88 Earth days.' : 'Mercury is the smallest planet in our solar system. Here, the context refers to the planet rather than the element.';
          incoming.forEach(fn => fn({ id: message.id, event: 'streaming', text: answer.slice(0, 40), sources: [] }));
          setTimeout(() => incoming.forEach(fn => fn({ id: message.id, event: 'complete', text: answer, sources: message.mode === 'news' ? [{ url: 'https://example.org/research', label: 'Research', citationIds: ['5'] }] : [] })), 60);
        }, 70);
      } }),
      sendMessage: async message => {
        window.testControlMessages.push(message);
        if (message.type === 'CONNECTION_STATUS') {
          if (window.testStatusHold) return new Promise(resolve => { window.finishStatus = resolve; });
          return { status: window.testConnectionStatus };
        }
        return window.testOpenResult;
      }
    },
    tabs: { query: async () => [{ url: 'https://reading.example/article' }] }
  };
  window.emitTest = message => incoming.forEach(fn => fn(message));
  window.setPrefs = patch => window.chrome.storage.local.set({ settings: { ...data.settings, ...patch } });
}
async function select(page, selector, phrase, request = false) {
  await page.locator(selector).scrollIntoViewIfNeeded();
  await page.evaluate(({ selector, phrase }) => {
    const element = document.querySelector(selector), node = element.firstChild, start = node.textContent.indexOf(phrase);
    const range = document.createRange(); range.setStart(node, start); range.setEnd(node, start + phrase.length);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
  }, { selector, phrase });
  await page.waitForTimeout(280);
  if (request) await page.locator('[data-action="request"]').click();
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE_PATH ? { executablePath: process.env.CHROME_EXECUTABLE_PATH } : {}) });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let checks = 0;
  const check = (condition, message) => { assert.ok(condition, message); checks++; };
  try {
    await page.goto(base + '/article'); await page.evaluate(mockChrome);
    for (const file of ['shared.js', 'reader-styles.js', 'reader.js']) await page.addScriptTag({ url: base + '/explained-extension/' + file });
    await select(page, '#reading', 'Mercury');
    check(await page.locator('explained-reader .assistant').count() === 0, 'No card appears before toolbar opt-in');
    check(await page.evaluate(() => testMessages.length === 0 && testControlMessages.length === 0), 'Highlight before opt-in never connects or sends text');
    await page.evaluate(() => setPrefs({ consent: true }));
    check(await page.evaluate(() => testMessages.length === 0), 'Enabling alone never submits the earlier highlight');
    await select(page, '#reading', 'Mercury');
    await page.getByRole('button', { name: 'Explain selection', exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'first-highlight.png') });
    check(await page.evaluate(() => testMessages.length === 0), 'Highlighting after opt-in still requires an explicit action');
    await page.getByRole('button', { name: 'Explain selection', exact: true }).click();
    await page.getByRole('button', { name: 'Explain a little more' }).waitFor();
    const sent = await page.evaluate(() => testMessages.find(m => m.type === 'LOOKUP'));
    check(sent.term === 'Mercury' && sent.context.includes('smallest planet') && sent.context.length <= 600, 'Selection and context contract');
    check(!sent.context.includes('HIDDEN_PRIVATE_CONTEXT'), 'Hidden page content excluded from context');
    await page.evaluate(() => {
      const target = document.querySelector('main');
      target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 10, detail: 1 }));
      target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, clientX: 10, clientY: 10, detail: 1 }));
    });
    await page.waitForTimeout(280);
    check(await page.locator('explained-reader .assistant').count() === 0, 'Outside click with unchanged selection does not reopen card');
    await select(page, '#reading', 'Mercury', true);
    await page.getByRole('button', { name: 'Explain a little more' }).waitFor();
    await page.getByRole('button', { name: '+ Context used' }).click();
    check((await page.locator('explained-reader .context-block').textContent()).includes('Mercury'), 'Context disclosure');
    await page.screenshot({ path: path.join(output, 'layout-a.png') });
    const demoStyle = await page.addStyleTag({ content: '#editable,input,textarea,#bottom{visibility:hidden}' });
    fs.mkdirSync(path.join(root, 'docs', 'images'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'docs', 'images', 'reading-note.png') });
    await demoStyle.evaluate(element => element.remove());
    await page.getByRole('button', { name: 'Explain a little more' }).click();
    await page.getByRole('button', { name: 'Keep it short' }).waitFor();
    check((await page.locator('explained-reader .answer-copy').textContent()).includes('For example'), 'Expanded explanation uses actual request');
    await page.getByRole('tab', { name: 'News' }).click();
    await page.getByRole('button', { name: 'Search news', exact: true }).click();
    await page.locator('explained-reader .news-story').first().waitFor();
    check(await page.locator('explained-reader .news-story').count() === 2, 'Parsed stories rendered');
    check(await page.locator('explained-reader a').count() === 1, 'Only structured source URL becomes link');
    check(await page.locator('explained-reader .news-story').first().locator('a').getAttribute('href') === 'https://example.org/research', 'Citation ID resolves to the original source URL');
    check(await page.locator('explained-reader .news-story').first().locator('.notice').count() === 0, 'Matched story has no missing-source warning');
    check((await page.locator('explained-reader .assistant').textContent()).includes('unverified'), 'Missing source warning');
    await page.screenshot({ path: path.join(output, 'news.png') });
    for (const layout of ['B', 'C']) {
      await page.evaluate(layout => setPrefs({ layout }), layout);
      await page.locator(`explained-reader .variant-${layout.toLowerCase()}`).waitFor();
      const box = await page.locator('explained-reader .assistant').boundingBox();
      check(box.x >= 0 && box.y >= 0 && box.x + box.width <= 1280 && box.y + box.height <= 900, 'Layout stays within viewport: ' + layout);
      await page.screenshot({ path: path.join(output, `layout-${layout.toLowerCase()}.png`) });
    }
    await page.evaluate(() => setPrefs({ layout: 'A', contextEnabled: false }));
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.locator('explained-reader .news-story').first().waitFor();
    check(await page.evaluate(() => testMessages.filter(m => m.type === 'LOOKUP').at(-1).context === ''), 'Context off sends no surrounding text');
    await page.keyboard.press('Escape');
    check(await page.locator('explained-reader .assistant').count() === 0, 'Escape dismisses');
    await select(page, '#editable', 'Mercury');
    check(await page.locator('explained-reader .assistant').count() === 0, 'Editable field excluded');
    await page.evaluate(() => setPrefs({ pausedSites: ['127.0.0.1'] }));
    await select(page, '#reading', 'Mercury');
    check(await page.locator('explained-reader .assistant').count() === 0, 'Site pause prevents lookup');
    await page.evaluate(() => { setPrefs({ pausedSites: [], contextEnabled: true }); window.testHold = true; });
    await select(page, '#reading', 'Mercury', true);
    const oldId = await page.evaluate(() => testMessages.filter(m => m.type === 'LOOKUP').at(-1).id);
    await select(page, '#other', 'DSP', true);
    const newId = await page.evaluate(() => testMessages.filter(m => m.type === 'LOOKUP').at(-1).id);
    await page.evaluate(id => emitTest({ id, event: 'complete', text: 'STALE ANSWER', sources: [] }), oldId);
    check(!(await page.locator('explained-reader .assistant').textContent()).includes('STALE ANSWER'), 'Stale answer ignored');
    await page.evaluate(id => emitTest({ id, event: 'complete', text: 'The newest answer.', sources: [] }), newId);
    check((await page.locator('explained-reader .assistant').textContent()).includes('The newest answer.'), 'Newest result accepted');
    await page.evaluate(() => { window.testHold = false; });
    await page.getByRole('tab', { name: 'News' }).click();
    await page.getByRole('button', { name: 'Search news', exact: true }).click();
    await page.locator('explained-reader .news-story').first().waitFor();
    await page.getByRole('tab', { name: 'Explain' }).click();
    check((await page.locator('explained-reader .answer-copy').textContent()).includes('The newest answer.'), 'Explain response cached for current selection');
    await page.keyboard.press('Escape');
    await page.evaluate(() => { window.testHold = false; window.testError = 'CONNECTION_UNAVAILABLE'; });
    await select(page, '#reading', 'Mercury', true);
    await page.getByRole('button', { name: 'Open DeepSeek', exact: true }).waitFor();
    check(!(await page.locator('explained-reader .assistant').textContent()).includes('Sign in'), 'Connection recovery does not require an account in its wording');
    await page.screenshot({ path: path.join(output, 'login-needed.png') });
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.evaluate(() => { window.testError = null; });
    await select(page, '#bottom', 'Attribution', true);
    await page.getByRole('button', { name: 'Explain a little more' }).waitFor();
    const box = await page.locator('explained-reader .assistant').boundingBox();
    check(box.x >= 0 && box.y >= 0 && box.x + box.width <= 375 && box.y + box.height <= 667, 'Small viewport and bottom selection');
    await page.screenshot({ path: path.join(output, 'small-viewport.png') });
    const popup = await context.newPage(); popup.on('pageerror', e => errors.push(e.message));
    await popup.addInitScript(mockChrome); await popup.goto(base + '/explained-extension/popup.html');
    await popup.getByRole('button', { name: 'Enable lookups' }).click();
    await popup.waitForFunction(() => document.getElementById('consent-panel').hidden);
    check(await popup.locator('#connection-status').textContent() === 'Website connection ready', 'Popup connection status');
    check(await popup.evaluate(() => !testControlMessages.some(m => m.type === 'OPEN_CONNECTION') && testMessages.length === 0), 'Toolbar opt-in neither opens DeepSeek nor sends text');
    await popup.getByRole('button', { name: 'Open DeepSeek', exact: false }).click();
    check(await popup.evaluate(() => testControlMessages.some(m => m.type === 'OPEN_CONNECTION')), 'Open DeepSeek is a separate explicit toolbar action');
    await popup.locator('#language').selectOption('zh-CN');
    await popup.waitForFunction(() => document.getElementById('language').value === 'zh-CN');
    await popup.getByRole('button', { name: 'Pause site', exact: true }).click();
    await popup.getByRole('button', { name: 'Resume site', exact: true }).waitFor();
    check(true, 'Popup site control persists');
    await popup.setViewportSize({ width: 352, height: 680 });
    await popup.screenshot({ path: path.join(output, 'toolbar-panel.png') });
    const setupPage = await context.newPage(); setupPage.on('pageerror', e => errors.push(e.message));
    async function freshSetup() {
      await setupPage.goto(base + '/article'); await setupPage.evaluate(mockChrome);
      for (const file of ['shared.js', 'reader-styles.js', 'reader.js']) await setupPage.addScriptTag({ url: base + '/explained-extension/' + file });
    }
    for (const layout of ['A', 'B', 'C']) {
      await freshSetup();
      await setupPage.evaluate(layout => { setPrefs({ consent: true, layout }); window.testError = 'CONNECTION_UNAVAILABLE'; window.pageClicks = 0; document.addEventListener('click', () => { window.pageClicks++; }); }, layout);
      await select(setupPage, '#reading', 'Mercury');
      check(await setupPage.evaluate(() => testMessages.length === 0), 'Selection stays local in layout: ' + layout);
      await setupPage.locator('[data-action="request"]').click();
      await setupPage.getByRole('button', { name: 'Open DeepSeek', exact: true }).waitFor();
      check(await setupPage.evaluate(() => pageClicks === 0), 'Card buttons do not trigger page click handlers: ' + layout);
      if (layout === 'A') {
        await setupPage.evaluate(() => { window.testOpenResult = { ok: false }; });
        await setupPage.getByRole('button', { name: 'Open DeepSeek', exact: true }).click();
        await setupPage.getByText('DeepSeek could not be opened.', { exact: false }).waitFor();
        check(await setupPage.getByRole('button', { name: 'Open DeepSeek', exact: true }).isEnabled(), 'Failed open leaves a working recovery button');
        await setupPage.evaluate(() => { window.testOpenResult = { ok: true }; });
      }
      await setupPage.getByRole('button', { name: 'Open DeepSeek', exact: true }).focus();
      await setupPage.keyboard.press('Enter');
      await setupPage.evaluate(() => { window.testError = null; window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
      await setupPage.waitForTimeout(100);
      check(await setupPage.evaluate(() => testMessages.filter(m => m.type === 'LOOKUP').length === 1), 'Opening and returning never auto-submit: ' + layout);
      await setupPage.screenshot({ path: path.join(output, `connection-${layout.toLowerCase()}.png`) });
      await setupPage.getByRole('button', { name: 'Retry', exact: true }).click();
      await setupPage.getByRole('button', { name: 'Explain a little more' }).waitFor();
      check(await setupPage.evaluate(() => { const lookups = testMessages.filter(m => m.type === 'LOOKUP'); return lookups.length === 2 && lookups[1].term === 'Mercury' && lookups[1].context === lookups[0].context; }), 'Explicit retry submits the preserved selection once: ' + layout);
      await setupPage.keyboard.press('Escape');
    }
    await freshSetup();
    await select(setupPage, '#reading', 'Mercury');
    await setupPage.evaluate(() => setPrefs({ consent: true }));
    await setupPage.waitForTimeout(100);
    check(await setupPage.evaluate(() => testMessages.length === 0) && await setupPage.locator('explained-reader .assistant').count() === 0, 'Toolbar opt-in does not resume a previous selection');
    await select(setupPage, '#reading', 'Mercury');
    await setupPage.getByRole('tab', { name: 'News' }).click();
    check(await setupPage.evaluate(() => testMessages.length === 0), 'Choosing a tab does not send text');
    await setupPage.getByRole('button', { name: 'Search news', exact: true }).click();
    await setupPage.locator('.news-story').first().waitFor();
    check(await setupPage.evaluate(() => testMessages.filter(m => m.type === 'LOOKUP').length === 1), 'Search news sends only after the explicit action');
    await setupPage.keyboard.press('Escape');
    await setupPage.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
    await setupPage.waitForTimeout(100);
    check(await setupPage.evaluate(() => testMessages.filter(m => m.type === 'LOOKUP').length === 1), 'Closing and returning cannot submit hidden selections');
    await freshSetup();
    await setupPage.evaluate(() => { setPrefs({ consent: true }); window.testError = 'EXTENSION_RELOADED'; });
    await select(setupPage, '#reading', 'Mercury', true);
    await setupPage.getByRole('button', { name: 'Refresh page', exact: true }).waitFor();
    check(await setupPage.getByRole('button', { name: 'Retry', exact: true }).count() === 0, 'Reloaded extensions offer refresh instead of a broken retry');
    await setupPage.setViewportSize({ width: 375, height: 667 });
    await freshSetup();
    await setupPage.evaluate(() => { setPrefs({ consent: true, layout: 'B', language: 'zh-TW' }); window.testError = 'CONNECTION_UNAVAILABLE'; });
    await select(setupPage, '#reading', 'Mercury', true);
    await setupPage.locator('[data-action="connection"]').waitFor();
    const setupBox = await setupPage.locator('explained-reader .assistant').boundingBox();
    check(setupBox.x >= 0 && setupBox.y >= 0 && setupBox.x + setupBox.width <= 375 && setupBox.y + setupBox.height <= 667, 'Connection recovery fits a small viewport');
    await setupPage.locator('[data-action="connection"]').click();
    await setupPage.screenshot({ path: path.join(output, 'connection-small.png') });
    await setupPage.evaluate(() => { window.testError = null; });
    await setupPage.locator('[data-action="retry"]').click();
    await setupPage.locator('[data-action="more"]').waitFor();
    check(await setupPage.evaluate(() => testMessages.filter(m => m.type === 'LOOKUP').length === 2), 'Explicit retry works on small screens in Traditional Chinese');
    check(errors.length === 0, 'No browser JavaScript errors: ' + errors.join(', '));
    fs.writeFileSync(path.join(output, 'ui-results.json'), JSON.stringify({ checks, passed: true, errors, scope: 'Localhost UI with controlled responses, not installed-extension or authenticated DeepSeek validation.' }, null, 2));
    console.log(`${checks} browser UI checks passed. Screenshots: validation/`);
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
