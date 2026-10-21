const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..', 'explained-extension');
const envelope = biz_data => Response.json({ code: 0, data: { biz_code: 0, biz_data } });
const pause = () => new Promise(resolve => setImmediate(resolve));
async function until(fn) { for (let i = 0; i < 200; i++) { if (fn()) return; await pause(); } throw new Error('Expected event not received'); }
function setup({ login = true, reject = null, hold = false, frames = null } = {}) {
  const calls = [], output = [], listeners = new Set(), runtimeListeners = [];
  const token = 'synthetic-test-value'; // Test-only sentinel; never a real account value.
  let abortCount = 0;
  class FakeWorker {
    constructor() { this.listeners = new Set(); }
    addEventListener(type, fn) { if (type === 'message') this.listeners.add(fn); }
    removeEventListener(type, fn) { this.listeners.delete(fn); }
    terminate() { this.listeners.clear(); }
    postMessage({ job }) { queueMicrotask(() => this.listeners.forEach(fn => fn({ data: { job, answer: 0 } }))); }
  }
  const window = {
    addEventListener: (name, fn) => { if (name === 'message') listeners.add(fn); },
    removeEventListener: (name, fn) => listeners.delete(fn),
    postMessage: data => queueMicrotask(() => [...listeners].forEach(fn => fn({ source: window, origin: 'https://chat.deepseek.com', data }))),
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (reject && url.includes('session')) return new Response('', { status: reject });
      if (url.endsWith('/chat_session/create')) return envelope({ chat_session: { id: 'synthetic-session' } });
      if (url.endsWith('/create_pow_challenge')) return envelope({ challenge: { algorithm: 'DeepSeekHashV1', challenge: 'a'.repeat(64), salt: 'synthetic-salt', signature: 'synthetic-signature', expire_at: Date.now() + 60000, difficulty: 1 } });
      if (!url.endsWith('/completion')) throw new Error('Unexpected endpoint');
      if (hold) return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => { abortCount++; reject(new DOMException('Aborted', 'AbortError')); }, { once: true }));
      const sse = (frames || [{ choices: [{ delta: { content: '水星是行星。' } }], citations: [{ url: 'https://example.org/source', index: 1 }] }, { choices: [{ delta: {}, finish_reason: 'stop' }] }]).map(frame => 'data: ' + JSON.stringify(frame) + '\n\n').join('');
      const bytes = new TextEncoder().encode(sse);
      // Force Chinese UTF-8 and SSE framing to cross arbitrary chunk boundaries.
      return new Response(new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7)); controller.close(); } }), { headers: { 'Content-Type': 'text/event-stream' } });
    }
  };
  const chrome = { runtime: { id: 'test', getURL: p => 'chrome-extension://test/' + p, sendMessage: async message => { output.push(message); }, onMessage: { addListener: fn => runtimeListeners.push(fn) } } };
  const context = vm.createContext({ window, location: { origin: 'https://chat.deepseek.com', href: 'https://chat.deepseek.com/' }, chrome, crypto: globalThis.crypto, document: { visibilityState: 'hidden' }, localStorage: { getItem: () => login ? JSON.stringify({ value: token }) : null }, performance: { now: () => performance.now(), getEntriesByType: () => [] }, URL, Headers, Request, Response, Worker: FakeWorker, Blob, TextEncoder, TextDecoder, AbortController, btoa, setTimeout, clearTimeout, Intl, Date });
  for (const name of ['shared.js', 'stream-decoder.js', 'direct-client.js', 'website-bridge.js']) vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), context);
  const sender = { id: 'test', url: 'chrome-extension://test/background.js' };
  const send = message => new Promise(resolve => runtimeListeners.forEach(fn => fn(message, sender, resolve)));
  const run = (id, mode = 'explain') => send({ type: 'EX_RUN', id, mode, term: 'Mercury', context: 'The planet.', language: 'zh-CN' });
  return { calls, output, run, send, token, get abortCount() { return abortCount; }, setHold: value => { hold = value; }, runtimeListeners };
}
test('direct bridge: three same-origin POSTs, streaming UTF-8, search flags and bounded source relay', async () => {
  const env = setup();
  const status = await env.send({ type: 'EX_PING' });
  assert.equal(status.authenticated, true);
  assert.equal((await env.run('one', 'news')).accepted, true);
  await until(() => env.output.some(m => m.event === 'complete'));
  assert.equal(env.calls.length, 3);
  for (const call of env.calls) { assert.ok(call.url.startsWith('/api/v0/')); assert.equal(call.options.method, 'POST'); assert.equal(call.options.redirect, 'error'); assert.equal(call.options.credentials, 'same-origin'); }
  const completion = env.calls.at(-1);
  const body = JSON.parse(completion.options.body);
  assert.equal(body.search_enabled, true); assert.equal(body.thinking_enabled, false);
  const proof = JSON.parse(atob(completion.options.headers['x-ds-pow-response']));
  assert.equal(proof.answer, 0);
  const result = env.output.find(m => m.event === 'complete');
  assert.equal(result.text, '水星是行星。'); assert.equal(result.sources.length, 1);
  const relay = JSON.stringify(env.output);
  for (const secret of [env.token, 'synthetic-session', 'synthetic-signature', 'synthetic-salt']) assert.ok(!relay.includes(secret), 'No private request material in extension events');
});
test('News bridge relays delayed SEARCH URLs and citation IDs through to story matching', async () => {
  const answer = JSON.stringify({ stories: [{ date: '2026-10-20', summary: 'A development.', sourceUrls: [], sourceCitations: [5] }] });
  const env = setup({ frames: [
    { v: { response: { fragments: [{ type: 'SEARCH', results: [] }] } } },
    { p: 'response/fragments/-1/results', o: 'APPEND', v: [{ url: 'https://example.org/story', title: 'Story', cite_index: 5 }] },
    { p: 'response/fragments', o: 'APPEND', v: [{ type: 'RESPONSE', content: answer }] },
    { p: 'response/status', v: 'FINISHED' }
  ] });
  await env.run('news-sources', 'news');
  await until(() => env.output.some(m => m.event === 'complete'));
  const result = env.output.find(m => m.event === 'complete');
  const context = vm.createContext({ URL, Intl, Date });
  vm.runInContext(fs.readFileSync(path.join(root, 'shared.js'), 'utf8'), context);
  const story = context.Explained.newsResult(result.text, result.sources, new Date('2026-10-21T12:00:00Z')).stories[0];
  assert.equal(story.sources[0].url, 'https://example.org/story');
});
test('direct bridge: missing login and HTTP rejection never retry or switch routes', async () => {
  for (const options of [{ login: false }, { reject: 401 }, { reject: 403 }]) {
    const env = setup(options); await env.run('one'); await until(() => env.output.some(m => m.event === 'error'));
    assert.equal(env.calls.filter(c => c.url.endsWith('/completion')).length, 0);
    assert.equal(env.output.find(m => m.event === 'error').code, options.login === false ? 'LOGIN_REQUIRED' : 'HTTP_REJECTED');
  }
});
test('direct bridge: cancellation aborts network before accepting the next request', async () => {
  const env = setup({ hold: true }); await env.run('one');
  await until(() => env.calls.some(c => c.url.endsWith('/completion')));
  assert.equal((await env.send({ type: 'EX_CANCEL', id: 'one' })).cancelled, true);
  assert.equal(env.abortCount, 1);
  env.setHold(false); await env.run('two'); await until(() => env.output.some(m => m.id === 'two' && m.event === 'complete'));
  assert.equal(env.output.some(m => m.id === 'one' && m.event === 'complete'), false);
});
test('website bridge ignores requests from webpage content-script senders', () => {
  const env = setup();
  let accepted = false;
  for (const fn of env.runtimeListeners) fn({ type: 'EX_RUN' }, { id: 'test', tab: { id: 5 }, url: 'https://evil.example/' }, () => { accepted = true; });
  assert.equal(accepted, false); assert.equal(env.calls.length, 0);
});
