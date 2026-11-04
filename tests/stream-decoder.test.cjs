const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function decoder() {
  const context = vm.createContext({ URL });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../explained-extension/stream-decoder.js'), 'utf8'), context);
  return new context.HighlightStreamDecoder();
}
function feed(parser, frames) {
  const sse = frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join('');
  for (let i = 0; i < sse.length; i += 7) parser.feed(sse.slice(i, i + 7));
  parser.end();
  return JSON.parse(JSON.stringify(parser.state()));
}
test('SEARCH results arriving in incremental and batched patches become sources', () => {
  const parser = decoder();
  const state = feed(parser, [
    { v: { response: { fragments: [{ type: 'SEARCH', results: [], content: null }] } } },
    { p: 'response/fragments/-1/results', o: 'APPEND', v: [{ url: 'https://example.org/a', title: 'Article A', cite_index: 1 }] },
    { v: [{ url: 'https://example.org/b', title: 'Article B', cite_index: 2 }] },
    { p: 'response/fragments', o: 'APPEND', v: [{ type: 'RESPONSE', content: 'Answer.' }] },
    { p: 'response', o: 'BATCH', v: [{ p: 'fragments/-2/results', o: 'APPEND', v: [{ url: 'https://example.org/c', cite_index: 3 }] }, { p: 'status', v: 'FINISHED' }] }
  ]);
  assert.equal(state.text, 'Answer.');
  assert.equal(state.finished, true);
  assert.deepEqual(state.sources.map(s => s.url), ['https://example.org/a', 'https://example.org/b', 'https://example.org/c']);
  assert.deepEqual(state.sources[0].citationIds, ['1']);
});
test('snapshot SEARCH, TOOL_SEARCH and TOOL_OPEN metadata is decoded without promoting prose URLs', () => {
  const state = feed(decoder(), [{ v: { response: { status: 'FINISHED', fragments: [
    { type: 'SEARCH', results: [{ url: 'https://example.org/a', cite_index: 1 }] },
    { type: 'TOOL_SEARCH', results: [{ url: 'https://example.org/b', cite_index: 2 }] },
    { type: 'TOOL_OPEN', result: { url: 'https://example.org/c', cite_index: 3 } },
    { type: 'THINK', content: '{"url":"https://untrusted.example/thought"}' },
    { type: 'RESPONSE', content: '{"url":"https://untrusted.example/prose"}' }
  ] } } }]);
  assert.equal(state.sources.length, 3);
  assert.equal(state.text, '{"url":"https://untrusted.example/prose"}');
});
test('unsafe URLs are rejected and repeated source citation IDs are retained', () => {
  const state = feed(decoder(), [
    { v: { response: { fragments: [{ type: 'TOOL_SEARCH', results: [{ url: 'https://example.org/a', cite_index: 0 }, { url: 'javascript:alert(1)' }, { url: 'https://user:pass@example.org/' }] }] } } },
    { p: 'response/fragments/0/results', o: 'APPEND', v: [{ url: 'https://example.org/a', cite_index: 4 }] }
  ]);
  assert.equal(state.sources.length, 1);
  assert.deepEqual(state.sources[0].citationIds, ['0', '4']);
});
