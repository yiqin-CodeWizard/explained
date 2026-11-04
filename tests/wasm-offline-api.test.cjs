const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'extension-wasm-offline');
const apiKey = 'synthetic-deepseek-key';
const today = new Date().toISOString().slice(0, 10);
function sse(text, finish = 'stop') {
  return new Response('data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\r\n\r\n' +
    (finish ? 'data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: finish }] }) + '\n\ndata: [DONE]\n\n' : ''), { headers: { 'Content-Type': 'text/event-stream' } });
}
const results = { results: [{ title: 'Verified source', url: 'https://news.example/item', summary: 'Verified evidence.', date: today }] };
function harness(fetch) {
  const context = vm.createContext({ fetch, Response, TextDecoder, TextEncoder, URL, Intl, Date, AbortController, setTimeout, clearTimeout, console });
  for (const file of ['shared.js', 'api-client.js']) vm.runInContext(fs.readFileSync(path.join(source, file), 'utf8'), context);
  return context;
}
const input = { term: 'Mercury', context: 'Mercury is a planet.', language: 'en', mode: 'explain', detail: false };
async function run(context, request = input, signal = new AbortController().signal) {
  const events = [];
  await context.DeepSeekAPI.run(request, apiKey, signal, event => events.push(event));
  return events;
}

test('ordinary explanation calls only the official model API, without leaking the key into prompts', async () => {
  const calls = [];
  const ctx = harness(async (url, options) => { calls.push({ url, options }); return sse('A concise explanation.'); });
  const events = await run(ctx);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.deepseek.com/chat/completions');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer ' + apiKey);
  assert.equal(calls[0].options.redirect, 'error');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, 'deepseek-flash'); assert.equal(body.thinking.type, 'disabled');
  assert.ok(!calls[0].options.body.includes(apiKey));
  assert.equal(events.at(-1).event, 'complete'); assert.equal(events.at(-1).text, 'A concise explanation.');
});

test('more and time-sensitive selections explicitly search, then pass verified evidence to the model', async () => {
  for (const request of [{ ...input, detail: true }, { ...input, term: 'latest Mercury findings' }]) {
    const calls = [];
    const ctx = harness(async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return url.endsWith('/search') ? Response.json(results) : sse('Evidence-backed explanation [1].'); });
    const events = await run(ctx, request);
    assert.deepEqual(calls.map(x => new URL(x.url).pathname), ['/v1/tools/search', '/chat/completions']);
    assert.equal(calls[0].body.count, 5);
    assert.match(JSON.stringify(calls[1].body.messages), /Verified evidence/);
    assert.equal(events.at(-1).sources[0].url, results.results[0].url);
    assert.deepEqual(Array.from(events.at(-1).sources[0].citationIds), ['1']);
  }
});

test('news is dated, cited only from search evidence, and requests JSON', async () => {
  const calls = [];
  const ctx = harness(async (url, options) => {
    const body = JSON.parse(options.body); calls.push(body);
    return url.endsWith('/search') ? Response.json(results) : sse(JSON.stringify({ stories: [{ date: today, summary: 'Verified development.', sourceUrls: ['https://news.example/item'] }] }));
  });
  const events = await run(ctx, { ...input, mode: 'news' });
  assert.match(calls[0].query, /after:\d{4}-\d{2}-\d{2} before:\d{4}-\d{2}-\d{2}$/);
  assert.equal(calls[1].response_format.type, 'json_object');
  assert.equal(events.at(-1).event, 'complete');
});

test('unsafe, duplicate and invented news sources cannot become verified stories', async () => {
  const ctx = harness(async url => url.endsWith('/search') ? Response.json({ results: [...results.results, ...results.results, { url: 'javascript:alert(1)' }] }) : sse(JSON.stringify({ stories: [{ date: today, summary: 'Invented.', sourceUrls: ['https://invented.example/story'] }] })));
  await assert.rejects(run(ctx, { ...input, mode: 'news' }), { code: 'NEWS_UNVERIFIED' });
});

test('empty or unusable search stops before any generation and reports no results', async () => {
  for (const found of [[], [{ url: 'javascript:alert(1)' }]]) {
    let calls = 0;
    const ctx = harness(async () => { calls++; return Response.json({ results: found }); });
    await assert.rejects(run(ctx, { ...input, detail: true }), { code: 'SEARCH_NO_RESULTS' });
    assert.equal(calls, 1);
  }
});

test('API errors are bounded codes, with no provider error body or automatic retry', async () => {
  for (const [status, code] of [[401, 'API_KEY_INVALID'], [402, 'API_BALANCE_LOW'], [429, 'API_RATE_LIMITED'], [503, 'API_UNAVAILABLE']]) {
    let calls = 0;
    const ctx = harness(async () => { calls++; return new Response(JSON.stringify({ error: { message: apiKey } }), { status }); });
    await assert.rejects(run(ctx), error => error.code === code && !error.message.includes(apiKey));
    assert.equal(calls, 1);
  }
});

test('stream truncation and malformed frames never report completion', async () => {
  for (const make of [() => sse('Partial answer', ''), () => sse('Truncated', 'length'), () => new Response('data: {broken}\n\n')]) {
    const ctx = harness(async () => make());
    await assert.rejects(run(ctx), error => /^API_RESPONSE_/.test(error.code));
  }
});

test('SSE decoding preserves Unicode and CRLF across arbitrary byte chunks', async () => {
  const bytes = new TextEncoder().encode('data: ' + JSON.stringify({ choices: [{ delta: { content: '中文 🌏' }, finish_reason: 'stop' }] }) + '\r\n\r\n');
  const ctx = harness(async () => new Response(new ReadableStream({ start(controller) { for (const value of bytes) controller.enqueue(Uint8Array.of(value)); controller.close(); } })));
  assert.equal((await run(ctx)).at(-1).text, '中文 🌏');
});

test('abort during search prevents model submission and completion', async () => {
  const controller = new AbortController(); let calls = 0;
  const ctx = harness(async (_, options) => { calls++; return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })); });
  const pending = run(ctx, { ...input, detail: true }, controller.signal);
  controller.abort();
  await assert.rejects(pending, { code: 'CANCELLED' }); assert.equal(calls, 1);
});

test('query obeys the 128 Unicode character limit, including date operators', () => {
  const ctx = harness(async () => {});
  for (const mode of ['news', 'explain']) {
    const query = ctx.DeepSeekAPI.searchQuery({ ...input, mode, term: '🌏'.repeat(500), context: 'a'.repeat(600) });
    assert.ok(Array.from(query).length <= 128); assert.ok(!query.includes('\ufffd'));
  }
});

function event() { const listeners = []; return { addListener: f => listeners.push(f), fire: (...args) => listeners.map(f => f(...args)) }; }
function background(fetch, initial = {}, initialSession = {}, options = {}) {
  const local = { ...initial }, session = { ...initialSession }, opened = [], changed = event(), delivered = [], writes = [];
  const runtime = { id: 'test-extension', getURL: file => 'chrome-extension://test-extension/' + file, onInstalled: event(), onConnect: event(), onMessage: event() };
  const access = {};
  function area(name, values) {
    return {
      setAccessLevel: async level => { if (name === 'session' && options.failSessionAccess) throw new Error('Storage unavailable'); access[name] = level.accessLevel; },
      get: async keys => Object.fromEntries((typeof keys === 'string' ? [keys] : keys).filter(k => k in values).map(k => [k, values[k]])),
      set: async next => { writes.push({ area: name, keys: Object.keys(next) }); const delta = {}; for (const [k, v] of Object.entries(next)) { delta[k] = { oldValue: values[k], newValue: v }; values[k] = v; } changed.fire(delta, name); },
      remove: async keys => { if (name === 'local' && options.failLegacyRemoval) throw new Error('Removal unavailable'); const delta = {}; for (const k of typeof keys === 'string' ? [keys] : keys) if (k in values) { delta[k] = { oldValue: values[k] }; delete values[k]; } if (Object.keys(delta).length) changed.fire(delta, name); }
    };
  }
  const chrome = { runtime, storage: { onChanged: changed, local: area('local', local), session: area('session', session) },
    tabs: { query: async () => options.tabs || [], sendMessage: async (id, message) => delivered.push({ id, message }), create: async arg => { opened.push(arg); } },
    windows: { create: async arg => { opened.push(arg); } } };
  const ctx = vm.createContext({ chrome, fetch, Response, TextDecoder, TextEncoder, URL, Intl, Date, AbortController, setTimeout, clearTimeout, console });
  ctx.importScripts = (...files) => files.forEach(file => vm.runInContext(fs.readFileSync(path.join(source, file), 'utf8'), ctx));
  vm.runInContext(fs.readFileSync(path.join(source, 'background.js'), 'utf8'), ctx);
  const message = (payload, sender) => new Promise(resolve => {
    const accepted = runtime.onMessage.fire(payload, sender, resolve);
    if (!accepted.includes(true)) resolve(undefined);
  });
  return { ctx, chrome, local, session, opened, delivered, writes, message, access: name => access[name] };
}
const welcome = { id: 'test-extension', url: 'chrome-extension://test-extension/welcome.html?edit=1', tab: { id: 1 } };
const reader = { id: 'test-extension', url: 'https://reading.example/article', frameId: 0, tab: { id: 2 } };

test('Welcome verifies one key and stores it only in trusted memory, returning no secret', async () => {
  const requests = [];
  const bg = background(async (url, options) => { requests.push({ url, options }); return Response.json({ data: [{ id: 'deepseek-flash' }] }); });
  const result = await bg.message({ type: 'CONFIGURE_API', apiKey, contextEnabled: false }, welcome);
  assert.equal(result.ok, true); assert.ok(!JSON.stringify(result).includes(apiKey));
  assert.equal(bg.local.apiKey, undefined); assert.equal(bg.session.apiKey, apiKey); assert.equal(bg.local.settings.consent, true); assert.equal(bg.local.settings.contextEnabled, false);
  assert.equal(bg.access('local'), 'TRUSTED_CONTEXTS'); assert.equal(bg.access('session'), 'TRUSTED_CONTEXTS'); assert.ok(!bg.writes.some(write => write.area === 'local' && write.keys.includes('apiKey'))); assert.equal(requests.length, 1); assert.equal(requests[0].url, 'https://api.deepseek.com/models');
  assert.equal(requests[0].options.method, 'GET');
  const prefs = await bg.message({ type: 'GET_SETTINGS' }, reader);
  assert.ok(prefs.settings); assert.ok(!JSON.stringify(prefs).includes(apiKey)); assert.equal(prefs.apiKey, undefined);
});

test('failed key replacement keeps the saved key and preferences', async () => {
  const settings = { consent: true, language: 'zh-CN' };
  const bg = background(async () => new Response('{}', { status: 401 }), { settings }, { apiKey });
  const result = await bg.message({ type: 'CONFIGURE_API', apiKey: 'bad-key-value', contextEnabled: false }, welcome);
  assert.equal(result.code, 'API_KEY_INVALID'); assert.equal(bg.session.apiKey, apiKey); assert.equal(bg.local.apiKey, undefined); assert.equal(bg.local.settings, settings);
});

test('a reading page cannot configure keys or inspect API connection settings', async () => {
  let calls = 0; const bg = background(async () => { calls++; }, {}, { apiKey });
  assert.equal(await bg.message({ type: 'CONFIGURE_API', apiKey: 'attacker-value' }, reader), undefined);
  assert.equal(await bg.message({ type: 'CONNECTION_STATUS' }, reader), undefined);
  assert.equal(calls, 0); assert.equal(bg.session.apiKey, apiKey); assert.equal(bg.local.apiKey, undefined);
});

test('legacy update opens Welcome for missing keys, keeping preferences', async () => {
  const settings = { consent: true, layout: 'C', language: 'zh-CN' };
  const bg = background(async () => {}, { settings });
  bg.chrome.runtime.onInstalled.fire({ reason: 'update' });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(bg.opened.length, 1); assert.equal(bg.opened[0].url, 'chrome-extension://test-extension/welcome.html');
  assert.equal(bg.local.settings, settings);
});

test('a newer lookup aborts the old network task without waiting for its response', async () => {
  const pending = [], bg = background((url, options) => new Promise((resolve, reject) => {
    const call = { url, signal: options.signal, resolve }; pending.push(call);
    options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }), { settings: { consent: true, enabled: true } }, { apiKey });
  const messages = [], port = { name: 'explained-reader', sender: reader, onMessage: event(), onDisconnect: event(), postMessage: m => messages.push(m), disconnect() {} };
  bg.chrome.runtime.onConnect.fire(port);
  port.onMessage.fire({ type: 'LOOKUP', id: 'old', ...input });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(pending.length, 1);
  port.onMessage.fire({ type: 'LOOKUP', id: 'new', ...input });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(pending.length, 2); assert.equal(pending[0].signal.aborted, true);
  pending[1].resolve(sse('New answer'));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(messages.filter(m => m.id === 'new' && m.event === 'complete').length, 1);
  assert.equal(messages.filter(m => m.id === 'old' && m.event === 'complete').length, 0);
});

const toolbar = { id: 'test-extension', url: 'chrome-extension://test-extension/popup.html' };
const tick = () => new Promise(resolve => setTimeout(resolve, 10));

test('every worker start removes a legacy disk key without importing or transmitting it', async () => {
  let calls = 0;
  const settings = { consent: true, language: 'zh-CN', layout: 'C' };
  const bg = background(async () => { calls++; }, { apiKey, settings });
  assert.equal((await bg.message({ type: 'CONNECTION_STATUS' }, toolbar)).status, 'missing');
  assert.equal(bg.local.apiKey, undefined); assert.equal(bg.session.apiKey, undefined);
  assert.equal(bg.local.settings, settings); assert.equal(calls, 0);
});

test('worker suspension preserves the session key, while a new browser session requires re-entry', async () => {
  const settings = { consent: true, language: 'zh-CN' };
  const resumed = background(async () => {}, { settings, apiKey: 'obsolete-disk-key' }, { apiKey });
  assert.equal((await resumed.message({ type: 'CONNECTION_STATUS' }, welcome)).status, 'configured');
  assert.equal(resumed.local.apiKey, undefined); assert.equal(resumed.session.apiKey, apiKey);
  const restarted = background(async () => {}, resumed.local);
  assert.equal((await restarted.message({ type: 'CONNECTION_STATUS' }, welcome)).status, 'missing');
  assert.equal(restarted.local.settings, settings);
});

test('empty API input revalidates only the current session key', async () => {
  let used;
  const bg = background(async (_, options) => { used = options.headers.Authorization; return Response.json({ data: [{ id: 'deepseek-flash' }] }); }, { settings: { consent: true } }, { apiKey });
  assert.equal((await bg.message({ type: 'CONFIGURE_API', apiKey: '', contextEnabled: false }, welcome)).ok, true);
  assert.equal(used, 'Bearer ' + apiKey); assert.equal(bg.local.apiKey, undefined);
  const empty = background(async () => { throw Error('Must not call API'); }, { apiKey });
  assert.equal((await empty.message({ type: 'CONFIGURE_API', apiKey: '' }, welcome)).code, 'API_KEY_REQUIRED');
});

test('session key replacement and removal cancel lookups and send only sanitized notifications', async () => {
  let signal;
  const bg = background((_, options) => { signal = options.signal; return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })); }, { settings: { consent: true, enabled: true } }, { apiKey }, { tabs: [{ id: 2, url: reader.url }] });
  const messages = [], port = { name: 'explained-reader', sender: reader, onMessage: event(), onDisconnect: event(), postMessage: message => messages.push(message), disconnect() {} };
  bg.chrome.runtime.onConnect.fire(port); port.onMessage.fire({ type: 'LOOKUP', id: 'active', ...input }); await tick();
  await bg.chrome.storage.session.set({ apiKey: 'replacement-session-key' }); await tick();
  assert.equal(signal.aborted, true); assert.ok(messages.some(message => message.event === 'cancelled'));
  assert.ok(bg.delivered.some(item => item.message.keyChanged));
  assert.ok(!JSON.stringify(bg.delivered).includes(apiKey)); assert.ok(!JSON.stringify(bg.delivered).includes('replacement-session-key'));
  await bg.chrome.storage.session.remove('apiKey'); await tick();
  assert.equal((await bg.message({ type: 'CONNECTION_STATUS' }, toolbar)).status, 'missing');
  port.onMessage.fire({ type: 'LOOKUP', id: 'without-key', ...input }); await tick();
  assert.ok(messages.some(message => message.id === 'without-key' && message.code === 'API_KEY_REQUIRED'));
});

test('storage restriction or legacy cleanup failure fails closed before key validation', async () => {
  for (const options of [{ failSessionAccess: true }, { failLegacyRemoval: true }]) {
    let calls = 0;
    const bg = background(async () => { calls++; }, { apiKey }, {}, options);
    const reply = await bg.message({ type: 'CONFIGURE_API', apiKey }, welcome);
    assert.equal(reply.code, 'SETTINGS_UNAVAILABLE'); assert.equal(calls, 0); assert.equal(bg.session.apiKey, undefined);
  }
});
