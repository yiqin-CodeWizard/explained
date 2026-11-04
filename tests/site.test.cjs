/* Static build and browser integration checks; no installed extension or live account access. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '_site');
const screenshots = path.join(root, 'validation', 'ui-review', 'landing');
fs.mkdirSync(screenshots, { recursive: true });
const config = require('../site/config.json');
const { languages, pageEntries, renderPage } = require('../site/render.cjs');
const sitePath = new URL(config.url).pathname;
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const apiPolicy = fs.readFileSync(path.join(root, 'extension-wasm-offline/PRIVACY.md'), 'utf8');
const build = spawnSync(process.execPath, ['tools/build-site.cjs'], { cwd: root, encoding: 'utf8' });
assert.equal(build.status, 0, build.stderr);
const version = JSON.parse(fs.readFileSync(path.join(root, config.downloadEdition, 'manifest.json'), 'utf8')).version;
const filename = `${config.downloadEdition}-v${version}.zip`;
const archive = fs.readFileSync(path.join(output, 'downloads', filename));
const hash = crypto.createHash('sha256').update(archive).digest('hex');
check(fs.readFileSync(path.join(output, 'downloads', filename + '.sha256'), 'utf8').startsWith(hash + '  ' + filename), 'Download checksum matches the packaged extension');
const supportedWelcomeURLs = [config.url, ...(config.legacySiteURLs || [])];
check(supportedWelcomeURLs.some(url => fs.readFileSync(path.join(root, config.downloadEdition, 'welcome.js'), 'utf8').includes(`const siteURL = '${url}'`)), 'Released onboarding uses the current site or a documented legacy entry URL');
if (config.customDomain) check(fs.readFileSync(path.join(output, 'CNAME'), 'utf8').trim() === config.customDomain && sitePath === '/', 'Custom-domain builds preserve CNAME and publish at the host root');
const packageManifest = spawnSync(process.env.PYTHON || 'python3', ['-c', 'import sys,json,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(z.read("manifest.json").decode())', path.join(output, 'downloads', filename)], { encoding: 'utf8' });
assert.equal(packageManifest.status, 0, packageManifest.stderr);
check(JSON.parse(packageManifest.stdout).name === 'extension-wasm-offline' && JSON.parse(packageManifest.stdout).version === version, 'The downloaded ZIP has the current API edition manifest at its root');
const privacy = fs.readFileSync(path.join(root, 'site/privacy-policy.md'), 'utf8');
for (const policy of ['PRIVACY.md', 'explained-extension-yellow/PRIVACY.md', '_site/PRIVACY.md']) {
  check(fs.readFileSync(path.join(root, policy), 'utf8') === privacy, 'Distributed policy matches the authoritative source: ' + policy);
}
for (const edition of ['explained-extension', 'explained-extension-yellow']) {
  for (const file of ['welcome.html', 'popup.html']) {
    const html = fs.readFileSync(path.join(root, edition, file), 'utf8');
    check(supportedWelcomeURLs.some(url => html.includes(`href="${new URL('privacy.html', url).href}"`)) && html.includes('existing DeepSeek website login state'), 'Legacy privacy entries use a current or documented former site, with authentication disclosure: ' + edition + '/' + file);
  }
}
check(fs.readFileSync(path.join(root, 'extension-wasm-offline/PRIVACY.md'), 'utf8') === apiPolicy && apiPolicy.includes('official DeepSeek APIs'), 'Site builds preserve the independent API policy');
for (const file of ['welcome.html', 'popup.html']) {
  const html = fs.readFileSync(path.join(root, 'extension-wasm-offline', file), 'utf8');
  check(html.includes('href="privacy.html"') && html.includes('official APIs'), 'API edition links its local API disclosure: ' + file);
}
for (const entry of pageEntries()) {
  const html = fs.readFileSync(path.join(output, entry.path, 'index.html'), 'utf8');
  const canonical = new URL(entry.path, config.url).href;
  check(html.includes(`rel="canonical" href="${canonical}"`) && html.includes('application/ld+json'), `Page metadata uses its real URL: ${entry.path}`);
  check(html.includes('noindex') === (entry.language.key === 'mixed'), `Mixed mode is excluded from indexing: ${entry.path}`);
  check(!html.includes('undefined') && !html.includes('data-open-install') && !html.includes('explained-v0.1.5.zip'), `Page has complete copy and current download navigation: ${entry.path}`);
  if (config.customDomain) check(html.includes('href="/assets/site.css?') && html.includes('src="/assets/site.js?') && !/(?:href|src)="\/explained-site\//.test(html) && !html.includes('https://yiqin-codewizard.github.io/explained-site/'), `Custom-domain pages load assets and links from the correct root: ${entry.path}`);
  if (['home', 'try'].includes(entry.key)) check(['drug-development', 'scientific-understanding', 'deepseek-v4'].every(key => html.includes(`id="article-${key}"`)), `All articles are readable in the source: ${entry.path}`);
  if (['apiKey', 'research', 'context'].includes(entry.key)) {
    const structured = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
    check(structured.find(item => item['@type'] === 'BreadcrumbList').itemListElement.length === 3, `Guide hierarchy is represented in structured data: ${entry.path}`);
  }
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const target = new URL(match[1].replace(/&amp;/g, '&'), canonical);
    if (target.origin !== new URL(config.url).origin || !target.pathname.startsWith(sitePath)) continue;
    let relative = target.pathname.slice(sitePath.length);
    if (!relative || relative.endsWith('/')) relative += 'index.html';
    assert.ok(fs.existsSync(path.join(output, relative)), `Internal link exists: ${entry.path} -> ${relative}`);
  }
  const migrated = renderPage(entry.language, { version, filename, size: '47 KB' }, entry.key, { ...config, url: 'https://explained.example/' });
  check(migrated.includes(`rel="canonical" href="https://explained.example/${entry.path}"`) && !/href="\/explained-site\//.test(migrated), `Root-domain deployment has no project prefix dependency: ${entry.path}`);
  const project = renderPage(entry.language, { version, filename, size: '47 KB' }, entry.key, { ...config, url: 'https://explained.example/explained-site/', customDomain: undefined });
  check(project.includes(`rel="canonical" href="https://explained.example/explained-site/${entry.path}"`) && project.includes('href="/explained-site/assets/site.css?'), `Project-subdirectory deployments remain supported: ${entry.path}`);
}
const sitemap = fs.readFileSync(path.join(output, 'sitemap.xml'), 'utf8');
check(!sitemap.includes('/mixed/') && pageEntries().filter(entry => entry.language.key !== 'mixed').every(entry => sitemap.includes(new URL(entry.path, config.url).href)), 'Sitemap includes only published indexable pages');
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const extensionRequest = pathname.startsWith('/__extension__/');
  const directory = extensionRequest ? path.join(root, config.downloadEdition) : output;
  let relative = extensionRequest ? pathname.slice('/__extension__/'.length) : pathname.startsWith(sitePath) ? pathname.slice(sitePath.length) : null;
  if (relative === null) { res.writeHead(404).end(); return; }
  if (!relative || relative.endsWith('/')) relative += 'index.html';
  const file = path.resolve(directory, relative);
  if (!file.startsWith(directory + path.sep)) { res.writeHead(403).end(); return; }
  try {
    const type = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.zip': 'application/zip', '.json': 'application/json' }[path.extname(file)] || 'text/html';
    res.setHeader('Content-Type', type); res.end(fs.readFileSync(file));
  } catch { res.writeHead(404).end(); }
});
function readerMock() {
  const prefs = { consent: false, enabled: true, contextEnabled: true, language: 'en', layout: 'A', pausedSites: [] };
  const incoming = [], settingsListeners = [];
  window.lookupRequests = [];
  window.chrome = {
    runtime: { id: 'controlled-api-reader',
      sendMessage: async message => message.type === 'GET_SETTINGS' ? { settings: { ...prefs } } : {},
      onMessage: { addListener: fn => settingsListeners.push(fn) },
      connect: () => ({
      onMessage: { addListener: fn => incoming.push(fn) }, onDisconnect: { addListener() {} }, disconnect() {},
      postMessage(message) {
        if (message.type !== 'LOOKUP') return;
        window.lookupRequests.push(message);
        setTimeout(() => incoming.forEach(fn => fn({ id: message.id, event: 'complete', text: 'A controlled explanation of the selected article phrase.', sources: [] })), 10);
      }
    }) }
  };
  window.enableReader = () => {
    prefs.consent = true;
    settingsListeners.forEach(fn => fn({ type: 'SETTINGS_CHANGED', settings: { ...prefs } }, { id: window.chrome.runtime.id }));
  };
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const base = origin + sitePath;
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE_PATH ? { executablePath: process.env.CHROME_EXECUTABLE_PATH } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [], missing = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) missing.push(response.url()); });
  await context.route('**/*', route => {
    if (!route.request().url().startsWith(origin + '/')) { external.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  try {
    await page.goto(base);
    check(await page.locator('h1').count() === 1 && await page.locator('.reading-tile').count() === 0 && await page.locator('[data-article]').count() === 3 && await page.locator('[data-article]:visible').count() === 1, 'Home restores complete articles with the original sidebar layout');
    check(await page.locator('#practice-title').evaluate(el => el.tagName === 'H2') && await page.locator('.article-heading').first().evaluate(el => el.tagName === 'H3'), 'Inline readings preserve the homepage heading hierarchy');
    await page.locator('.language-menu summary').click();
    await page.locator('[data-language-link="zh-CN"]').click();
    check(new URL(page.url()).pathname === sitePath + 'zh-cn/' && !new URL(page.url()).search && !new URL(page.url()).hash, 'Changing language from the home hero does not force an article jump');
    await page.goto(base);
    await page.locator('.main-nav a').first().click();
    check(new URL(page.url()).pathname === sitePath && new URL(page.url()).hash === '#practice' && await page.locator('[data-article]:visible').count() === 1, 'Home navigation reaches the inline reading section without a page change');
    await page.locator('[data-topic="scientific-understanding"]').click();
    await page.locator('[data-topic="deepseek-v4"]').click();
    await page.goBack();
    check(await page.locator('#article-scientific-understanding').isVisible(), 'Back restores the previous article');
    await page.goForward();
    check(await page.locator('#article-deepseek-v4').isVisible(), 'Forward restores the next article');
    await page.goto(base + '?entry=welcome&topic=pricing#practice');
    check(new URL(page.url()).pathname === sitePath && await page.locator('[data-welcome]').isVisible() && await page.locator('#article-scientific-understanding').isVisible(), 'Legacy onboarding and topic aliases work on the home page without a redirect');
    await page.locator('.language-menu summary').click();
    await page.locator('[data-language-link="mixed"]').click();
    check(new URL(page.url()).pathname === sitePath + 'mixed/' && new URL(page.url()).searchParams.get('entry') === 'welcome' && (await page.locator('#article-scientific-understanding mark').first().innerText()).includes('局部光滑性猜想'), 'Language switching preserves article, welcome state and Mixed annotations');
    await page.goto(base + 'zh-cn/#article-choices');
    check(new URL(page.url()).pathname === sitePath + 'zh-cn/' && await page.locator('#article-deepseek-v4').isVisible(), 'Legacy localized article anchors select the article in place');
    await page.goto(base + '?topic=unknown');
    check(await page.locator('html').getAttribute('data-page') === 'home', 'Unknown legacy parameters do not cause a navigation loop');
    await page.goto(base + 'download/');
    const download = await page.locator('[data-download]').getAttribute('href');
    const response = await context.request.get(new URL(download, page.url()).href);
    check(response.status() === 200 && (await response.body()).equals(archive), 'Download page serves the immutable API ZIP');
    check(await page.locator('.install-privacy a').getAttribute('href') === sitePath + 'privacy.html' && (await page.locator('.install-intro').innerText()).includes('API key'), 'Download page discloses API requirements and links to the policy');
    await page.locator('.language-menu summary').click();
    await page.locator('[data-language-link="zh-TW"]').click();
    check(new URL(page.url()).pathname === sitePath + 'zh-tw/download/' && !new URL(page.url()).search, 'Language switching stays on a subpage without adding reading state');
    for (const entry of pageEntries()) {
      await page.goto(base + entry.path);
      check(await page.locator('h1').count() === 1, `One primary heading: ${entry.path}`);
      await page.locator('.language-menu summary').click();
      await page.keyboard.press('Escape');
      check(await page.locator('.language-menu').evaluate(el => !el.open && document.activeElement === el.querySelector('summary')), `Language menu supports Escape: ${entry.path}`);
      for (const width of [320, 375, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No overflow at ${width}px: ${entry.path}`);
        check(await page.locator('.main-nav').isVisible(), `Navigation remains available at ${width}px: ${entry.path}`);
        if ([375,1440].includes(width)) {
          await page.reload();
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({path:path.join(screenshots, `${entry.language.key}-${entry.key}-${width}.png`), fullPage:true});
        }
      }
    }
    await page.goto(base + 'help/');
    await page.locator('.document-toc a[href="#api-errors"]').click();
    check(new URL(page.url()).hash === '#api-errors' && await page.locator('#api-errors').isVisible(), 'Help sections have usable deep links');
    await page.goto(base + 'zh-cn/guides/deepseek-api-key/');
    check(await page.locator('.document-prose img').getAttribute('alt').then(alt => alt.includes('v' + version)), 'API setup guide shows the actual version-specific setup screen');
    await page.locator('.language-menu summary').click();
    await page.locator('[data-language-link="en"]').click();
    check(new URL(page.url()).pathname === sitePath + 'guides/deepseek-api-key/', 'Nested guide language links stay on the same guide');
    await page.goto(base + 'zh-cn/guides/');
    check(await page.locator('.guide-tiles .reading-tile').count() === 3, 'Guide index links to three substantive published guides');
    await page.locator('.guide-tiles a').nth(1).click();
    check(new URL(page.url()).pathname === sitePath + 'zh-cn/guides/read-research-papers/' && await page.locator('.breadcrumbs a').count() === 2, 'Guide cards and breadcrumb navigation reflect the site hierarchy');
    await page.locator('.breadcrumbs a').last().click();
    check(new URL(page.url()).pathname === sitePath + 'zh-cn/guides/', 'Guide breadcrumb returns to its parent collection');
    await page.goto(base + 'zh-tw/');
    check(await page.locator('.main-nav a').filter({hasText:'English'}).getAttribute('href') === sitePath + 'guides/', 'Untranslated guide collection is explicitly marked as English');
    const noJS = await browser.newContext({ javaScriptEnabled: false });
    const noJSPage = await noJS.newPage();
    await noJSPage.goto(base + 'zh-cn/try/');
    check(await noJSPage.locator('[data-article]:visible').count() === 3, 'Without JavaScript all three practice articles remain readable');
    await noJSPage.locator('.language-menu summary').click();
    await noJSPage.locator('[data-language-link="zh-TW"]').click();
    check(new URL(noJSPage.url()).pathname === sitePath + 'zh-tw/try/', 'Language links work without JavaScript');
    await noJSPage.goto(base + '#practice');
    check(await noJSPage.locator('#practice [data-article]:visible').count() === 3, 'All inline articles remain readable on the home page without JavaScript');
    await noJS.close();
    await page.goto(base + 'try/');
    check(await page.locator('[data-article]:visible').count() === 1 && await page.locator('h1').count() === 1, 'The independent reading-room entry remains usable');
    await page.goto(base);
    await page.evaluate(readerMock);
    for (const file of ['shared.js', 'reader-styles.js', 'reader.js']) await page.addScriptTag({ url: origin + '/__extension__/' + file });
    const selectTerm = async () => {
      await page.locator('#article-drug-development mark').first().scrollIntoViewIfNeeded();
      await page.evaluate(() => {
        const term = document.querySelector('#article-drug-development mark');
        const range = document.createRange(); range.selectNodeContents(term);
        getSelection().removeAllRanges(); getSelection().addRange(range);
        term.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
      });
      await page.waitForTimeout(300);
    };
    await selectTerm();
    check(await page.evaluate(() => lookupRequests.length === 0), 'Reading selections send nothing before consent');
    await page.evaluate(() => enableReader());
    check(await page.evaluate(() => lookupRequests.length === 0), 'Enabling the reader submits no previous selection');
    await selectTerm();
    check(await page.evaluate(() => lookupRequests.length === 0), 'Highlighting alone sends no API lookup');
    await page.locator('explained-reader .selection-trigger').click();
    await page.locator('explained-reader .answer-copy').waitFor();
    check(await page.evaluate(() => lookupRequests.length === 1 && lookupRequests[0].term === 'blood cell cancers' && lookupRequests[0].context.includes('Generate aims') && lookupRequests[0].context.length <= 600), 'Explicit activation uses the shipped API reader and bounded article context');
    check(errors.length === 0 && missing.length === 0 && external.length === 0, 'No errors, missing resources or unexpected requests: ' + [...errors, ...missing, ...external].join(', '));
    console.log(`${checks} multipage, compatibility, responsive, download and reader checks passed.`);
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
